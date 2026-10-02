import { calculateFinancialSnapshot, calculateFinancing, estimateOpportunityCost, finite, nonNegative, positive } from './finance.ts';
import type { ConsumptionResult, ConsumptionScenario, CurrentAsset, FinancialProfile, KeepAssetResult, ScenarioKind } from './types.ts';

export function scenarioKind(s: ConsumptionScenario): ScenarioKind {
  return s.kind ?? (s.ownedAlready ? 'keep_existing' : 'purchase_new');
}

export function calculateConsumption(s: ConsumptionScenario, profile: FinancialProfile): ConsumptionResult {
  const amounts = [
    ['购买价格', s.purchasePrice], ['残值', s.resaleValue], ['年维护费', s.annualMaintenance],
    ['年耗材费', s.annualConsumables], ['年保险订阅费', s.annualInsuranceSubscriptions],
    ['一次性费用', s.oneTimeExtras], ['年使用次数', s.annualUses],
    ['机会成本率', s.opportunityRate], ['旧物市值', s.oldAssetMarketValue ?? 0],
    ['旧物年成本', s.oldAssetAnnualCost ?? 0], ['旧物未来残值', s.oldAssetFutureResale ?? 0],
    ['额外年固定费', s.extraAnnualFixedCosts ?? 0], ['额外年变动费', s.extraAnnualVariableCosts ?? 0],
  ] as const;
  for (const [label, value] of amounts) nonNegative(value, label);
  positive(s.heldYears, '持有年限');
  if (s.usefulLifeYears !== undefined) positive(s.usefulLifeYears, '理论寿命');
  const kind = scenarioKind(s);
  const finance = calculateFinancing(s.purchasePrice, kind === 'keep_existing' ? undefined : s.financing);
  const snapshot = calculateFinancialSnapshot(profile);
  const fixedHoldingAnnual = s.annualMaintenance + s.annualInsuranceSubscriptions + (s.extraAnnualFixedCosts ?? 0);
  const variableUseAnnual = s.annualConsumables + (s.extraAnnualVariableCosts ?? 0);
  const annualOperatingCost = fixedHoldingAnnual + variableUseAnnual;
  const operatingTotal = annualOperatingCost * s.heldYears;
  const baseTco = s.purchasePrice - s.resaleValue + operatingTotal + s.oneTimeExtras;
  const opportunityCost = estimateOpportunityCost(
    s.purchasePrice, s.resaleValue, s.heldYears, s.opportunityRate,
    finance.principal, s.financing?.termMonths ?? 0,
  );
  const financingCost = finance.totalFinancingCost;
  const oldAssetSale = kind === 'purchase_new' && s.sellOldAsset ? (s.oldAssetMarketValue ?? 0) : 0;
  // The old asset is part of starting wealth in BOTH alternatives. Sale proceeds
  // reduce cash needed now, but deducting them from purchase TCO would count
  // that same old value twice when compared with keep_existing.
  const economicTco = baseTco + financingCost + opportunityCost;
  const keepOldEconomicCost = kind === 'purchase_new' && (s.oldAssetMarketValue ?? 0) > 0
    ? (s.oldAssetMarketValue ?? 0) - (s.oldAssetFutureResale ?? 0)
      + (s.oldAssetAnnualCost ?? 0) * s.heldYears
      + estimateOpportunityCost(s.oldAssetMarketValue ?? 0, s.oldAssetFutureResale ?? 0, s.heldYears, s.opportunityRate)
    : null;
  const incrementalVsKeepOld = keepOldEconomicCost === null || !s.sellOldAsset ? null : economicTco - keepOldEconomicCost;
  const totalUses = s.annualUses * s.heldYears;
  finite(baseTco, '基础 TCO');
  finite(economicTco, '经济 TCO');
  finite(totalUses, '总使用次数');
  const initialOutlay = (kind === 'keep_existing' ? 0 : finance.initialPayment) + s.oneTimeExtras;
  const netInitialOutlay = initialOutlay - oldAssetSale;
  const cashAfterPurchase = profile.cash + snapshot.monthlyFreeCashFlow * finance.delayMonths
    - (finance.delayMonths > 0 ? profile.nearTermKnownCommitments : 0) - netInitialOutlay;
  const reserveGap = cashAfterPurchase - profile.minimumReserve;
  const executionCashBase = cashAfterPurchase + netInitialOutlay;
  const fundingGap = Math.max(0, -cashAfterPurchase);
  const reserveShortfall = Math.max(0, -reserveGap);
  const feasibility = cashAfterPurchase < 0 ? 'insufficient_cash'
    : reserveGap < 0 ? 'below_reserve' : 'within_reserve';
  const initialFundingMonths = snapshot.monthlyFreeCashFlow > 0
    ? netInitialOutlay / snapshot.monthlyFreeCashFlow : null;
  const economicCostCashFlowMonths = snapshot.monthlyFreeCashFlow > 0
    ? economicTco / snapshot.monthlyFreeCashFlow : null;
  const costBreakdown = {
    assetCost: s.purchasePrice - s.resaleValue + opportunityCost,
    acquisitionLessResale: s.purchasePrice - s.resaleValue,
    opportunityCost, financingCost, oneTimeExtras: s.oneTimeExtras,
    fixedHoldingAnnual, fixedHoldingTotal: fixedHoldingAnnual * s.heldYears,
    variableUseAnnual, variableUseTotal: variableUseAnnual * s.heldYears,
  };
  finite(cashAfterPurchase, '购买后现金');
  finite(reserveGap, '安全垫差额');
  return {
    scenarioId: s.id, name: s.name, kind, heldYears: s.heldYears, costBreakdown,
    baseTco, opportunityCost, economicTco,
    annualCost: economicTco / s.heldYears,
    monthlyCost: economicTco / (s.heldYears * 12),
    costPerUse: totalUses > 0 ? economicTco / totalUses : null,
    totalUses, annualOperatingCost, financingCost, oldAssetSale, keepOldEconomicCost,
    incrementalVsKeepOld, resaleValue: s.resaleValue,
    initialOutlay, netInitialOutlay,
    freeCashFlowMonths: initialFundingMonths,
    initialFundingMonths, economicCostCashFlowMonths,
    cashAfterPurchase, reserveGap, fundingGap, reserveShortfall, feasibility, executionCashBase,
    lifetimeRealization: s.usefulLifeYears ? s.heldYears / s.usefulLifeYears : null,
    financing: finance,
    details: {
      economicTco: {
        formula: '基础 TCO + 融资成本 + 资金机会成本估算',
        inputs: { 基础TCO: baseTco, 融资成本: financingCost, 资金机会成本: opportunityCost },
        note: kind === 'keep_existing' ? '现有资产按今天可卖的市值计算未来持有成本；这笔价值不作为今天的现金支出。' : '旧物出售回款只改善初始现金占用；与继续持有比较时，不再从经济 TCO 重复扣减。',
      },
      baseTco: {
        formula: '购买价 − 期末残值 + 年持有费 × 年数 + 一次性费用',
        inputs: { 购买价: s.purchasePrice, 期末残值: s.resaleValue, 年持有费: annualOperatingCost, 年数: s.heldYears, 一次性费用: s.oneTimeExtras },
      },
      opportunityCost: {
        formula: '逐月 Σ[max(0, 线性估计市值 − 线性估计未还本金) × 年机会成本率 ÷ 12]',
        inputs: { 初始自有资金占用: Math.max(0, s.purchasePrice - finance.principal), 持有年限: s.heldYears, 期末残值: s.resaleValue, 年机会成本率: s.opportunityRate, 贷款本金: finance.principal, 最终机会成本: opportunityCost },
        note: '这是用于消费决策比较的估算，不是投资收益预测。假设商品价值和贷款本金逐月线性变化；未预测市场回报、税费及月内付款时点。',
      },
      annualCost: { formula: '经济 TCO ÷ 实际持有年数', inputs: { 经济TCO: economicTco, 年数: s.heldYears } },
      monthlyCost: { formula: '经济 TCO ÷ (实际持有年数 × 12)', inputs: { 经济TCO: economicTco, 年数: s.heldYears } },
      costPerUse: { formula: '经济 TCO ÷ (每年使用次数 × 实际持有年数)', inputs: { 经济TCO: economicTco, 年使用次数: s.annualUses, 年数: s.heldYears }, note: totalUses === 0 ? '预计使用次数为 0，无法计算单次成本。' : undefined },
      freeCashFlowMonths: { formula: '净初始现金支出 ÷ 月自由现金流', inputs: { 净初始支出: netInitialOutlay, 月自由现金流: snapshot.monthlyFreeCashFlow }, note: snapshot.monthlyFreeCashFlow <= 0 ? '月自由现金流不大于 0，无法定义占用月数。' : undefined },
      initialFundingMonths: { formula: '净初始现金支出 ÷ 月自由现金流', inputs: { 净初始支出: netInitialOutlay, 月自由现金流: snapshot.monthlyFreeCashFlow }, note: '衡量当下资金占用，不代表整个持有期的经济财富消耗。' },
      economicCostCashFlowMonths: { formula: '整个分析周期经济 TCO ÷ 月自由现金流', inputs: { 经济TCO: economicTco, 月自由现金流: snapshot.monthlyFreeCashFlow }, note: '这是经济资源消耗的现金流等价月数，不是现在需要支付的金额。' },
      fundingGap: { formula: 'max(0, 净初始现金支出 − 执行时可用现金)', inputs: { 净初始支出: netInitialOutlay, 执行时可用现金: executionCashBase } },
      reserveShortfall: { formula: 'max(0, 最低安全垫 − 购买后剩余现金)', inputs: { 最低安全垫: profile.minimumReserve, 购买后剩余现金: cashAfterPurchase } },
      reserveGap: { formula: '购买后剩余现金 − 最低安全垫', inputs: { 购买后剩余现金: cashAfterPurchase, 最低安全垫: profile.minimumReserve } },
      cashAfterPurchase: { formula: '现有现金 + 月自由现金流 × 延迟月数 − 延迟期间已知近期刚性支出 − 净初始现金支出', inputs: { 现有现金: profile.cash, 月自由现金流: snapshot.monthlyFreeCashFlow, 延迟月数: finance.delayMonths, 近期刚性支出: finance.delayMonths > 0 ? profile.nearTermKnownCommitments : 0, 净初始支出: netInitialOutlay }, note: finance.delayMonths > 0 ? '延期估算假设收入、支出和价格不变，并将近期已知刚性支出计入。' : undefined },
      financingCost: { formula: '融资方案商品价 − 现金价 + 总利息 + 手续费', inputs: { 融资方案商品价: finance.financedPrice, 现金价: s.purchasePrice, 总利息: finance.totalFinancingCost - finance.pricePremium - (finance.mode === 'cash' || finance.mode === 'delay' ? 0 : (s.financing?.fees ?? 0)), 手续费: finance.mode === 'cash' || finance.mode === 'delay' ? 0 : (s.financing?.fees ?? 0) }, note: '即使标称 0 利率，价格差仍计入融资成本。' },
      lifetimeRealization: { formula: '预计实际持有年数 ÷ 理论可用寿命', inputs: { 实际持有年数: s.heldYears, 理论可用寿命: s.usefulLifeYears ?? 0 }, note: '超过 100% 仅表示计划持有时间超过填入的理论寿命。' },
    },
  };
}

export function calculateKeepAsset(asset: CurrentAsset): KeepAssetResult {
  for (const [key, value] of Object.entries(asset)) {
    if (typeof value === 'number') nonNegative(value, key);
  }
  positive(asset.furtherYears, '继续持有年数');
  const futureOpportunityCost = estimateOpportunityCost(
    asset.marketValueNow, asset.futureResaleValue, asset.furtherYears, asset.opportunityRate,
  );
  const futureEconomicCost = asset.marketValueNow - asset.futureResaleValue
    + asset.annualKeepingCost * asset.furtherYears + futureOpportunityCost;
  const uses = asset.annualUses * asset.furtherYears;
  return {
    historicalPrice: asset.originalPrice,
    cashAvailableIfSoldNow: asset.marketValueNow,
    foregoneSaleProceeds: asset.marketValueNow,
    futureEconomicCost,
    futureOpportunityCost,
    futureCostPerUse: uses > 0 ? futureEconomicCost / uses : null,
  };
}

export function incrementalCost(base: ConsumptionResult, candidate: ConsumptionResult): number {
  if (Math.abs(base.heldYears - candidate.heldYears) > 1e-9) {
    throw new RangeError('当前方案覆盖周期不同，总TCO不可直接比较');
  }
  return candidate.economicTco - base.economicTco;
}

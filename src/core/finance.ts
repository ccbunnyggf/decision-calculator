import type { FinancialProfile, FinancialSnapshot, Financing, FinancingResult } from './types.ts';

export function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} 必须是有限数字`);
  return value;
}

export function nonNegative(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} 不能为负数`);
  return value;
}

export function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} 必须大于 0`);
  return value;
}

export function calculateFinancialSnapshot(profile: FinancialProfile): FinancialSnapshot {
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'number') nonNegative(value, key);
  }
  const monthlyFreeCashFlow = profile.monthlyIncome - profile.monthlyEssentials
    - profile.monthlyDebt - profile.monthlySaving - profile.monthlyKnownCommitments;
  const allocatableCash = profile.cash - profile.minimumReserve - profile.nearTermKnownCommitments;
  const essentialMonthly = profile.monthlyEssentials + profile.monthlyDebt + profile.monthlyKnownCommitments;
  finite(monthlyFreeCashFlow, '月自由现金流');
  finite(allocatableCash, '可配置资本');
  finite(essentialMonthly, '必要开支合计');
  return {
    monthlyFreeCashFlow,
    allocatableCash,
    monthsOfEssentialCoverage: essentialMonthly > 0 ? profile.cash / essentialMonthly : null,
  };
}

export function calculateFinancing(cashPrice: number, plan?: Financing): FinancingResult {
  nonNegative(cashPrice, '现金价格');
  const mode = plan?.mode ?? 'cash';
  const financedPrice = mode === 'cash' || mode === 'delay' ? cashPrice : (plan?.financedPrice ?? cashPrice);
  nonNegative(financedPrice, '融资方案商品价');
  const downPayment = mode === 'cash' || mode === 'delay' ? cashPrice : (plan?.downPayment ?? 0);
  nonNegative(downPayment, '首付');
  if (downPayment > financedPrice) throw new RangeError('首付不能高于融资方案商品价');
  const noBorrowing = mode === 'cash' || mode === 'delay';
  const totalInterest = nonNegative(noBorrowing ? 0 : (plan?.totalInterest ?? 0), '总利息');
  const fees = nonNegative(noBorrowing ? 0 : (plan?.fees ?? 0), '手续费');
  const upfrontFees = nonNegative(noBorrowing ? 0 : (plan?.upfrontFees ?? 0), '前付手续费');
  if (upfrontFees > fees) throw new RangeError('前付手续费不能高于总手续费');
  const termMonths = nonNegative(noBorrowing ? 0 : (plan?.termMonths ?? 0), '期数');
  const delayMonths = nonNegative(mode === 'delay' ? (plan?.delayMonths ?? 0) : 0, '延迟月数');
  if (!Number.isInteger(termMonths) || !Number.isInteger(delayMonths)) throw new RangeError('期数和延迟月数须为整数');
  const principal = financedPrice - downPayment;
  const pricePremium = financedPrice - cashPrice;
  const totalFinancingCost = pricePremium + totalInterest + fees;
  finite(totalFinancingCost, '总融资成本');
  if (principal + totalInterest + fees - upfrontFees > 0 && termMonths === 0 && mode !== 'cash' && mode !== 'delay') {
    throw new RangeError('分期金额大于 0 时需要输入期数');
  }
  const derivedMonthlyPayment = termMonths > 0
    ? (principal + totalInterest + fees - upfrontFees) / termMonths : 0;
  const disclosedMonthlyPayment = noBorrowing || plan?.monthlyPayment === undefined ? null
    : nonNegative(plan.monthlyPayment, '填写月供');
  const paymentMismatch = disclosedMonthlyPayment === null ? null
    : disclosedMonthlyPayment * termMonths - (principal + totalInterest + fees - upfrontFees);
  return {
    mode, financedPrice, principal, pricePremium, totalFinancingCost,
    initialPayment: downPayment + upfrontFees,
    derivedMonthlyPayment, disclosedMonthlyPayment, paymentMismatch, delayMonths,
  };
}

/** Simple monthly capital-tied estimate. Book value and loan balance decline linearly. */
export function estimateOpportunityCost(
  purchasePrice: number, resaleValue: number, heldYears: number,
  annualRate: number, principal = 0, termMonths = 0,
): number {
  nonNegative(purchasePrice, '购买价格');
  nonNegative(resaleValue, '残值');
  positive(heldYears, '持有年限');
  if (heldYears > 100) throw new RangeError('持有年限超过 100 年，请缩小计算范围');
  nonNegative(annualRate, '机会成本率');
  nonNegative(principal, '贷款本金');
  const durationMonths = heldYears * 12;
  const months = Math.ceil(durationMonths);
  let cost = 0;
  for (let month = 0; month < months; month++) {
    const fraction = month / durationMonths;
    const step = Math.min(1, durationMonths - month);
    const bookValue = purchasePrice + (resaleValue - purchasePrice) * fraction;
    const balance = termMonths > 0 ? principal * Math.max(0, 1 - month / termMonths) : 0;
    cost += Math.max(0, bookValue - balance) * annualRate * step / 12;
  }
  return finite(cost, '资金机会成本');
}

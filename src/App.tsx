import { useEffect, useMemo, useState } from 'react';
import { BarChart, DetailModal, InfoTip, LineChart, Metric, NumberField, OptionalPercentField, PageHeader, PercentField, Section, SelectField, TcoComposition, TextField, num, yuan } from './components.tsx';
import { calculateFinancialSnapshot } from './core/finance.ts';
import { calculateConsumption, calculateKeepAsset, incrementalCost, scenarioKind } from './core/consumption.ts';
import { calculateTransport } from './core/transport.ts';
import { calculateBoundary, parameterSensitivity, priceSensitivity } from './core/boundary.ts';
import type { CarScenario, ConsumptionScenario, CurrentAsset, ExperienceDimension, ExperienceScores, FinancialProfile, Financing, FormulaDetail, Rating, TransportAlternative } from './core/types.ts';
import { defaultState, loadState, saveState, type AppState } from './state.ts';
import { Sidebar } from './Sidebar.tsx';
import { nav, type Page } from './navigation.ts';
import { CashLayers } from './DashboardVisuals.tsx';
import { priceHourlyPoints, timeChartPoints } from './chartData.ts';
import { HomePage } from './HomePage.tsx';
import { LandingPage } from './LandingPage.tsx';
import { trackLandingEnter, trackModuleOpen } from './analytics.ts';


function attempt<T>(fn: () => T): { data: T | null; error: string | null } {
  try { return { data: fn(), error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error.message : '输入无效' }; }
}

function ErrorNotice({ message }: { message: string | null }) {
  return message ? <div className="error-notice" role="alert">请检查输入：{message}</div> : null;
}

function ScenarioForm({ value, onChange, title = '方案参数' }: {
  value: ConsumptionScenario; onChange: (value: ConsumptionScenario) => void; title?: string;
}) {
  const change = (key: keyof ConsumptionScenario, n: number | string | boolean) => onChange({ ...value, [key]: n });
  const isKeep = scenarioKind(value) === 'keep_existing';
  const financing: Financing = value.financing ?? { mode: 'cash' };
  const changeFinance = (key: keyof Financing, v: string | number) => onChange({ ...value, financing: { ...financing, [key]: v } });
  return <div className="form-block">
    <h3>{title}</h3>
    <div className="form-grid">
      <TextField label="名称" value={value.name} onChange={v => change('name', v)} />
      <NumberField label={isKeep ? '现有资产当前可变现市值' : '现金购买价'} value={value.purchasePrice} onChange={v => change('purchasePrice', v)} />
      <NumberField label="预计实际持有" value={value.heldYears} onChange={v => change('heldYears', v)} unit="年" />
      <NumberField label="期末出售残值" value={value.resaleValue} onChange={v => change('resaleValue', v)} />
      <NumberField label="每年使用次数" value={value.annualUses} onChange={v => change('annualUses', v)} unit="次" />
    </div>
    <SelectField label="方案类型" value={scenarioKind(value)} onChange={v => onChange({ ...value, kind: v as ConsumptionScenario['kind'], ownedAlready: v === 'keep_existing' })} options={[{ value: 'purchase_new', label: '购买新设备' }, { value: 'keep_existing', label: '继续持有' }]} />
    {isKeep && <p className="note">继续持有按今天可变现市值计算未来经济成本；历史购买价属于沉没成本。</p>}
    <details className="disclosure"><summary>持有成本与寿命</summary><div className="form-grid">
      <PercentField label="资金机会成本率" value={value.opportunityRate} onChange={v => change('opportunityRate', v)} />
      <NumberField label="每年维护" value={value.annualMaintenance} onChange={v => change('annualMaintenance', v)} />
      <NumberField label="每年耗材" value={value.annualConsumables} onChange={v => change('annualConsumables', v)} />
      <NumberField label="每年保险 / 订阅" value={value.annualInsuranceSubscriptions} onChange={v => change('annualInsuranceSubscriptions', v)} />
      <NumberField label="一次性附加费用" value={value.oneTimeExtras} onChange={v => change('oneTimeExtras', v)} />
      <NumberField label="理论可用寿命" value={value.usefulLifeYears ?? 0} onChange={v => change('usefulLifeYears', v)} unit="年" hint="填 0 表示暂不估算" />
    </div><p className="note">资金机会成本率表示其他用途可能获得的年化收益假设；可用不同利率做敏感性测试。</p></details>
    {!isKeep && <details className="disclosure"><summary>融资方式与月现金流</summary>
      <div className="form-grid">
        <SelectField label="付款方式" value={financing.mode} onChange={v => changeFinance('mode', v)} options={[
          { value: 'cash', label: '全款' }, { value: 'loan', label: '贷款' }, { value: 'installment', label: '分期' },
          { value: 'family', label: '家庭借款' }, { value: 'delay', label: '延迟购买' },
        ]} />
        {financing.mode === 'delay' && <NumberField label="延迟购买" value={financing.delayMonths ?? 0} onChange={v => changeFinance('delayMonths', v)} unit="月" />}
        {financing.mode !== 'cash' && financing.mode !== 'delay' && <>
          <NumberField label="融资方案商品价" value={financing.financedPrice ?? value.purchasePrice} onChange={v => changeFinance('financedPrice', v)} hint="与现金价的差额计入隐含融资成本" />
          <NumberField label="首付" value={financing.downPayment ?? 0} onChange={v => changeFinance('downPayment', v)} />
          <NumberField label="总利息" value={financing.totalInterest ?? 0} onChange={v => changeFinance('totalInterest', v)} />
          <NumberField label="总手续费" value={financing.fees ?? 0} onChange={v => changeFinance('fees', v)} />
          <NumberField label="前付手续费" value={financing.upfrontFees ?? 0} onChange={v => changeFinance('upfrontFees', v)} />
          <NumberField label="期数" value={financing.termMonths ?? 0} onChange={v => changeFinance('termMonths', v)} unit="月" />
          <NumberField label="合同月供（可选）" value={financing.monthlyPayment ?? 0} onChange={v => changeFinance('monthlyPayment', v)} />
          <label className="checkbox-field"><input type="checkbox" checked={financing.cashDiscountAvailable ?? false} onChange={e => onChange({ ...value, financing: { ...financing, cashDiscountAvailable: e.target.checked } })} />存在现金价优惠</label>
          <label className="checkbox-field"><input type="checkbox" checked={financing.advertisedZeroRate ?? false} onChange={e => onChange({ ...value, financing: { ...financing, advertisedZeroRate: e.target.checked } })} />宣传为零利率</label>
        </>}
      </div>
      <p className="note">零利率仍可能存在现金价与分期价的差额。月供与总付款不一致时会提示核对。</p>
    </details>}
    {!isKeep && <details className="disclosure"><summary>现有旧物与出售回款</summary><div className="form-grid">
      <NumberField label="旧物当前市场价值" value={value.oldAssetMarketValue ?? 0} onChange={v => change('oldAssetMarketValue', v)} />
      <NumberField label="旧物继续持有年成本" value={value.oldAssetAnnualCost ?? 0} onChange={v => change('oldAssetAnnualCost', v)} />
      <NumberField label="旧物未来出售残值" value={value.oldAssetFutureResale ?? 0} onChange={v => change('oldAssetFutureResale', v)} />
      <label className="checkbox-field"><input type="checkbox" checked={value.sellOldAsset ?? false} onChange={e => change('sellOldAsset', e.target.checked)} />出售旧物并将回款计入初始现金</label>
    </div><p className="note">旧物出售回款只减少初始现金占用；经济 TCO 不重复扣除旧物市值。继续持有按当前市值衡量机会成本。</p></details>}
  </div>;
}

const experienceNames: ExperienceDimension[] = [
  { key: 'comfort', label: '舒适度', direction: 'positive' }, { key: 'flexibility', label: '灵活性', direction: 'positive' },
  { key: 'privacy', label: '隐私', direction: 'positive' }, { key: 'fatigue', label: '疲劳', direction: 'negative' },
  { key: 'crowding', label: '拥挤程度', direction: 'negative' }, { key: 'parkingDifficulty', label: '停车麻烦', direction: 'negative' },
  { key: 'weatherExposure', label: '天气暴露', direction: 'negative' }, { key: 'drivingStress', label: '驾驶压力', direction: 'negative' },
  { key: 'readingOpportunity', label: '可阅读 / 学习时间', direction: 'positive' }, { key: 'accidentExposure', label: '事故风险暴露', direction: 'negative' },
];

function ExperienceEditor({ title, scores, onChange }: { title: string; scores: ExperienceScores; onChange: (s: ExperienceScores) => void }) {
  return <div className="experience-column"><h3>{title}</h3>{experienceNames.map(({ key, label, direction }) => <label key={key} className="score-row"><span>{label} <small>({direction === 'positive' ? '高分更好' : '高分负担更重'})</small></span><select value={scores[key] ?? ''} onChange={e => onChange({ ...scores, [key]: e.target.value ? Number(e.target.value) as Rating : undefined })}>
    <option value="">未评价</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}
  </select></label>)}</div>;
}

function FinancePage({ profile, onChange, onOpen }: { profile: FinancialProfile; onChange: (p: FinancialProfile) => void; onOpen: (label: string, d: FormulaDetail) => void }) {
  const result = attempt(() => calculateFinancialSnapshot(profile));
  const set = (key: keyof FinancialProfile, value: number | boolean) => onChange({ ...profile, [key]: value });
  const reserveBase = profile.monthlyEssentials + profile.monthlyDebt + profile.monthlyKnownCommitments;
  const reserveMonths = reserveBase > 0 ? profile.minimumReserve / reserveBase : null;
  return <>
    <PageHeader number="01" title="个人财务" description="看清当前现金、自由现金流与设定的安全垫。" />
    <ErrorNotice message={result.error} />
    {result.data && <Section title="当前财务状态" eyebrow="现金与安全空间" number={1}><div className="metric-grid lead-metrics">
      <Metric label="当前可用现金" value={yuan(profile.cash)} onOpen={onOpen} detail={{ formula: '用户填入的当前可支配现金', inputs: { 当前现金: profile.cash } }} tone="accent" />
      <Metric label="月自由现金流" value={yuan(result.data.monthlyFreeCashFlow)} onOpen={onOpen} detail={{ formula: '税后收入 − 必要支出 − 固定债务 − 固定储蓄投资 − 已知月度刚性支出', inputs: { 税后收入: profile.monthlyIncome, 必要支出: profile.monthlyEssentials, 固定债务: profile.monthlyDebt, 固定储蓄投资: profile.monthlySaving, 月度刚性支出: profile.monthlyKnownCommitments } }} />
      <Metric label="最低安全垫" value={yuan(profile.minimumReserve)} onOpen={onOpen} detail={{ formula: '用户设定的最低现金安全垫', inputs: { 最低安全垫: profile.minimumReserve }, note: '这是用户输入的边界，模型不替你选择金额。' }} />
      <Metric label="可自由配置资本" value={yuan(result.data.allocatableCash)} onOpen={onOpen} detail={{ formula: '可支配现金 − 最低安全垫 − 近期已知刚性支出', inputs: { 可支配现金: profile.cash, 最低安全垫: profile.minimumReserve, 近期刚性支出: profile.nearTermKnownCommitments } }} tone={result.data.allocatableCash < 0 ? 'warn' : undefined} />
    </div><p className="note">必要开支覆盖 {result.data.monthsOfEssentialCoverage === null ? '—' : `${num(result.data.monthsOfEssentialCoverage)} 个月`}。这个月数只描述流动性，不是购买结论。</p></Section>}
    {result.data && <Section title="现金怎么分层" eyebrow="当前现金 − 计划性支出 − 安全垫" number={2}><CashLayers cash={profile.cash} planned={profile.nearTermKnownCommitments} reserve={profile.minimumReserve} allocatable={result.data.allocatableCash} /></Section>}
    <Section title="调整财务输入" eyebrow="修改后结果立即更新" number={3}><div className="form-grid">
      <NumberField label="当前可支配现金" value={profile.cash} onChange={v => set('cash', v)} />
      <NumberField label="月税后收入" value={profile.monthlyIncome} onChange={v => set('monthlyIncome', v)} />
      <NumberField label="月必要支出" value={profile.monthlyEssentials} onChange={v => set('monthlyEssentials', v)} />
      <NumberField label="最低安全垫" value={profile.minimumReserve} onChange={v => set('minimumReserve', v)} hint={reserveMonths === null ? '必要开支为 0，无法换算为月份。' : `约相当于 ${num(reserveMonths)} 个月必要开支；金额由你设定。`} />
    </div><details className="disclosure"><summary>高级财务输入</summary><div className="form-grid">
      <NumberField label="月固定债务" value={profile.monthlyDebt} onChange={v => set('monthlyDebt', v)} />
      <NumberField label="月固定储蓄 / 投资" value={profile.monthlySaving} onChange={v => set('monthlySaving', v)} />
      <NumberField label="已知月度刚性支出" value={profile.monthlyKnownCommitments} onChange={v => set('monthlyKnownCommitments', v)} />
      <NumberField label="近期已知一次性刚性支出" value={profile.nearTermKnownCommitments} onChange={v => set('nearTermKnownCommitments', v)} />
      <NumberField label="其他流动资产" value={profile.otherLiquidAssets} onChange={v => set('otherLiquidAssets', v)} hint="仅记录，不自动视为当前现金。" />
      <label className="checkbox-field"><input type="checkbox" checked={profile.externalEmergencySupport} onChange={e => set('externalEmergencySupport', e.target.checked)} />存在家庭等紧急支持</label>
    </div><p className="note">收入中断概率尚无可靠输入模型；可手动调整月收入做情景测试。<InfoTip text="资金机会成本率是其他用途可能获得的年化收益假设；不确定时可用 0%、3%、5% 查看敏感性。" /></p></details></Section>
  </>;
}

function ConsumptionPage({ scenario, profile, onChange, asset, onAssetChange, onOpen }: {
  scenario: ConsumptionScenario; profile: FinancialProfile; onChange: (s: ConsumptionScenario) => void;
  asset: CurrentAsset; onAssetChange: (a: CurrentAsset) => void; onOpen: (label: string, d: FormulaDetail) => void;
}) {
  const result = attempt(() => calculateConsumption(scenario, profile));
  const kept = attempt(() => calculateKeepAsset(asset));
  const setAsset = (key: keyof CurrentAsset, value: number | string) => onAssetChange({ ...asset, [key]: value });
  const r = result.data;
  return <>
    <PageHeader number="02" title="消费计算" description="计算单个商品在使用周期内的经济成本与资金占用。" />
    <ErrorNotice message={result.error} />
    <div className="consumption-workbench"><Section title="选择商品与使用场景" eyebrow="先填基础信息" number={1}><ScenarioForm value={scenario} onChange={onChange} /></Section>
    {r && <>
      <Section title="核心结果" eyebrow="基于当前输入实时计算" number={2}>
      <div className="metric-grid lead-metrics">
        <Metric label="经济 TCO" value={yuan(r.economicTco)} detail={r.details.economicTco} onOpen={onOpen} tone="accent" />
        <Metric label="年均成本" value={yuan(r.annualCost)} detail={r.details.annualCost} onOpen={onOpen} />
        <Metric label="月均成本" value={yuan(r.monthlyCost)} detail={r.details.monthlyCost} onOpen={onOpen} />
        <Metric label="单次使用成本" value={yuan(r.costPerUse)} detail={r.details.costPerUse} onOpen={onOpen} />
        <Metric label="初始现金占用" value={yuan(r.netInitialOutlay)} detail={{ formula: '初始现金支出 − 旧物出售回款', inputs: { 初始现金支出: r.initialOutlay, 旧物出售回款: r.oldAssetSale } }} onOpen={onOpen} />
        <Metric label="资金机会成本 · 估算" value={yuan(r.opportunityCost)} detail={r.details.opportunityCost} onOpen={onOpen} />
      </div>
      <details className="disclosure"><summary>展开资金流、安全垫与其他指标</summary><div className="metric-grid compact-metrics">
        <Metric label="初始资金占用月数" value={r.initialFundingMonths === null ? '—' : `${num(r.initialFundingMonths)} 月`} detail={r.details.initialFundingMonths} onOpen={onOpen} />
        <Metric label="经济成本对应自由现金流月数" value={r.economicCostCashFlowMonths === null ? '—' : `${num(r.economicCostCashFlowMonths)} 月`} detail={r.details.economicCostCashFlowMonths} onOpen={onOpen} />
        <Metric label="购买后安全垫差额" value={yuan(r.reserveGap)} detail={r.details.reserveGap} onOpen={onOpen} tone={r.reserveGap < 0 ? 'warn' : undefined} />
        <Metric label="融资成本" value={yuan(r.financingCost)} detail={r.details.financingCost} onOpen={onOpen} />
        <Metric label="期末残值" value={yuan(r.resaleValue)} detail={{ formula: '用户填写的预计出售残值', inputs: { 预计残值: r.resaleValue } }} onOpen={onOpen} />
        <Metric label="购买后剩余现金" value={yuan(r.cashAfterPurchase)} detail={r.details.cashAfterPurchase} onOpen={onOpen} />
        <Metric label="寿命兑现率" value={r.lifetimeRealization === null ? '—' : `${num(r.lifetimeRealization * 100)}%`} detail={r.details.lifetimeRealization} onOpen={onOpen} />
        <Metric label="月现金流压力" value={yuan(r.financing.derivedMonthlyPayment)} detail={{ formula: '(融资本金 + 总利息 + 后付手续费) ÷ 期数', inputs: { 融资本金: r.financing.principal, 总融资成本: r.financing.totalFinancingCost, 期数: scenario.financing?.termMonths ?? 0 }, note: '若填写的合同月供与推算月供不同，请核对合同。' }} onOpen={onOpen} />
      </div></details>
      <div className={r.feasibility === 'within_reserve' ? 'status-notice' : 'error-notice'}>{r.feasibility === 'insufficient_cash' ? `当前现金不足以执行该支付方案；资金缺口 ${yuan(r.fundingGap)}。` : r.feasibility === 'below_reserve' ? `购买可以执行，但会跌破设定安全垫；安全垫缺口 ${yuan(r.reserveShortfall)}。` : '当前现金条件下可执行，并保持设定安全垫。'}</div>
      {r.keepOldEconomicCost !== null && <div className="metric-grid compact-metrics">
        <Metric label="继续持有旧物的经济成本" value={yuan(r.keepOldEconomicCost)} onOpen={onOpen} detail={{ formula: '旧物当前市值 − 未来残值 + 年继续持有费 × 年数 + 旧物机会成本估算', inputs: { 当前市值: scenario.oldAssetMarketValue ?? 0, 未来残值: scenario.oldAssetFutureResale ?? 0, 年继续持有费: scenario.oldAssetAnnualCost ?? 0, 年数: scenario.heldYears }, note: '假设旧物市值与贷款模型一样按月线性变化。' }} />
        {r.incrementalVsKeepOld !== null && <Metric label="相对继续持有的增量成本" value={yuan(r.incrementalVsKeepOld)} onOpen={onOpen} detail={{ formula: '出售旧物并购买新物方案的经济 TCO − 继续持有旧物的经济成本', inputs: { 购买方案经济TCO: r.economicTco, 继续持有旧物经济成本: r.keepOldEconomicCost } }} />}
      </div>}
      {r.financing.paymentMismatch !== null && Math.abs(r.financing.paymentMismatch) > 1 && <div className="error-notice">合同月供累计金额与输入的融资总付款相差 {yuan(r.financing.paymentMismatch)}。请核对手续费、尾款或还款计划。</div>}
      {scenario.financing?.advertisedZeroRate && r.financingCost !== 0 && <p className="note">标称零利率，但融资方案与现金价价差、利息或手续费使总融资成本为 {yuan(r.financingCost)}。</p>}
      </Section>
    </>}
    </div>
    {r && <Section title="成本构成与年份变化" eyebrow="真实输入生成的图表" number={3}><div className="charts-grid"><TcoComposition items={[
        { label: '购买减残值', value: r.costBreakdown.acquisitionLessResale },
        { label: '固定持有成本', value: r.costBreakdown.fixedHoldingTotal },
        { label: '可变使用成本', value: r.costBreakdown.variableUseTotal },
        { label: '一次性费用', value: scenario.oneTimeExtras },
        { label: '融资成本', value: r.financingCost },
        { label: '机会成本', value: r.opportunityCost },
      ]} />
      <LineChart title="持有年份 → 年均成本" xLabel="持有年数" yLabel="年均成本" points={Array.from({ length: Math.max(3, Math.min(12, Math.ceil(scenario.heldYears) + 2)) }, (_, i) => {
        const years = i + 1;
        const x = attempt(() => calculateConsumption({ ...scenario, heldYears: years }, profile));
        return { x: years, y: x.data?.annualCost ?? null };
      })} currentX={scenario.heldYears} xUnit="年" yUnit="元/年" /></div>
      <p className="note">通用消费的持有年份曲线固定当前期末残值，仅供查看年均成本变化；不同年份的总 TCO 不可直接比较。</p>
    </Section>}
    <Section title="持有还是出售" eyebrow="当前资产" number={4}><p className="muted">历史价格只供记录。继续持有意味着放弃今天卖掉它的现金。</p>
      <div className="form-grid">
        <TextField label="资产名称" value={asset.name} onChange={v => setAsset('name', v)} />
        <NumberField label="历史购买价" value={asset.originalPrice} onChange={v => setAsset('originalPrice', v)} />
        <NumberField label="今天的市场价值" value={asset.marketValueNow} onChange={v => setAsset('marketValueNow', v)} />
        <NumberField label="未来出售残值" value={asset.futureResaleValue} onChange={v => setAsset('futureResaleValue', v)} />
        <NumberField label="继续持有年数" value={asset.furtherYears} onChange={v => setAsset('furtherYears', v)} unit="年" />
        <NumberField label="年继续持有成本" value={asset.annualKeepingCost} onChange={v => setAsset('annualKeepingCost', v)} />
        <NumberField label="每年使用次数" value={asset.annualUses} onChange={v => setAsset('annualUses', v)} unit="次" />
        <PercentField label="机会成本率" value={asset.opportunityRate} onChange={v => setAsset('opportunityRate', v)} />
      </div>
      <ErrorNotice message={kept.error} />
      {kept.data && <><div className="metric-grid compact-metrics">
        <Metric label="现在出售可得现金" value={yuan(kept.data.cashAvailableIfSoldNow)} onOpen={onOpen} detail={{ formula: '当前二手市场价值', inputs: { 当前市场价值: asset.marketValueNow } }} />
        <Metric label="继续持有的未来经济成本" value={yuan(kept.data.futureEconomicCost)} onOpen={onOpen} detail={{ formula: '当前市值 − 未来残值 + 后续持有费 + 当前市值占用的机会成本', inputs: { 当前市值: asset.marketValueNow, 未来残值: asset.futureResaleValue, 后续持有费: asset.annualKeepingCost * asset.furtherYears, 机会成本估算: kept.data.futureOpportunityCost }, note: '历史买价属于沉没成本，不进入继续持有计算。' }} />
      </div><div className="reflection">如果今天你手上是 {yuan(asset.marketValueNow)} 现金，而不是这件商品，你是否仍愿意用这笔钱把它买回来？</div></>}
    </Section>
  </>;
}

function ScenarioCard({ scenario, index, baseline, onBaseline, onChange, onRemove, canRemove }: {
  scenario: ConsumptionScenario; index: number; baseline: boolean; onBaseline: () => void;
  onChange: (s: ConsumptionScenario) => void; onRemove: () => void; canRemove: boolean;
}) {
  const set = (key: keyof ConsumptionScenario, value: number | string) => onChange({ ...scenario, [key]: value });
  return <article className={`scenario-card scenario-${index}`}>
    <div className="scenario-card-head"><span className="scenario-letter">{String.fromCharCode(65 + index)}</span><strong>方案 {String.fromCharCode(65 + index)}</strong><label><input type="radio" name="comparison-baseline" checked={baseline} onChange={onBaseline} />基准</label></div>
    <div className="scenario-card-fields"><TextField label="名称" value={scenario.name} onChange={v => set('name', v)} />
      <SelectField label="类型" value={scenarioKind(scenario)} onChange={v => onChange({ ...scenario, kind: v as ConsumptionScenario['kind'], ownedAlready: v === 'keep_existing' })} options={[{ value: 'purchase_new', label: '购买新设备' }, { value: 'keep_existing', label: '继续持有' }]} />
      <NumberField label={scenarioKind(scenario) === 'keep_existing' ? '当前市值' : '购买价格'} value={scenario.purchasePrice} onChange={v => set('purchasePrice', v)} />
      <NumberField label="使用年限" value={scenario.heldYears} onChange={v => set('heldYears', v)} unit="年" min={0.01} />
      <NumberField label="期末残值" value={scenario.resaleValue} onChange={v => set('resaleValue', v)} />
      <NumberField label="每年使用次数" value={scenario.annualUses} onChange={v => set('annualUses', v)} unit="次" /></div>
    {canRemove && <button className="scenario-remove" onClick={onRemove}>移除此方案</button>}
  </article>;
}

function ComparisonPage({ scenarios, profile, analysisHorizonYears, experienceDimensions, onHorizonChange, onDimensionsChange, onChange, onOpen }: {
  scenarios: ConsumptionScenario[]; profile: FinancialProfile; onChange: (s: ConsumptionScenario[]) => void;
  analysisHorizonYears: number; experienceDimensions: string[]; onHorizonChange: (n: number) => void; onDimensionsChange: (v: string[]) => void;
  onOpen: (label: string, d: FormulaDetail) => void;
}) {
  const [baseId, setBaseId] = useState(scenarios[0]?.id ?? '');
  const [editingId, setEditingId] = useState(scenarios[0]?.id ?? '');
  const selectedBaseId = scenarios.some(s => s.id === baseId) ? baseId : scenarios[0]?.id;
  const results = scenarios.map(s => ({ scenario: s, ...attempt(() => calculateConsumption(s, profile)) }));
  const baseline = results.find(x => x.scenario.id === selectedBaseId)?.data ?? results[0]?.data;
  const editing = scenarios.find(s => s.id === editingId) ?? scenarios[0];
  const yearValues = results.filter(x => x.data).map(x => ({ label: x.scenario.name, value: x.data!.annualCost }));
  const commonYears = scenarios.every(s => s.heldYears === scenarios[0]?.heldYears);
  return <>
    <PageHeader number="04" title="方案比较" description="同时比较多个备选方案的成本、体验与关键指标。" />
    {!commonYears && <div className="error-notice">当前方案覆盖周期不同，总TCO不可直接比较。各自 TCO、年均和月均成本仍可查看；总增量留空。</div>}
    <Section title="设置对比方案" eyebrow="最多四个；颜色只用于识别" number={1} action={<button className="small-button" disabled={scenarios.length >= 4} onClick={() => { const id = `scenario-${Date.now()}`; onChange([...scenarios, { ...scenarios[0], id, name: `方案 ${scenarios.length + 1}` }]); setEditingId(id); }}>＋ 添加方案</button>}>
      <div className="scenario-grid">{scenarios.map((s, i) => <ScenarioCard key={s.id} scenario={s} index={i} baseline={s.id === selectedBaseId} onBaseline={() => setBaseId(s.id)} onChange={next => onChange(scenarios.map(x => x.id === s.id ? next : x))} onRemove={() => onChange(scenarios.filter(x => x.id !== s.id))} canRemove={scenarios.length > 1} />)}</div>
      <details className="disclosure"><summary>统一分析周期（预留）</summary><NumberField label="分析周期" value={analysisHorizonYears} onChange={onHorizonChange} unit="年" hint="尚未建模周期结束后的替代链；此项不参与当前总 TCO 计算。" /></details>
    </Section>
    <Section title="核心结果比较" eyebrow="同一周期才显示总增量" number={2} action={<select aria-label="基准方案" value={selectedBaseId} onChange={e => setBaseId(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}>
      <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>指标</th>{results.map(x => <th key={x.scenario.id}>{x.scenario.name}</th>)}</tr></thead><tbody>
        {([['netInitialOutlay', '净初始现金占用', yuan], ['economicTco', '经济 TCO', yuan], ['annualCost', '年均成本', yuan], ['monthlyCost', '月均成本', yuan], ['resaleValue', '期末残值', yuan], ['opportunityCost', '机会成本估算', yuan], ['costPerUse', '单次使用成本', yuan], ['initialFundingMonths', '初始资金占用月数', (v: number | null) => v === null ? '—' : `${num(v)} 月`], ['economicCostCashFlowMonths', '经济成本对应自由现金流月数', (v: number | null) => v === null ? '—' : `${num(v)} 月`], ['reserveGap', '安全垫差额', yuan]] as const).map(([key, label, format]) => <tr key={key}><th>{label}</th>{results.map(x => <td key={x.scenario.id}>{x.data ? <button className="table-value" onClick={() => onOpen(`${x.scenario.name} · ${label}`, x.data!.details[key] ?? (key === 'netInitialOutlay'
          ? { formula: '初始现金支出 − 旧物出售回款', inputs: { 初始现金支出: x.data!.initialOutlay, 旧物出售回款: x.data!.oldAssetSale } }
          : { formula: '用户填写的期末出售残值', inputs: { 期末残值: x.data!.resaleValue } }))}>{format(x.data[key] as number | null)}</button> : '—'}</td>)}</tr>)}
        <tr className="increment-row"><th>相对基准总增量成本</th>{results.map(x => <td key={x.scenario.id}>{x.data && baseline && x.data.heldYears === baseline.heldYears ? <button className="table-value" onClick={() => onOpen(`${x.scenario.name} · 增量成本`, { formula: '候选方案经济 TCO − 基准方案经济 TCO', inputs: { 候选经济TCO: x.data!.economicTco, 基准经济TCO: baseline.economicTco } })}>{yuan(incrementalCost(baseline, x.data))}</button> : '不可直接比较'}</td>)}</tr>
        <tr><th>相对基准年均成本变化</th>{results.map(x => <td key={x.scenario.id}>{x.data && baseline ? `${x.data.annualCost - baseline.annualCost >= 0 ? '+' : ''}${yuan(x.data.annualCost - baseline.annualCost)} / 年` : '—'}</td>)}</tr>
      </tbody></table></div>
      {results.map(x => <ErrorNotice key={x.scenario.id} message={x.error ? `${x.scenario.name}：${x.error}` : null} />)}
    </Section>
    <Section title="成本结构比较" eyebrow="不同方案的年均成本" number={3}><div className="charts-grid"><BarChart title="各方案年均成本" items={yearValues} />
      {baseline && <div className="chart-card"><h3>增量成本如何计算</h3><p className="large-equation">候选方案经济 TCO<br/>− 基准方案经济 TCO</p><p className="muted">当前基准：{baseline.name}。只有覆盖周期相同时才计算总增量。年均差额可单独查看。</p><button className="text-button" onClick={() => onOpen('增量成本', { formula: '候选方案经济 TCO − 基准方案经济 TCO', inputs: { 基准经济TCO: baseline.economicTco }, note: '不同持有周期不能直接比较总 TCO；统一周期需要补足替代链。' })}>查看公式 →</button></div>}
    </div></Section>
    <Section title="年均成本与主观体验变化" eyebrow="不合成总分" number={4}><p className="muted">相对基准只展示各维度变化；评分不折算成人民币，也不自动排名。</p>
      {scenarios.filter(s => s.id !== selectedBaseId).map(s => { const base = scenarios.find(x => x.id === selectedBaseId)!; const b = results.find(x => x.scenario.id === base.id)?.data; const c = results.find(x => x.scenario.id === s.id)?.data; const changes = experienceDimensions.filter(d => base.experience?.[d] !== s.experience?.[d]); return <div className="chart-card experience-delta" key={s.id}><h3>{s.name} 相对 {base.name}</h3><p>年均经济成本：{b && c ? `${c.annualCost - b.annualCost >= 0 ? '+' : ''}${yuan(c.annualCost - b.annualCost)} / 年` : '—'}</p>{changes.length === 0 ? <p>体验评分无变化</p> : changes.map(d => <p key={d}>{d}：{base.experience?.[d] ?? '未评价'} → {s.experience?.[d] ?? '未评价'}</p>)}</div>; })}
    </Section>
    <Section title="高级字段与体验维度" eyebrow="编辑所选方案" number={5} action={<div className="inline-actions"><select aria-label="编辑方案" value={editing?.id ?? ''} onChange={e => setEditingId(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}>
      {editing && <details className="disclosure"><summary>展开所选方案的完整参数</summary><ScenarioForm value={editing} onChange={next => onChange(scenarios.map(s => s.id === editing.id ? next : s))} /></details>}
      <details className="disclosure"><summary>主观体验维度（1–5级）</summary><div className="inline-actions"><input aria-label="新增体验维度" placeholder="例如：影像、续航" id="new-dimension" /><button className="small-button" onClick={() => { const input = document.getElementById('new-dimension') as HTMLInputElement | null; const v = input?.value.trim(); if (v && !experienceDimensions.includes(v)) onDimensionsChange([...experienceDimensions, v]); if (input) input.value = ''; }}>添加维度</button></div>{editing && experienceDimensions.map(d => <div className="score-row" key={d}><span>{d}</span><div className="inline-actions"><select aria-label={`${editing.name} ${d}`} value={editing.experience?.[d] ?? ''} onChange={e => onChange(scenarios.map(s => s.id === editing.id ? { ...s, experience: { ...s.experience, [d]: e.target.value ? Number(e.target.value) as Rating : undefined } } : s))}><option value="">未评价</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select><button className="small-button subtle" onClick={() => onDimensionsChange(experienceDimensions.filter(x => x !== d))}>删除维度</button></div></div>)}</details>
    </Section>
  </>;
}

function TimeFields({ value, onChange, car = false }: { value: CarScenario['time']; onChange: (v: CarScenario['time']) => void; car?: boolean }) {
  const set = (key: keyof CarScenario['time'], v: number) => onChange({ ...value, [key]: v });
  return <div className="form-grid">
    <NumberField label="单程行驶 / 乘坐" value={value.oneWayTravelMinutes} onChange={v => set('oneWayTravelMinutes', v)} unit="分钟" />
    {!car && <><NumberField label="单程换乘" value={value.oneWayTransferMinutes} onChange={v => set('oneWayTransferMinutes', v)} unit="分钟" /><NumberField label="单程等候" value={value.oneWayWaitingMinutes} onChange={v => set('oneWayWaitingMinutes', v)} unit="分钟" /></>}
    <NumberField label="单程步行" value={value.oneWayWalkingMinutes} onChange={v => set('oneWayWalkingMinutes', v)} unit="分钟" />
    {car && <NumberField label="单程停车" value={value.oneWayParkingMinutes} onChange={v => set('oneWayParkingMinutes', v)} unit="分钟" />}
  </div>;
}

function TransportPage({ car, alternative, alternatives, profile, onCarChange, onAlternativesChange, selectedId, onSelectedChange, onOpen }: {
  car: CarScenario; alternative: TransportAlternative; alternatives: TransportAlternative[]; profile: FinancialProfile;
  onCarChange: (v: CarScenario) => void; onAlternativesChange: (v: TransportAlternative[]) => void;
  selectedId: string; onSelectedChange: (v: string) => void; onOpen: (label: string, d: FormulaDetail) => void;
}) {
  const result = attempt(() => calculateTransport(car, alternative, profile));
  const updateAlt = (v: TransportAlternative) => onAlternativesChange(alternatives.map(x => x.id === alternative.id ? v : x));
  const setCar = (key: keyof CarScenario, v: number) => onCarChange({ ...car, [key]: v });
  const setAlt = (key: keyof TransportAlternative, v: number | string) => updateAlt({ ...alternative, [key]: v });
  const r = result.data;
  return <>
    <PageHeader number="03" title="出行比较" description="比较通勤方式的成本、钟表时间与主观体验。" />
    <ErrorNotice message={result.error} />
    <Section title="通勤基本信息" eyebrow="先设置时间与方式" number={1}><div className="form-grid">
      <NumberField label="每年通勤天数" value={car.commuteDaysPerYear} onChange={v => { onCarChange({ ...car, commuteDaysPerYear: v }); onAlternativesChange(alternatives.map(a => ({ ...a, commuteDaysPerYear: v }))); }} unit="天" />
      {car.roundTripCommuteKm !== undefined && <NumberField label="每日通勤往返公里" value={car.roundTripCommuteKm} onChange={v => setCar('roundTripCommuteKm', v)} unit="km" />}
      <SelectField label="比较的替代方式" value={selectedId} onChange={onSelectedChange} options={alternatives.map(a => ({ value: a.id, label: a.name }))} />
      <NumberField label="汽车单程行驶时间" value={car.time.oneWayTravelMinutes} onChange={v => onCarChange({ ...car, time: { ...car.time, oneWayTravelMinutes: v } })} unit="分钟" />
      <NumberField label={`${alternative.name}单程乘坐时间`} value={alternative.time.oneWayTravelMinutes} onChange={v => updateAlt({ ...alternative, time: { ...alternative.time, oneWayTravelMinutes: v } })} unit="分钟" />
    </div><p className="note">步行、等待、换乘和停车时间在下方详细参数中填写；总时间按往返计算。</p></Section>
    {r && <Section title="核心结果" eyebrow="成本与通勤时间" number={2}><div className="metric-grid lead-metrics">
      <Metric label="汽车经济 TCO" value={yuan(r.car.economicTco)} detail={r.car.details.economicTco} onOpen={onOpen} tone="accent" />
      <Metric label="相对替代方案增量成本" value={yuan(r.incrementalTco)} onOpen={onOpen} detail={{ formula: '汽车经济 TCO − 替代方案经济 TCO', inputs: { 汽车经济TCO: r.car.economicTco, 替代方案经济TCO: r.alternativeEconomicTco } }} />
      <Metric label="总节省时间" value={`${num(r.totalSavedHours)} 小时`} onOpen={onOpen} detail={{ formula: '(替代方案每日用时 − 汽车每日用时) × 年通勤天数 × 持有年数 ÷ 60', inputs: { 替代方案每日分钟: r.alternativeDailyTimeMinutes, 汽车每日分钟: r.carDailyTimeMinutes, 年通勤天数: car.commuteDaysPerYear, 年数: car.item.heldYears } }} />
      <Metric label="每节省 1 小时的成本" value={r.costPerSavedHour === null ? '—' : `${yuan(r.costPerSavedHour)} / 小时`} onOpen={onOpen} detail={{ formula: '汽车相对替代方案的增量经济 TCO ÷ 总节省小时数', inputs: { 增量经济TCO: r.incrementalTco, 总节省小时: r.totalSavedHours }, note: r.totalSavedHours <= 0 ? '未节省正数时间，无法定义每节省 1 小时的成本。' : undefined }} />
      <Metric label="初始资金占用月数" value={r.car.initialFundingMonths === null ? '—' : `${num(r.car.initialFundingMonths)} 月`} detail={r.car.details.initialFundingMonths} onOpen={onOpen} />
      <Metric label="购车后安全垫差额" value={yuan(r.car.reserveGap)} detail={r.car.details.reserveGap} onOpen={onOpen} tone={r.car.reserveGap < 0 ? 'warn' : undefined} />
    </div>
    <details className="disclosure"><summary>查看年均、每公里与资金指标</summary><div className="metric-grid compact-metrics">
      <Metric label={`${alternative.name}经济 TCO`} value={yuan(r.alternativeEconomicTco)} onOpen={onOpen} detail={{ formula: '(每日往返交通费 × 年通勤天数 + 其他年费用) × 持有年数', inputs: { 替代方案年费用: r.alternativeAnnualCost, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears } }} />
      <Metric label="汽车年均成本" value={yuan(r.car.annualCost)} detail={r.car.details.annualCost} onOpen={onOpen} />
      <Metric label="汽车月均经济成本" value={yuan(r.car.monthlyCost)} detail={r.car.details.monthlyCost} onOpen={onOpen} />
      <Metric label="每公里经济成本" value={yuan(r.economicCostPerKm)} onOpen={onOpen} detail={{ formula: '汽车经济 TCO ÷ (年总公里 × 持有年数)', inputs: { 汽车经济TCO: r.car.economicTco, 年总公里: r.derived.annualTotalKm, 持有年数: car.item.heldYears } }} />
      <Metric label="每通勤日经济成本" value={yuan(r.economicCostPerCommuteDay)} onOpen={onOpen} detail={{ formula: '汽车经济 TCO ÷ (年通勤天数 × 持有年数)', inputs: { 汽车经济TCO: r.car.economicTco, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears }, note: '汽车 TCO 含非通勤用途，分母仅为通勤日。' }} />
      <Metric label="汽车机会成本 · 估算" value={yuan(r.car.opportunityCost)} detail={r.car.details.opportunityCost} onOpen={onOpen} />
      <Metric label="汽车期末残值" value={yuan(r.car.resaleValue)} onOpen={onOpen} detail={{ formula: '用户填写的预计出售残值', inputs: { 预计残值: r.car.resaleValue } }} />
      <Metric label="购车后剩余现金" value={yuan(r.car.cashAfterPurchase)} detail={r.car.details.cashAfterPurchase} onOpen={onOpen} />
    </div></details>
    <div className={r.car.feasibility === 'within_reserve' ? 'status-notice' : 'error-notice'}>{r.car.feasibility === 'insufficient_cash' ? `当前现金不足以执行该支付方案；资金缺口 ${yuan(r.car.fundingGap)}。` : r.car.feasibility === 'below_reserve' ? `购买可以执行，但会跌破设定安全垫；安全垫缺口 ${yuan(r.car.reserveShortfall)}。` : '当前现金条件下可执行，并保持设定安全垫。'}</div>
    <p className="note">年通勤 {r.derived.annualCommuteKm === null ? '未拆分' : `${num(r.derived.annualCommuteKm)} km`} · 年非通勤 {r.derived.annualNonCommuteKm === null ? '未拆分' : `${num(r.derived.annualNonCommuteKm)} km`} · 年总里程 {num(r.derived.annualTotalKm)} km。</p>
    <p className="note">汽车 TCO 包含全部输入里程对应的成本；当前时间收益仅计算通勤，因此“每节省1小时成本”不能代表汽车全部使用价值。</p>
    <p className="note">钟表时间每天节省 {num(r.dailySavedMinutes)} 分钟；不可自由支配时间差：{r.unusableDailyMinutesDifference === null ? '需为两种方式都填写可利用时间比例' : `${num(r.unusableDailyMinutesDifference)} 分钟/日`}。后者不换算为经济价值。</p>
    {r.derived.warnings.map(w => <p className="note" key={w}>{w}</p>)}
    <p className="result-sentence">按当前输入，汽车每天比{alternative.name}节省 <strong>{num(r.dailySavedMinutes)} 分钟</strong>；在 {num(car.item.heldYears)} 年里，增量成本为 <strong>{yuan(r.incrementalTco)}</strong>。</p>
    </Section>}
    <Section title="汽车成本与时间" eyebrow="详细参数" number={3}>
      <details className="disclosure"><summary>车辆基础信息与购买方式</summary><ScenarioForm value={car.item} onChange={v => onCarChange({ ...car, item: v })} title="车辆基础信息" /></details>
      <details className="disclosure"><summary>行驶与通勤</summary><div className="form-grid">
        <NumberField label="固定年度停车成本" value={car.annualParking} onChange={v => setCar('annualParking', v)} />
        <NumberField label="每通勤日停车成本" value={car.parkingPerCommuteDay ?? 0} onChange={v => setCar('parkingPerCommuteDay', v)} />
        <SelectField label="能源成本模式" value={car.energyMode ?? 'fixed'} onChange={v => onCarChange({ ...car, energyMode: v as CarScenario['energyMode'] })} options={[{ value: 'automatic', label: '自动：随公里数变化' }, { value: 'fixed', label: '固定年度金额' }]} />
        {(car.energyMode ?? 'fixed') === 'automatic' ? <NumberField label="每公里能源成本" value={car.energyCostPerKm ?? 0} onChange={v => setCar('energyCostPerKm', v)} unit="元 / km" /> : <NumberField label="固定年油 / 电费" value={car.annualEnergy} onChange={v => setCar('annualEnergy', v)} />}
        <NumberField label="年高速 / 路桥费" value={car.annualRoadFees} onChange={v => setCar('annualRoadFees', v)} />
        <NumberField label="额外里程变动成本" value={car.extraMileageCostPerKm ?? car.perKmWear ?? 0} onChange={v => onCarChange({ ...car, extraMileageCostPerKm: v, perKmWear: undefined })} unit="元 / km" hint="不得包含已计入残值、能源或固定维护的费用" />
        {car.roundTripCommuteKm !== undefined && car.annualNonCommuteKm !== undefined ? <><NumberField label="每日通勤往返公里" value={car.roundTripCommuteKm} onChange={v => setCar('roundTripCommuteKm', v)} unit="km" /><NumberField label="年非通勤公里" value={car.annualNonCommuteKm} onChange={v => setCar('annualNonCommuteKm', v)} unit="km" /></> : <><NumberField label="年总行驶公里（旧版数据）" value={car.annualKm} onChange={v => setCar('annualKm', v)} unit="km" /><button className="small-button" onClick={() => onCarChange({ ...car, roundTripCommuteKm: 0, annualNonCommuteKm: car.annualKm })}>开始拆分里程</button></>}
        <NumberField label="每年通勤天数" value={car.commuteDaysPerYear} onChange={v => { onCarChange({ ...car, commuteDaysPerYear: v }); onAlternativesChange(alternatives.map(a => ({ ...a, commuteDaysPerYear: v }))); }} unit="天" />
      </div><h3>单程时间</h3><TimeFields value={car.time} onChange={v => onCarChange({ ...car, time: v })} car /><OptionalPercentField label="乘车时间可自由利用比例（可选）" value={car.usableTravelTimeRatio} onChange={v => onCarChange({ ...car, usableTravelTimeRatio: v })} hint="仅用于不可自由支配时间差；留空表示未评价" /></details>
      <details className="disclosure"><summary>高级结果与残值模型</summary><p>汽车单次使用成本：{r ? yuan(r.car.costPerUse) : '—'}。此值取决于填写的每年使用次数。</p><div className="form-grid"><NumberField label="残值锚点参考年公里" value={car.residualReferenceAnnualKm ?? 0} onChange={v => setCar('residualReferenceAnnualKm', v)} unit="km" /><NumberField label="每增加1公里对残值的影响（可选）" value={car.residualLossPerExtraKm ?? 0} onChange={v => setCar('residualLossPerExtraKm', v)} unit="元 / km" /></div><p className="note">仅在掌握里程与残值关系时填写后者；空值表示残值只随持有年限变化。</p></details>
    </Section>
    <Section title="替代方案" eyebrow="地铁 / 公交 / 打车 / 骑行 / 其他" number={4} action={<select aria-label="替代出行方案" value={selectedId} onChange={e => onSelectedChange(e.target.value)}>{alternatives.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}>
      <div className="form-grid">
        <TextField label="方案名称" value={alternative.name} onChange={v => setAlt('name', v)} />
        <SelectField label="方式" value={alternative.mode} onChange={v => setAlt('mode', v)} options={['metro', 'bus', 'taxi', 'bike', 'other'].map((v, i) => ({ value: v, label: ['地铁', '公交', '打车', '骑行', '其他'][i] }))} />
        <NumberField label="单次交通费" value={alternative.farePerTrip ?? 0} onChange={v => updateAlt({ ...alternative, farePerTrip: v, farePerDay: undefined })} hint="往返按 2 次计算" />
        <NumberField label="每日交通费（可选）" value={alternative.farePerDay ?? 0} onChange={v => updateAlt({ ...alternative, farePerDay: v > 0 ? v : undefined })} hint="填写后优先于单次费用" />
        <NumberField label="其他年费用" value={alternative.annualExtraCost} onChange={v => setAlt('annualExtraCost', v)} />
      </div><h3>单程时间</h3><TimeFields value={alternative.time} onChange={v => updateAlt({ ...alternative, time: v })} /><OptionalPercentField label="乘车时间可自由利用比例（可选）" value={alternative.usableTravelTimeRatio} onChange={v => updateAlt({ ...alternative, usableTravelTimeRatio: v })} hint="仅用于不可自由支配时间差；留空表示未评价" />
      <div className="inline-actions"><button className="small-button" onClick={() => { const id = `alt-${Date.now()}`; onAlternativesChange([...alternatives, { ...alternative, id, name: '新替代方案', mode: 'other' }]); onSelectedChange(id); }}>添加替代方案</button><button className="small-button subtle" disabled={alternatives.length <= 1} onClick={() => { const rest = alternatives.filter(a => a.id !== selectedId); onAlternativesChange(rest); onSelectedChange(rest[0].id); }}>删除当前方案</button></div>
    </Section>
    <Section title="非货币体验" eyebrow="主观判断" number={5}><p className="muted">正向体验高分更好；负向负担高分更重。只逐项查看，不汇总或换算成人民币。</p><div className="experience-grid">
      <ExperienceEditor title="汽车" scores={car.experience} onChange={v => onCarChange({ ...car, experience: v })} />
      <ExperienceEditor title={alternative.name} scores={alternative.experience} onChange={v => updateAlt({ ...alternative, experience: v })} />
    </div></Section>
  </>;
}

function BoundaryPage({ state, alternative, onChange, onOpen }: { state: AppState; alternative: TransportAlternative; onChange: (s: AppState) => void; onOpen: (label: string, d: FormulaDetail) => void }) {
  const { car, profile, timeValue, assumedSavedMinutes } = state;
  const [activeSensitivity, setActiveSensitivity] = useState('timeValue');
  const result = attempt(() => calculateTransport(car, alternative, profile));
  const boundary = attempt(() => calculateBoundary(car, alternative, profile, timeValue, assumedSavedMinutes));
  const scenarioHourly = result.data && assumedSavedMinutes > 0 && car.commuteDaysPerYear > 0
    ? result.data.incrementalTco / (assumedSavedMinutes * car.commuteDaysPerYear * car.item.heldYears / 60) : null;
  const maxPrice = Math.max(1_000, car.item.purchasePrice * 1.7);
  const prices = [...new Set([...Array.from({ length: 11 }, (_, i) => maxPrice * i / 10), car.item.purchasePrice])].sort((a, b) => a - b);
  const sensitivity = attempt(() => priceSensitivity(car, alternative, profile, prices));
  const holdCurve = Array.from({ length: 12 }, (_, i) => {
    const years = i + 1;
    if ((car.residualAnchors?.length ?? 0) < 2) return { x: years, y: null };
    const r = attempt(() => calculateTransport({ ...car, item: { ...car.item, heldYears: years } }, alternative, profile));
    return { x: years, y: r.data?.car.annualCost ?? null };
  });
  const setCar = (key: keyof CarScenario, v: number) => onChange({ ...state, car: { ...car, [key]: v } });
  const setItem = (key: keyof ConsumptionScenario, v: number) => onChange({ ...state, car: { ...car, item: { ...car.item, [key]: v } } });
  const sensitivityGroups = [
    { label: '资金机会成本率', key: 'opportunityRate' as const, inputs: [0, .02, .04, .06], format: (v: number) => `${num(v * 100)}%` },
    { label: '期末残值', key: 'resaleValue' as const, inputs: [.7, 1, 1.3].map(n => Math.round((result.data?.car.resaleValue ?? car.item.resaleValue) * n)), format: yuan },
    { label: '持有年限', key: 'heldYears' as const, inputs: [1, 3, 5, 8, 12], format: (v: number) => `${num(v)} 年` },
    { label: '固定年度停车成本', key: 'annualParking' as const, inputs: [0, car.annualParking, car.annualParking + 6000], format: yuan },
    { label: '每天节省时间', key: 'dailySavedMinutes' as const, inputs: [15, 30, 50, 75], format: (v: number) => `${num(v)} 分钟` },
  ];
  const b = boundary.data;
  const timePoints = b && result.data ? timeChartPoints(b.curve, assumedSavedMinutes, b.minimumDailyMinutes,
    result.data.incrementalTco, car.commuteDaysPerYear, car.item.heldYears) : [];
  const pricePoints = result.data ? priceHourlyPoints(car, alternative, profile,
    [...prices, car.item.purchasePrice, ...(b?.maximumCarPrice === null || b?.maximumCarPrice === undefined ? [] : [b.maximumCarPrice])], assumedSavedMinutes) : [];
  const timeValueRows = result.data ? [...new Set([30, 50, 100, 150, 200, timeValue])].sort((a, b) => a - b).map(value => {
    const calculated = attempt(() => calculateBoundary(car, alternative, profile, value, assumedSavedMinutes));
    return { value, minimumMinutes: calculated.data?.minimumDailyMinutes ?? null,
      maxPrice: calculated.data?.maximumCarPrice ?? null, hourlyCost: scenarioHourly };
  }) : [];
  const activeGroup = sensitivityGroups.find(g => g.key === activeSensitivity);
  const activeRows = activeGroup ? parameterSensitivity(car, alternative, profile, activeGroup.key, activeGroup.inputs) : [];
  return <>
    <PageHeader number="05" title="边界分析" description="调整关键条件，查看时间、价格与持有年限的临界点。" />
    <ErrorNotice message={result.error || boundary.error || sensitivity.error} />
    <div className="boundary-top"><Section title="基础参数" eyebrow="修改条件，实时查看边界" number={1}><div className="slider-row"><NumberField label="你愿意为节省1小时自由时间支付多少" value={timeValue} onChange={v => onChange({ ...state, timeValue: v })} unit="元 / 小时" /><input aria-label="每小时支付意愿滑块" type="range" min="0" max="500" step="5" value={Math.min(500, timeValue)} onChange={e => onChange({ ...state, timeValue: Number(e.target.value) })} /></div>
      <div className="inline-actions">{[30, 50, 100, 150, 200].map(v => <button className="small-button" key={v} onClick={() => onChange({ ...state, timeValue: v })}>¥{v}/h</button>)}</div><p className="note">这些只是情景测试值，不是推荐值；它不是工资时薪，也不是系统判断一小时“值多少钱”。</p>
      <div className="slider-row"><NumberField label="情景：每天节省时间" value={assumedSavedMinutes} onChange={v => onChange({ ...state, assumedSavedMinutes: v })} unit="分钟" /><input aria-label="每日节省时间滑块" type="range" min="0" max="180" step="1" value={Math.min(180, assumedSavedMinutes)} onChange={e => onChange({ ...state, assumedSavedMinutes: Number(e.target.value) })} /></div>
      <div className="form-grid"><NumberField label="购车价格" value={car.item.purchasePrice} onChange={v => setItem('purchasePrice', v)} /><NumberField label="年通勤天数" value={car.commuteDaysPerYear} onChange={v => { onChange({ ...state, car: { ...car, commuteDaysPerYear: v }, alternatives: state.alternatives.map(a => ({ ...a, commuteDaysPerYear: v })) }); }} unit="天" /><NumberField label="持有年数" value={car.item.heldYears} onChange={v => setItem('heldYears', v)} unit="年" min={0.01} /><NumberField label="固定年度停车成本" value={car.annualParking} onChange={v => setCar('annualParking', v)} /></div>
    </Section>
    {result.data && b && <Section title="当前关键结果" eyebrow="只描述当前输入下的边界" number={2}>
      <div className="metric-grid lead-metrics">
        <Metric label="该时间情景下每小时成本" value={scenarioHourly === null ? '—' : `${yuan(scenarioHourly)} / 小时`} onOpen={onOpen} detail={{ formula: '增量经济 TCO ÷ (假设每日节省分钟 × 年通勤天数 × 持有年数 ÷ 60)', inputs: { 增量经济TCO: result.data.incrementalTco, 假设每日分钟: assumedSavedMinutes, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears } }} />
        <Metric label="达到阈值的最少每日节省时间" value={b.minimumDailyMinutes === null ? '—' : `${num(b.minimumDailyMinutes)} 分钟`} onOpen={onOpen} detail={{ formula: '增量经济 TCO × 60 ÷ (愿付金额 / 小时 × 年通勤天数 × 持有年数)', inputs: { 增量经济TCO: result.data.incrementalTco, 愿付金额每小时: timeValue, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears }, note: '若增量成本小于等于 0，边界为 0；阈值或通勤天数为 0 时可能无解。' }} />
        <Metric label="对应的购车价格边界" value={yuan(b.maximumCarPrice)} onOpen={onOpen} detail={{ formula: '反向求解：汽车增量 TCO = 愿付金额 / 小时 × 情景总节省小时', inputs: { 愿付金额每小时: timeValue, 假设每日分钟: assumedSavedMinutes, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears }, note: '在当前输入条件以及用户设定的每小时支付意愿下，使时间收益边界刚好成立的购车价格。持有年限内残值按锚点模型；融资时按原首付比例变化，价差、总利息和手续费固定。搜索上限为 1 亿元。' }} />
        <Metric label="对应的年停车费边界" value={yuan(b.maximumAnnualParking)} onOpen={onOpen} detail={{ formula: '反向求解：汽车增量 TCO = 愿付金额 / 小时 × 情景总节省小时', inputs: { 愿付金额每小时: timeValue, 假设每日分钟: assumedSavedMinutes, 年通勤天数: car.commuteDaysPerYear, 持有年数: car.item.heldYears }, note: '固定其他输入。搜索上限为每年 1000 万元。' }} />
      </div>
      <p className="note">“对应的购车价格边界”指在当前输入条件以及你设定的每小时支付意愿下，使时间收益边界刚好成立的购车价格。</p>
      <p className="result-sentence">在你设定的 <strong>{yuan(timeValue)} / 小时</strong> 与其他条件下，若每天节省时间超过约 <strong>{b.minimumDailyMinutes === null ? '无法求解' : `${num(b.minimumDailyMinutes)} 分钟`}</strong>，每节省一小时的经济成本将不高于该参考线。</p>
    </Section>}</div>
    {result.data && b && <div className="boundary-charts"><Section title="每日节省时间 → 每小时成本" eyebrow="当前点、参考线与交点" number={3}><LineChart title="时间成本曲线" xLabel="每天节省时间" yLabel="每小时成本" points={timePoints} reference={timeValue} currentX={assumedSavedMinutes} boundaryPoint={b.minimumDailyMinutes === null || b.minimumDailyMinutes <= 0 ? undefined : { x: b.minimumDailyMinutes, y: timeValue }} xUnit="分钟" yUnit="元/小时" /></Section>
      <Section title="购车价格 → 每小时成本" eyebrow="其他假设保持不变" number={4}><LineChart title="价格成本曲线" xLabel="购车价格" yLabel="每小时成本" points={pricePoints} reference={timeValue} currentX={car.item.purchasePrice} boundaryPoint={b.maximumCarPrice === null ? undefined : { x: b.maximumCarPrice, y: timeValue }} xUnit="元" yUnit="元/小时" /></Section></div>}
    <Section title="更多条件与残值锚点" eyebrow="需要时展开或调整" number={5}><div className="form-grid">
      {car.roundTripCommuteKm !== undefined && car.annualNonCommuteKm !== undefined ? <><NumberField label="每日通勤往返公里" value={car.roundTripCommuteKm} onChange={v => setCar('roundTripCommuteKm', v)} unit="km" /><NumberField label="年非通勤公里" value={car.annualNonCommuteKm} onChange={v => setCar('annualNonCommuteKm', v)} unit="km" /></> : <NumberField label="年行驶公里（未拆分）" value={car.annualKm} onChange={v => setCar('annualKm', v)} unit="km" />}
      <SelectField label="能源成本模式" value={car.energyMode ?? 'fixed'} onChange={v => onChange({ ...state, car: { ...car, energyMode: v as CarScenario['energyMode'] } })} options={[{ value: 'automatic', label: '自动：随公里数变化' }, { value: 'fixed', label: '固定年度金额' }]} />
      {(car.energyMode ?? 'fixed') === 'automatic' ? <NumberField label="每公里能源成本" value={car.energyCostPerKm ?? 0} onChange={v => setCar('energyCostPerKm', v)} unit="元 / km" /> : <NumberField label="固定年油 / 电费" value={car.annualEnergy} onChange={v => setCar('annualEnergy', v)} />}
      <NumberField label="每通勤日停车成本" value={car.parkingPerCommuteDay ?? 0} onChange={v => setCar('parkingPerCommuteDay', v)} />
      <PercentField label="资金机会成本率" value={car.item.opportunityRate} onChange={v => setItem('opportunityRate', v)} />
    </div><p className="note">通勤天数 → 通勤公里 → 总公里 → 自动能源与里程费用；持有年限 → 残值锚点插值。固定能源模式下，改变年行驶公里不会自动改变能源成本。</p>
      <details className="disclosure" open><summary>残值锚点（按持有年限）</summary><p className="note">至少两个锚点才可联动年份。超出锚点范围不外推；空缺时仅当前年限的手动残值有效。</p><div className="form-grid">{(car.residualAnchors ?? []).map((anchor, i) => <div className="anchor-row" key={i}><NumberField label={`锚点 ${i + 1}：持有年数`} value={anchor.years} onChange={v => onChange({ ...state, car: { ...car, residualAnchors: car.residualAnchors!.map((a, j) => j === i ? { ...a, years: v } : a) } })} unit="年" /><NumberField label="预计残值" value={anchor.value} onChange={v => onChange({ ...state, car: { ...car, residualAnchors: car.residualAnchors!.map((a, j) => j === i ? { ...a, value: v } : a) } })} /><button className="small-button subtle" onClick={() => onChange({ ...state, car: { ...car, residualAnchors: car.residualAnchors!.filter((_, j) => j !== i) } })}>删除</button></div>)}</div><div className="inline-actions"><button className="small-button" onClick={() => onChange({ ...state, car: { ...car, residualAnchors: [...(car.residualAnchors ?? []), { years: car.item.heldYears + 1, value: Math.max(0, (result.data?.car.resaleValue ?? car.item.resaleValue) * .8) }] } })}>添加锚点</button></div>{(car.residualAnchors?.length ?? 0) < 2 && <NumberField label="当前持有年限的手动期末残值" value={car.item.resaleValue} onChange={v => setItem('resaleValue', v)} />}</details>
    </Section>
    {(car.residualAnchors?.length ?? 0) < 2 && <div className="error-notice">当前持有年限变化未建立可靠残值模型。请添加至少两个残值锚点；年份曲线不推测空缺数据。</div>}
    <div className="boundary-lower"><Section title="持有年份 → 年均成本" eyebrow="残值按锚点变化" number={6}><LineChart title="年份成本曲线" xLabel="持有年数" yLabel="年均成本" points={holdCurve} currentX={car.item.heldYears} xUnit="年" yUnit="元/年" /><p className="note">只有残值锚点覆盖的年份才显示数值；不同周期总 TCO 仍不可直接比较。</p></Section>
      <Section title="关键参数敏感性" eyebrow="一次只改变一项" number={7}><div className="sensitivity-tabs"><button className={activeSensitivity === 'timeValue' ? 'active' : ''} onClick={() => setActiveSensitivity('timeValue')}>时间支付意愿</button>{sensitivityGroups.map(g => <button key={g.key} className={activeSensitivity === g.key ? 'active' : ''} onClick={() => setActiveSensitivity(g.key)}>{g.label}</button>)}</div>
        {activeSensitivity === 'timeValue' ? <><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>支付意愿</th><th>所需每日节省时间</th><th>购车价格边界</th><th>当前条件下每小时成本</th></tr></thead><tbody>{timeValueRows.map(row => <tr key={row.value} className={row.value === timeValue ? 'current-data-row' : ''}><th>{yuan(row.value)} / 小时</th><td>{row.minimumMinutes === null ? '—' : `${num(row.minimumMinutes)} 分钟`}</td><td>{yuan(row.maxPrice)}</td><td>{yuan(row.hourlyCost)}</td></tr>)}</tbody></table></div><LineChart title="支付意愿 → 所需每日节省时间" xLabel="每小时支付意愿" yLabel="最少每日节省时间" points={timeValueRows.map(row => ({ x: row.value, y: row.minimumMinutes }))} currentX={timeValue} xUnit="元/小时" yUnit="分钟" formatX={yuan} formatY={v => v === null ? '—' : num(v)} /></> : activeGroup && <><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>{activeGroup.label}</th><th>汽车 TCO</th><th>增量 TCO</th><th>每节省1小时成本</th><th>说明</th></tr></thead><tbody>{activeRows.map((row, i) => <tr key={i}><th>{activeGroup.format(row.input)}</th><td>{yuan(row.carEconomicTco)}</td><td>{yuan(row.incrementalTco)}</td><td>{yuan(row.costPerSavedHour)}</td><td>{row.note ?? '—'}</td></tr>)}</tbody></table></div><LineChart title={`${activeGroup.label} → 每小时成本`} xLabel={activeGroup.label} yLabel="每小时成本" points={activeRows.map(row => ({ x: row.input, y: row.costPerSavedHour }))} formatX={activeGroup.format} currentX={activeGroup.key === 'opportunityRate' ? car.item.opportunityRate : activeGroup.key === 'resaleValue' ? result.data?.car.resaleValue : activeGroup.key === 'heldYears' ? car.item.heldYears : activeGroup.key === 'annualParking' ? car.annualParking : assumedSavedMinutes} yUnit="元/小时" /></>}
      </Section></div>
    {sensitivity.data && <Section title="现金流价格敏感性" eyebrow="原有现金安全性曲线" number={8}><details className="disclosure"><summary>查看价格与初始资金占用、安全垫的关系</summary><div className="charts-grid"><LineChart title="商品价格 → 初始资金占用月数" xLabel="购车价格" yLabel="占用月数" points={sensitivity.data.map(x => ({ x: x.price, y: x.freeCashFlowMonths }))} currentX={car.item.purchasePrice} xUnit="元" yUnit="月" formatY={v => `${num(v)} 月`} />
      <LineChart title="商品价格 → 安全垫差额" xLabel="购车价格" yLabel="安全垫差额" points={sensitivity.data.map(x => ({ x: x.price, y: x.reserveGap }))} currentX={car.item.purchasePrice} xUnit="元" yUnit="元" /></div></details></Section>}
  </>;
}

type Route = Page | 'landing';

function routeFromHash(): Route {
  const value = window.location.hash.replace(/^#\//, '');
  return value === 'landing' || nav.some(item => item.id === value) ? value as Route : 'landing';
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [detail, setDetail] = useState<{ title: string; content: FormulaDetail } | null>(null);
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    if (window.location.hash !== `#/${routeFromHash()}`) window.history.replaceState(null, '', '#/landing');
    const sync = () => { setRoute(routeFromHash()); setDetail(null); window.scrollTo(0, 0); };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const alternative = useMemo(() => state.alternatives.find(a => a.id === state.selectedAlternativeId) ?? state.alternatives[0], [state.alternatives, state.selectedAlternativeId]);
  const open = (title: string, content: FormulaDetail) => setDetail({ title, content });
  const changeState = (patch: Partial<AppState>) => setState(prev => ({ ...prev, ...patch }));
  const navigate = (next: Route) => {
    if (next === route) return;
    if (route === 'landing' && next === 'home') trackLandingEnter();
    if (next !== 'landing' && next !== 'home') trackModuleOpen(next);
    window.history.pushState(null, '', `#/${next}`);
    setRoute(next);
    setDetail(null);
    window.scrollTo(0, 0);
  };
  if (route === 'landing') return <LandingPage onExplore={() => navigate('home')} />;
  const page = route;
  return <div className="app-shell">
    <div className="layout"><Sidebar page={page} onNavigate={navigate} /><div className="content-column"><header className="site-header"><span className="breadcrumb">决策工作台 / {nav.find(n => n.id === page)?.label}</span><div className="header-right"><span className="local-badge">仅保存在此设备</span><button className="header-link" onClick={() => { if (window.confirm('将所有输入恢复为示例数据？')) setState(defaultState); }}>重置示例</button></div></header>
      <main className="main-content">
        {page === 'home' && <HomePage onNavigate={navigate} />}
        {page === 'finance' && <FinancePage profile={state.profile} onChange={v => changeState({ profile: v })} onOpen={open} />}
        {page === 'consumption' && <ConsumptionPage scenario={state.scenarios[1] ?? state.scenarios[0]} profile={state.profile} onChange={v => changeState({ scenarios: state.scenarios.map((s, i) => i === (state.scenarios[1] ? 1 : 0) ? v : s) })} asset={state.currentAsset} onAssetChange={v => changeState({ currentAsset: v })} onOpen={open} />}
        {page === 'comparison' && <ComparisonPage scenarios={state.scenarios} profile={state.profile} analysisHorizonYears={state.analysisHorizonYears} experienceDimensions={state.experienceDimensions} onHorizonChange={v => changeState({ analysisHorizonYears: v })} onDimensionsChange={v => changeState({ experienceDimensions: v })} onChange={v => changeState({ scenarios: v })} onOpen={open} />}
        {page === 'transport' && alternative && <TransportPage car={state.car} alternative={alternative} alternatives={state.alternatives} profile={state.profile} onCarChange={v => changeState({ car: v })} onAlternativesChange={v => changeState({ alternatives: v })} selectedId={state.selectedAlternativeId} onSelectedChange={v => changeState({ selectedAlternativeId: v })} onOpen={open} />}
        {page === 'boundary' && alternative && <BoundaryPage state={state} alternative={alternative} onChange={setState} onOpen={open} />}
      </main></div></div>
    {detail && <DetailModal title={detail.title} detail={detail.content} onClose={() => setDetail(null)} />}
  </div>;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancialSnapshot, calculateFinancing, estimateOpportunityCost } from '../src/core/finance.ts';
import { calculateConsumption, calculateKeepAsset, incrementalCost } from '../src/core/consumption.ts';
import { calculateTransport, dailyCommuteMinutes } from '../src/core/transport.ts';
import { calculateBoundary, priceSensitivity } from '../src/core/boundary.ts';
import type { CarScenario, ConsumptionScenario, FinancialProfile, TransportAlternative } from '../src/core/types.ts';

const profile: FinancialProfile = {
  cash: 100_000, monthlyIncome: 20_000, monthlyEssentials: 8_000,
  monthlyDebt: 2_000, monthlySaving: 3_000, monthlyKnownCommitments: 1_000,
  nearTermKnownCommitments: 10_000, minimumReserve: 40_000,
  otherLiquidAssets: 20_000, externalEmergencySupport: false,
};

const phone: ConsumptionScenario = {
  id: 'phone', name: '手机', purchasePrice: 7_000, heldYears: 3,
  usefulLifeYears: 5, resaleValue: 1_000, annualMaintenance: 100,
  annualConsumables: 50, annualInsuranceSubscriptions: 0,
  oneTimeExtras: 200, annualUses: 365, opportunityRate: 0.05,
};

const car: CarScenario = {
  item: {
    id: 'car', name: '汽车', purchasePrice: 150_000, heldYears: 5,
    resaleValue: 70_000, annualMaintenance: 3_000,
    annualConsumables: 0, annualInsuranceSubscriptions: 5_000,
    oneTimeExtras: 10_000, annualUses: 500, opportunityRate: 0.04,
  },
  annualParking: 6_000, annualEnergy: 8_000, annualRoadFees: 2_000,
  perKmWear: 0.1, annualKm: 12_000, commuteDaysPerYear: 250,
  time: {
    oneWayTravelMinutes: 28, oneWayTransferMinutes: 0,
    oneWayWaitingMinutes: 0, oneWayWalkingMinutes: 3,
    oneWayParkingMinutes: 4,
  },
  experience: {},
};

const metro: TransportAlternative = {
  id: 'metro', name: '地铁', mode: 'metro', farePerTrip: 5,
  annualExtraCost: 0, commuteDaysPerYear: 250,
  time: {
    oneWayTravelMinutes: 38, oneWayTransferMinutes: 8,
    oneWayWaitingMinutes: 5, oneWayWalkingMinutes: 9,
    oneWayParkingMinutes: 0,
  },
  experience: {},
};

test('财务档案：自由现金流、可配置资本及安全覆盖月数', () => {
  const x = calculateFinancialSnapshot(profile);
  assert.equal(x.monthlyFreeCashFlow, 6_000);
  assert.equal(x.allocatableCash, 50_000);
  assert.equal(x.monthsOfEssentialCoverage, 100_000 / 11_000);
});

test('现金价 11500 与零利率分期价 12000：隐含成本 500', () => {
  const x = calculateFinancing(11_500, {
    mode: 'installment', financedPrice: 12_000,
    downPayment: 0, totalInterest: 0, fees: 0,
    termMonths: 24, monthlyPayment: 500,
  });
  assert.equal(x.pricePremium, 500);
  assert.equal(x.totalFinancingCost, 500);
  assert.equal(x.derivedMonthlyPayment, 500);
  assert.equal(x.paymentMismatch, 0);
});

test('贷款、手续费、月供及现金优惠分开核算', () => {
  const loan = calculateFinancing(100_000, {
    mode: 'loan', financedPrice: 100_000, downPayment: 30_000,
    totalInterest: 6_000, fees: 1_000, upfrontFees: 200,
    termMonths: 24, monthlyPayment: 3_200,
  });
  assert.equal(loan.principal, 70_000);
  assert.equal(loan.totalFinancingCost, 7_000);
  assert.equal(loan.initialPayment, 30_200);
  assert.equal(loan.derivedMonthlyPayment, 76_800 / 24);
  assert.equal(loan.paymentMismatch, 0);
  assert.equal(calculateFinancing(10_000, { mode: 'installment', financedPrice: 9_500, downPayment: 0, termMonths: 10 }).totalFinancingCost, -500);
  assert.equal(calculateFinancing(10_000, { mode: 'cash', totalInterest: 999 }).totalFinancingCost, 0);
});

test('资金机会成本使用下降的占用资本，不采用全价乘年数', () => {
  const actual = estimateOpportunityCost(10_000, 0, 2, 0.1);
  assert.ok(actual > 1_000 && actual < 2_000);
  assert.ok(Math.abs(estimateOpportunityCost(10_000, 10_000, 2, 0.1) - 2_000) < 1e-8);
  assert.ok(estimateOpportunityCost(10_000, 0, 2, 0.1, 5_000, 24) < actual);
  assert.ok(Math.abs(estimateOpportunityCost(10_000, 10_000, 0.01, 0.1) - 10) < 1e-8);
});

test('手机：基础 TCO、年均、使用成本与寿命兑现率', () => {
  const x = calculateConsumption(phone, profile);
  assert.equal(x.baseTco, 6_650);
  assert.equal(x.lifetimeRealization, 0.6);
  assert.equal(x.totalUses, 1_095);
  assert.equal(x.annualCost, x.economicTco / 3);
  assert.equal(x.costPerUse, x.economicTco / 1_095);
  assert.equal(x.cashAfterPurchase, 92_800);
  assert.equal(x.reserveGap, 52_800);
  assert.equal(x.freeCashFlowMonths, 7_200 / 6_000);
});

test('旧相机：沉没成本 8000 不进入继续持有成本', () => {
  const x = calculateKeepAsset({
    name: '相机', originalPrice: 8_000, marketValueNow: 6_500,
    futureResaleValue: 4_000, furtherYears: 2,
    annualKeepingCost: 100, opportunityRate: 0.05, annualUses: 20,
  });
  assert.equal(x.historicalPrice, 8_000);
  assert.equal(x.foregoneSaleProceeds, 6_500);
  assert.ok(x.futureEconomicCost > 2_700 && x.futureEconomicCost < 3_400);
});

test('方案增量按经济 TCO，而非标价计算', () => {
  const base = calculateConsumption({ ...phone, id: 'base', purchasePrice: 4_500 }, profile);
  const premium = calculateConsumption(phone, profile);
  assert.equal(incrementalCost(base, premium), premium.economicTco - base.economicTco);
});

test('旧设备比较：当前市值是继续持有的机会成本，但不是现金支出', () => {
  const keep = calculateConsumption({ ...phone, id: 'keep', ownedAlready: true, purchasePrice: 1_500, resaleValue: 200 }, profile);
  const buy = calculateConsumption({ ...phone, id: 'buy', purchasePrice: 4_500, oldAssetMarketValue: 1_500, sellOldAsset: true }, profile);
  assert.equal(keep.initialOutlay, phone.oneTimeExtras);
  assert.equal(buy.oldAssetSale, 1_500);
  assert.equal(buy.netInitialOutlay, 4_500 + phone.oneTimeExtras - 1_500);
  assert.equal(incrementalCost(keep, buy), buy.economicTco - keep.economicTco);
  assert.ok(buy.keepOldEconomicCost !== null);
  assert.equal(buy.incrementalVsKeepOld, buy.economicTco - buy.keepOldEconomicCost!);
});

test('出行：单程分项乘以 2，结果计算总节省时间和增量成本', () => {
  assert.equal(dailyCommuteMinutes(metro.time), 120);
  const x = calculateTransport(car, metro, profile);
  assert.equal(x.carDailyTimeMinutes, 70);
  assert.equal(x.dailySavedMinutes, 50);
  assert.equal(x.totalSavedHours, 50 / 60 * 250 * 5);
  assert.equal(x.alternativeEconomicTco, 5 * 2 * 250 * 5);
  assert.equal(x.costPerSavedHour, x.incrementalTco / x.totalSavedHours);
});

test('出行：每日票价优先，里程损耗和年费用进入汽车成本', () => {
  const dailyFare = calculateTransport(car, { ...metro, farePerDay: 12, annualExtraCost: 100 }, profile);
  assert.equal(dailyFare.alternativeAnnualCost, 12 * 250 + 100);
  const noWear = calculateTransport({ ...car, perKmWear: 0 }, metro, profile);
  const withWear = calculateTransport(car, metro, profile);
  assert.ok(Math.abs(withWear.car.baseTco - noWear.car.baseTco - 0.1 * 12_000 * 5) < 1e-8);
});

test('现实例子：多花 160000、节省 800 小时 = 200 元/小时', () => {
  const ratio = 160_000 / 800;
  assert.equal(ratio, 200);
});

test('动态边界：等价时间交点处的每小时成本等于用户阈值', () => {
  const x = calculateBoundary(car, metro, profile, 100);
  assert.ok(x.minimumDailyMinutes !== null && x.minimumDailyMinutes > 0);
  const transport = calculateTransport(car, metro, profile);
  const ratio = transport.incrementalTco /
    (x.minimumDailyMinutes! * car.commuteDaysPerYear * car.item.heldYears / 60);
  assert.ok(Math.abs(ratio - 100) < 1e-8);
  assert.ok(x.curve[0].dailySavedMinutes > 0);
});

test('反向价格和停车边界使增量成本等于时间价值预算', () => {
  const x = calculateBoundary(car, metro, profile, 200);
  assert.ok(x.maximumCarPrice !== null);
  assert.ok(x.maximumAnnualParking !== null);
  const hours = calculateTransport(car, metro, profile).totalSavedHours;
  const priceCase = calculateTransport({ ...car, item: { ...car.item, purchasePrice: x.maximumCarPrice! } }, metro, profile);
  const parkCase = calculateTransport({ ...car, annualParking: x.maximumAnnualParking! }, metro, profile);
  assert.ok(Math.abs(priceCase.incrementalTco - hours * 200) < 0.01);
  assert.ok(Math.abs(parkCase.incrementalTco - hours * 200) < 0.01);
});

test('价格敏感性：价格升高，现金流占用上升且安全垫下降', () => {
  const xs = priceSensitivity(car, metro, profile, [100_000, 150_000, 200_000]);
  assert.ok(xs[0].freeCashFlowMonths! < xs[1].freeCashFlowMonths!);
  assert.ok(xs[1].reserveGap > xs[2].reserveGap);
});

test('延迟购买按现金流预测购买时现金，扣除近期刚性支出', () => {
  const delayed = calculateConsumption({ ...phone, financing: { mode: 'delay', delayMonths: 6 } }, profile);
  assert.equal(delayed.cashAfterPurchase, 100_000 + 6_000 * 6 - 10_000 - 7_200);
  assert.equal(delayed.financingCost, 0);
});

test('零阈值、没有正的时间收益时反向边界无解', () => {
  const zero = calculateBoundary(car, metro, profile, 0);
  assert.equal(zero.minimumDailyMinutes, null);
  const slow = { ...car, time: { ...car.time, oneWayTravelMinutes: 100 } };
  assert.equal(calculateBoundary(slow, metro, profile, 100).maximumCarPrice, null);
});

test('零使用次数、零自由现金流、未节省时间返回空值', () => {
  const zeroProfile = { ...profile, monthlyIncome: 0 };
  const x = calculateConsumption({ ...phone, annualUses: 0 }, zeroProfile);
  assert.equal(x.costPerUse, null);
  assert.equal(x.freeCashFlowMonths, null);
  const slowCar = { ...car, time: { ...car.time, oneWayTravelMinutes: 100 } };
  assert.equal(calculateTransport(slowCar, metro, profile).costPerSavedHour, null);
});

test('负数、零持有期及不匹配的通勤天数被显式拒绝', () => {
  assert.throws(() => calculateConsumption({ ...phone, purchasePrice: -1 }, profile));
  assert.throws(() => calculateConsumption({ ...phone, heldYears: 0 }, profile));
  assert.throws(() => calculateTransport(car, { ...metro, commuteDaysPerYear: 200 }, profile));
  assert.throws(() => calculateConsumption({ ...phone, heldYears: 101 }, profile));
  assert.throws(() => calculateFinancing(1_000, { mode: 'loan', financedPrice: 1_000, downPayment: 100, termMonths: 0 }));
  assert.throws(() => calculateFinancing(1_000, { mode: 'loan', financedPrice: 1_000, downPayment: 100, termMonths: 1.5 }));
  assert.throws(() => calculateFinancialSnapshot({ ...profile, cash: Number.POSITIVE_INFINITY }));
});

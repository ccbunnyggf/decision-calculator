import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateConsumption, incrementalCost } from '../src/core/consumption.ts';
import { calculateTransport, deriveCarCosts, interpolateResidual } from '../src/core/transport.ts';
import { calculateBoundary, parameterSensitivity } from '../src/core/boundary.ts';
import { defaultState, migrateState } from '../src/state.ts';

const { profile, car, alternatives } = defaultState;
const metro = alternatives[0];
const phone = defaultState.scenarios[1];

test('现金购买区分当下资金占用与全周期经济消耗', () => {
  const x = calculateConsumption({ ...phone, oldAssetMarketValue: 0, sellOldAsset: false }, profile);
  assert.equal(x.costBreakdown.assetCost + x.costBreakdown.financingCost + x.costBreakdown.oneTimeExtras + x.costBreakdown.fixedHoldingTotal + x.costBreakdown.variableUseTotal, x.economicTco);
  assert.equal(x.initialFundingMonths, x.netInitialOutlay / 6000);
  assert.equal(x.economicCostCashFlowMonths, x.economicTco / 6000);
  assert.notEqual(x.initialFundingMonths, x.economicCostCashFlowMonths);
  assert.equal(x.feasibility, 'within_reserve');
  assert.equal(x.details.opportunityCost.inputs.最终机会成本, x.opportunityCost);
  assert.match(x.details.opportunityCost.note!, /不是投资收益预测/);
});

test('现金不足与跌破安全垫分开判断并披露缺口', () => {
  const poor = calculateConsumption({ ...phone, oldAssetMarketValue: 0, sellOldAsset: false }, { ...profile, cash: 0 });
  assert.equal(poor.feasibility, 'insufficient_cash');
  assert.equal(poor.fundingGap, poor.netInitialOutlay);
  const thin = calculateConsumption({ ...phone, oldAssetMarketValue: 0, sellOldAsset: false }, { ...profile, cash: 41_000 });
  assert.equal(thin.feasibility, 'below_reserve');
  assert.equal(thin.reserveShortfall, 40_000 - thin.cashAfterPurchase);
});

test('继续持有用当前市值，不计历史购买价；旧物出售只影响现金', () => {
  const keep = calculateConsumption(defaultState.scenarios[0], profile);
  assert.equal(keep.kind, 'keep_existing');
  assert.equal(keep.initialOutlay, 0);
  const sell = calculateConsumption(phone, profile);
  const noSell = calculateConsumption({ ...phone, sellOldAsset: false }, profile);
  assert.equal(sell.economicTco, noSell.economicTco);
  assert.equal(noSell.netInitialOutlay - sell.netInitialOutlay, 1500);
  assert.equal(sell.incrementalVsKeepOld, sell.economicTco - sell.keepOldEconomicCost!);
});

test('不同持有周期不产生虚假的总TCO增量', () => {
  const a = calculateConsumption(phone, profile);
  const b = calculateConsumption({ ...phone, heldYears: 5 }, profile);
  assert.throws(() => incrementalCost(a, b), /覆盖周期不同/);
});

test('残值锚点线性插值，范围外和数据不足不推测', () => {
  assert.equal(interpolateResidual([{ years: 1, value: 100 }, { years: 5, value: 20 }], 3), 60);
  assert.equal(interpolateResidual([{ years: 1, value: 100 }, { years: 5, value: 20 }], 8), null);
  assert.equal(interpolateResidual([{ years: 1, value: 100 }], 3), null);
  const three = calculateTransport({ ...car, item: { ...car.item, heldYears: 3 } }, metro, profile);
  assert.equal(three.car.resaleValue, 92_000);
  assert.throws(() => calculateTransport({ ...car, item: { ...car.item, heldYears: 12 } }, metro, profile), /锚点范围/);
  assert.throws(() => calculateTransport({ ...car, residualAnchors: undefined, item: { ...car.item, heldYears: 3 } }, metro, profile), /可靠残值模型/);
});

test('公里、通勤天数驱动自动能源、里程费和变量停车，固定停车不变', () => {
  const first = deriveCarCosts(car);
  const changed = deriveCarCosts({ ...car, roundTripCommuteKm: 40, parkingPerCommuteDay: 8 });
  assert.equal(first.annualCommuteKm, 7500);
  assert.equal(first.annualNonCommuteKm, 4500);
  assert.equal(first.annualTotalKm, 12000);
  assert.ok(Math.abs(changed.annualEnergyCost - first.annualEnergyCost - 2500 * car.energyCostPerKm!) < 1e-8);
  assert.equal(changed.variableAnnualParking - first.variableAnnualParking, 8 * 250);
  assert.equal(changed.fixedAnnualParking, first.fixedAnnualParking);
  const fewer = deriveCarCosts({ ...car, commuteDaysPerYear: 200, parkingPerCommuteDay: 8 });
  assert.equal(fewer.annualCommuteKm, 6000);
  assert.equal(fewer.variableAnnualParking, 1600);
});

test('固定能源模式显示依赖断开，不随公里自动改变', () => {
  const fixed = { ...car, energyMode: 'fixed' as const };
  assert.equal(deriveCarCosts(fixed).annualEnergyCost, deriveCarCosts({ ...fixed, roundTripCommuteKm: 50 }).annualEnergyCost);
  assert.match(deriveCarCosts(fixed).warnings.join(' '), /固定能源模式/);
});

test('额外里程变动成本只加一次，不能合并已计的能源与固定维护', () => {
  const a = calculateTransport({ ...car, extraMileageCostPerKm: 0, perKmWear: 0.2 }, metro, profile);
  const b = calculateTransport({ ...car, extraMileageCostPerKm: 0.1, perKmWear: 0.2 }, metro, profile);
  assert.equal(b.car.baseTco - a.car.baseTco, 0.1 * 12000 * 5);
  assert.equal(b.derived.annualEnergyCost, a.derived.annualEnergyCost);
  assert.equal(b.car.costBreakdown.fixedHoldingAnnual, a.car.costBreakdown.fixedHoldingAnnual);
  assert.match(b.derived.warnings.join(' '), /不得包含期末残值折旧/);
});

test('机会成本率、残值、年限、停车与每天节省时间均可做敏感性计算', () => {
  const rate = parameterSensitivity(car, metro, profile, 'opportunityRate', [0, .02, .04, .06]);
  assert.ok(rate[0].carEconomicTco! < rate[3].carEconomicTco!);
  const resale = parameterSensitivity(car, metro, profile, 'resaleValue', [50_000, 70_000]);
  assert.ok(resale[0].carEconomicTco! > resale[1].carEconomicTco!);
  const years = parameterSensitivity(car, metro, profile, 'heldYears', [3, 5, 12]);
  assert.equal(years[0].carEconomicTco !== null, true);
  assert.equal(years[2].carEconomicTco, null);
  const parking = parameterSensitivity(car, metro, profile, 'annualParking', [0, 6000]);
  assert.equal(parking[1].carEconomicTco! - parking[0].carEconomicTco!, 30_000);
  const time = parameterSensitivity(car, metro, profile, 'dailySavedMinutes', [25, 50]);
  assert.equal(time[0].carEconomicTco, time[1].carEconomicTco);
  assert.equal(time[0].costPerSavedHour, time[1].costPerSavedHour! * 2);
});

test('边界反解随用户支付意愿变化，交点满足公式', () => {
  const low = calculateBoundary(car, metro, profile, 50);
  const high = calculateBoundary(car, metro, profile, 200);
  assert.ok(low.minimumDailyMinutes! > high.minimumDailyMinutes!);
  assert.ok(low.maximumCarPrice! < high.maximumCarPrice!);
  const x = calculateTransport({ ...car, item: { ...car.item, purchasePrice: high.maximumCarPrice! } }, metro, profile);
  assert.ok(Math.abs(x.incrementalTco - 200 * x.totalSavedHours) < .01);
});

test('可利用时间比例仅调整不可自由支配时间，不改变钟表时间', () => {
  const base = calculateTransport(car, metro, profile);
  const ratio = calculateTransport({ ...car, usableTravelTimeRatio: 0 }, { ...metro, usableTravelTimeRatio: .5 }, profile);
  assert.equal(base.dailySavedMinutes, ratio.dailySavedMinutes);
  assert.equal(base.unusableDailyMinutesDifference, null);
  assert.equal(ratio.unusableDailyMinutesDifference, 120 - 38 - 70);
});

test('旧版数据迁移保持原里程与固定能源逻辑、方案种类和数据', () => {
  const legacy = { ...defaultState, analysisHorizonYears: undefined, experienceDimensions: undefined,
    scenarios: [{ ...defaultState.scenarios[0], kind: undefined }],
    car: { ...car, energyMode: undefined, energyCostPerKm: undefined, roundTripCommuteKm: undefined,
      annualNonCommuteKm: undefined, residualAnchors: undefined, residualReferenceYears: undefined } };
  const migrated = migrateState(legacy as unknown as typeof defaultState);
  assert.equal(migrated.scenarios[0].kind, 'keep_existing');
  assert.equal(migrated.car.energyMode, 'fixed');
  assert.equal(migrated.car.residualReferenceYears, car.item.heldYears);
  assert.equal(deriveCarCosts(migrated.car).annualTotalKm, car.annualKm);
  assert.equal(migrated.analysisHorizonYears, 3);
});

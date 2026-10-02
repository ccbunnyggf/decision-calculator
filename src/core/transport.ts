import { finite, nonNegative, positive } from './finance.ts';
import { calculateConsumption } from './consumption.ts';
import type { CarDerivedCosts, CarScenario, CommuteTime, FinancialProfile, ResidualAnchor, TransportAlternative, TransportResult } from './types.ts';

export function dailyCommuteMinutes(time: CommuteTime): number {
  for (const [key, value] of Object.entries(time)) nonNegative(value, key);
  return 2 * (time.oneWayTravelMinutes + time.oneWayTransferMinutes
    + time.oneWayWaitingMinutes + time.oneWayWalkingMinutes + time.oneWayParkingMinutes);
}

export function dailyUnusableMinutes(time: CommuteTime, usableTravelTimeRatio?: number): number | null {
  if (usableTravelTimeRatio === undefined) return null;
  nonNegative(usableTravelTimeRatio, '可自由利用时间比例');
  if (usableTravelTimeRatio > 1) throw new RangeError('可自由利用时间比例不能超过 100%');
  return dailyCommuteMinutes(time) - 2 * time.oneWayTravelMinutes * usableTravelTimeRatio;
}

export function deriveCarCosts(car: CarScenario): CarDerivedCosts {
  const fields = [
    ['固定年度停车成本', car.annualParking], ['固定年度能源成本', car.annualEnergy],
    ['年路桥费估算', car.annualRoadFees], ['年总公里', car.annualKm],
    ['年通勤天数', car.commuteDaysPerYear], ['按通勤日停车费', car.parkingPerCommuteDay ?? 0],
    ['单位公里能源成本', car.energyCostPerKm ?? 0], ['每公里路桥费', car.roadFeesPerKm ?? 0],
    ['额外里程变动成本', car.extraMileageCostPerKm ?? car.perKmWear ?? 0],
  ] as const;
  for (const [label, value] of fields) nonNegative(value, label);
  const linked = car.roundTripCommuteKm !== undefined && car.annualNonCommuteKm !== undefined;
  if (car.roundTripCommuteKm !== undefined) nonNegative(car.roundTripCommuteKm, '通勤往返公里');
  if (car.annualNonCommuteKm !== undefined) nonNegative(car.annualNonCommuteKm, '年非通勤公里');
  const annualCommuteKm = linked ? car.roundTripCommuteKm! * car.commuteDaysPerYear : null;
  const annualNonCommuteKm = linked ? car.annualNonCommuteKm! : null;
  const annualTotalKm = linked ? annualCommuteKm! + annualNonCommuteKm! : car.annualKm;
  finite(annualTotalKm, '年总公里');
  const mode = car.energyMode ?? 'fixed';
  if (mode === 'automatic' && car.energyCostPerKm === undefined) throw new RangeError('自动能源模式需要输入每公里能源成本');
  const annualEnergyCost = mode === 'automatic' ? annualTotalKm * car.energyCostPerKm! : car.annualEnergy;
  const fixedAnnualParking = car.annualParking;
  const variableAnnualParking = (car.parkingPerCommuteDay ?? 0) * car.commuteDaysPerYear;
  const annualRoadCost = car.annualRoadFees + (car.roadFeesPerKm ?? 0) * annualTotalKm;
  // Only marginal mileage costs omitted from residual value, energy, fixed
  // maintenance and tolls belong here. Never add the legacy alias twice.
  const annualExtraMileageCost = (car.extraMileageCostPerKm ?? car.perKmWear ?? 0) * annualTotalKm;
  const annualFixedCostAdded = fixedAnnualParking;
  const annualVariableCostAdded = annualEnergyCost + variableAnnualParking + annualRoadCost + annualExtraMileageCost;
  for (const [label, value] of [
    ['年能源成本', annualEnergyCost], ['年变量停车费', variableAnnualParking],
    ['年路桥成本', annualRoadCost], ['年额外里程成本', annualExtraMileageCost],
    ['年变量成本合计', annualVariableCostAdded],
  ] as const) finite(value, label);
  const warnings: string[] = [];
  if (!linked) warnings.push('年通勤与非通勤里程尚未拆分；沿用原年总公里，通勤天数变化不会带动里程。');
  if (mode === 'fixed') warnings.push('固定能源模式：改变年行驶公里不会自动改变能源成本。');
  if (car.extraMileageCostPerKm !== undefined && car.perKmWear !== undefined)
    warnings.push('已忽略旧版“每公里额外损耗”，只计算新版额外里程变动成本一次。');
  if ((car.extraMileageCostPerKm ?? car.perKmWear ?? 0) > 0)
    warnings.push('额外里程变动成本不得包含期末残值折旧、能源费或已填写的固定维护费。');
  if ((car.roadFeesPerKm ?? 0) > 0 && car.annualRoadFees > 0)
    warnings.push('请确认年路桥费估算与每公里路桥费没有覆盖同一笔费用。');
  return {
    mileageLinked: linked, annualCommuteKm, annualNonCommuteKm, annualTotalKm,
    annualEnergyCost, fixedAnnualParking, variableAnnualParking, annualRoadCost,
    annualExtraMileageCost, annualFixedCostAdded, annualVariableCostAdded, warnings,
  };
}

export function interpolateResidual(anchors: ResidualAnchor[] | undefined, years: number): number | null {
  positive(years, '持有年限');
  if (!anchors || anchors.length < 2) return null;
  const sorted = [...anchors].sort((a, b) => a.years - b.years);
  for (let i = 0; i < sorted.length; i++) {
    positive(sorted[i].years, '残值锚点年数');
    nonNegative(sorted[i].value, '残值锚点金额');
    if (i > 0 && sorted[i].years === sorted[i - 1].years) throw new RangeError('残值锚点年数不能重复');
  }
  if (years < sorted[0].years || years > sorted[sorted.length - 1].years) return null;
  const exact = sorted.find(a => a.years === years);
  if (exact) return exact.value;
  const upper = sorted.findIndex(a => a.years > years);
  const a = sorted[upper - 1], b = sorted[upper];
  const fraction = (years - a.years) / (b.years - a.years);
  return Math.max(0, a.value + (b.value - a.value) * fraction);
}

export function resolveCarResidual(car: CarScenario, annualTotalKm: number): number {
  const years = positive(car.item.heldYears, '持有年限');
  const modeled = interpolateResidual(car.residualAnchors, years);
  if (modeled === null) {
    if (car.residualAnchors && car.residualAnchors.length >= 2)
      throw new RangeError('持有年限超出残值锚点范围；请增加锚点，不进行无限外推');
    if (car.residualReferenceYears !== undefined && Math.abs(years - car.residualReferenceYears) > 1e-9)
      throw new RangeError('当前持有年限变化未建立可靠残值模型');
    return nonNegative(car.item.resaleValue, '手动期末残值');
  }
  const referenceKm = car.residualReferenceAnnualKm;
  const marginalLoss = car.residualLossPerExtraKm;
  if (referenceKm === undefined || marginalLoss === undefined) return modeled;
  nonNegative(referenceKm, '残值锚点参考年公里');
  nonNegative(marginalLoss, '额外里程残值影响');
  return Math.max(0, modeled - (annualTotalKm - referenceKm) * years * marginalLoss);
}

export function calculateTransport(
  car: CarScenario, alternative: TransportAlternative, profile: FinancialProfile,
): TransportResult {
  nonNegative(alternative.annualExtraCost, '替代方案年附加费');
  nonNegative(alternative.commuteDaysPerYear, '替代方案年通勤天数');
  if (car.commuteDaysPerYear !== alternative.commuteDaysPerYear)
    throw new RangeError('比较方案须使用相同的年通勤天数');
  const days = car.commuteDaysPerYear;
  const years = positive(car.item.heldYears, '比较年数');
  const derived = deriveCarCosts(car);
  const resaleValue = resolveCarResidual(car, derived.annualTotalKm);
  const carResult = calculateConsumption({
    ...car.item, resaleValue,
    extraAnnualFixedCosts: derived.annualFixedCostAdded,
    extraAnnualVariableCosts: derived.annualVariableCostAdded,
    annualUses: car.item.annualUses || days * 2,
  }, profile);
  const fare = alternative.farePerDay !== undefined
    ? nonNegative(alternative.farePerDay, '每日交通费')
    : 2 * nonNegative(alternative.farePerTrip ?? 0, '单次交通费');
  const alternativeAnnualCost = fare * days + alternative.annualExtraCost;
  const alternativeEconomicTco = alternativeAnnualCost * years;
  finite(alternativeEconomicTco, '替代方案经济 TCO');
  const alternativeDailyTimeMinutes = dailyCommuteMinutes(alternative.time);
  const carDailyTimeMinutes = dailyCommuteMinutes(car.time);
  const dailySavedMinutes = alternativeDailyTimeMinutes - carDailyTimeMinutes;
  const annualSavedHours = dailySavedMinutes * days / 60;
  const totalSavedHours = annualSavedHours * years;
  const incrementalTco = carResult.economicTco - alternativeEconomicTco;
  finite(totalSavedHours, '总节省时间');
  finite(incrementalTco, '增量经济 TCO');
  const alternativeUnusableDailyMinutes = dailyUnusableMinutes(alternative.time, alternative.usableTravelTimeRatio);
  const carUnusableDailyMinutes = dailyUnusableMinutes(car.time, car.usableTravelTimeRatio);
  return {
    car: carResult, derived, alternativeEconomicTco, alternativeAnnualCost,
    alternativeDailyTimeMinutes, carDailyTimeMinutes, dailySavedMinutes,
    annualSavedHours, totalSavedHours, incrementalTco,
    costPerSavedHour: totalSavedHours > 0 ? incrementalTco / totalSavedHours : null,
    economicCostPerKm: derived.annualTotalKm * years > 0 ? carResult.economicTco / (derived.annualTotalKm * years) : null,
    economicCostPerCommuteDay: days * years > 0 ? carResult.economicTco / (days * years) : null,
    alternativeUnusableDailyMinutes, carUnusableDailyMinutes,
    unusableDailyMinutesDifference: alternativeUnusableDailyMinutes !== null && carUnusableDailyMinutes !== null
      ? alternativeUnusableDailyMinutes - carUnusableDailyMinutes : null,
  };
}

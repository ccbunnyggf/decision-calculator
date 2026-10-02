import { calculateTransport } from './transport.ts';
import { finite, nonNegative } from './finance.ts';
import type { BoundaryResult, CarScenario, FinancialProfile, SensitivityParameter, SensitivityRow, TransportAlternative } from './types.ts';

export function withCarPrice(car: CarScenario, price: number): CarScenario {
  const currentPrice = car.item.purchasePrice;
  const financing = car.item.financing;
  if (!financing || financing.mode === 'cash' || financing.mode === 'delay') {
    return { ...car, item: { ...car.item, purchasePrice: price } };
  }
  const priceChange = price - currentPrice;
  const financedPrice = Math.max(0, (financing.financedPrice ?? currentPrice) + priceChange);
  const downShare = currentPrice > 0 ? (financing.downPayment ?? 0) / currentPrice : 0;
  return {
    ...car,
    item: {
      ...car.item,
      purchasePrice: price,
      financing: {
        ...financing,
        financedPrice,
        downPayment: Math.min(financedPrice, Math.max(0, price * downShare)),
      },
    },
  };
}

function maxAllowed(fn: (value: number) => number, cap: number): number | null {
  if (fn(0) > 0) return null;
  if (fn(cap) <= 0) return null;
  let low = 0;
  let high = cap;
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    if (fn(mid) <= 0) low = mid;
    else high = mid;
  }
  return low;
}

export function calculateBoundary(
  car: CarScenario, alternative: TransportAlternative,
  profile: FinancialProfile, valuePerHour: number, dailySavedMinutesOverride?: number,
): BoundaryResult {
  nonNegative(valuePerHour, '每小时愿付金额');
  if (dailySavedMinutesOverride !== undefined) nonNegative(dailySavedMinutesOverride, '假设每日节省分钟');
  const current = calculateTransport(car, alternative, profile);
  const days = car.commuteDaysPerYear;
  const years = car.item.heldYears;
  const scenarioSavedHours = dailySavedMinutesOverride === undefined
    ? current.totalSavedHours : dailySavedMinutesOverride * days * years / 60;
  const allowableCost = valuePerHour * Math.max(0, scenarioSavedHours);
  finite(allowableCost, '时间价值预算');
  const minimumDailyMinutes = days > 0 && years > 0 && valuePerHour > 0
    ? Math.max(0, current.incrementalTco * 60 / (valuePerHour * days * years))
    : current.incrementalTco <= 0 ? 0 : null;
  const canUsePriceBoundary = scenarioSavedHours > 0;
  const maximumCarPrice = canUsePriceBoundary
    ? maxAllowed(price => calculateTransport(withCarPrice(car, price), alternative, profile).incrementalTco - allowableCost, 100_000_000)
    : null;
  const maximumAnnualParking = canUsePriceBoundary
    ? maxAllowed(parking => calculateTransport({ ...car, annualParking: parking }, alternative, profile).incrementalTco - allowableCost, 10_000_000)
    : null;
  const curveStart = Math.max(1, Math.min(60, (minimumDailyMinutes ?? 60) / 4));
  const curveEnd = Math.max(180, Math.min(1_440, (minimumDailyMinutes ?? 60) * 2));
  const curve = Array.from({ length: 91 }, (_, i) => {
    const dailySavedMinutes = curveStart + (curveEnd - curveStart) * i / 90;
    const hours = dailySavedMinutes * days * years / 60;
    return {
      dailySavedMinutes,
      costPerSavedHour: hours > 0 ? current.incrementalTco / hours : null,
    };
  });
  return { valuePerHour, minimumDailyMinutes, maximumCarPrice, maximumAnnualParking, curve };
}

export function priceSensitivity(
  scenario: CarScenario, alternative: TransportAlternative, profile: FinancialProfile,
  prices: number[],
) {
  return prices.map(price => {
    nonNegative(price, '价格');
    const car = withCarPrice(scenario, price);
    const result = calculateTransport(car, alternative, profile);
    return {
      price,
      freeCashFlowMonths: result.car.initialFundingMonths,
      reserveGap: result.car.reserveGap,
    };
  });
}

export function parameterSensitivity(
  car: CarScenario, alternative: TransportAlternative, profile: FinancialProfile,
  parameter: SensitivityParameter, inputs: number[],
): SensitivityRow[] {
  return inputs.map(input => {
    try {
      nonNegative(input, '敏感性参数');
      let changed = car;
      let savedMinutes: number | undefined;
      switch (parameter) {
        case 'opportunityRate': changed = { ...car, item: { ...car.item, opportunityRate: input } }; break;
        case 'resaleValue': changed = { ...car, item: { ...car.item, resaleValue: input }, residualAnchors: undefined, residualReferenceYears: car.item.heldYears }; break;
        case 'heldYears': changed = { ...car, item: { ...car.item, heldYears: input } }; break;
        case 'annualParking': changed = { ...car, annualParking: input }; break;
        case 'dailySavedMinutes': savedMinutes = input; break;
      }
      const result = calculateTransport(changed, alternative, profile);
      const hours = savedMinutes === undefined ? result.totalSavedHours : savedMinutes * car.commuteDaysPerYear * car.item.heldYears / 60;
      return {
        input, carEconomicTco: result.car.economicTco,
        incrementalTco: result.incrementalTco,
        costPerSavedHour: hours > 0 ? result.incrementalTco / hours : null,
        note: parameter === 'resaleValue' ? '手动残值情景；仅覆盖当前持有年限的插值结果。' : undefined,
      };
    } catch (error) {
      return { input, carEconomicTco: null, incrementalTco: null, costPerSavedHour: null,
        note: error instanceof Error ? error.message : '输入无效' };
    }
  });
}

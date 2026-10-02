import type { CarScenario, ConsumptionScenario, CurrentAsset, FinancialProfile, TransportAlternative } from './core/types.ts';

export interface AppState {
  profile: FinancialProfile;
  scenarios: ConsumptionScenario[];
  car: CarScenario;
  alternatives: TransportAlternative[];
  selectedAlternativeId: string;
  timeValue: number;
  assumedSavedMinutes: number;
  currentAsset: CurrentAsset;
  analysisHorizonYears: number;
  experienceDimensions: string[];
}

const zeroTime = { oneWayTravelMinutes: 0, oneWayTransferMinutes: 0, oneWayWaitingMinutes: 0, oneWayWalkingMinutes: 0, oneWayParkingMinutes: 0 };

export const defaultState: AppState = {
  profile: {
    cash: 100_000, monthlyIncome: 20_000, monthlyEssentials: 8_000,
    monthlyDebt: 2_000, monthlySaving: 3_000, monthlyKnownCommitments: 1_000,
    nearTermKnownCommitments: 10_000, minimumReserve: 40_000,
    otherLiquidAssets: 20_000, externalEmergencySupport: false,
  },
  scenarios: [
    { id: 'keep', name: '继续使用旧设备', kind: 'keep_existing', ownedAlready: true, purchasePrice: 1_500, heldYears: 3, usefulLifeYears: 5, resaleValue: 200, annualMaintenance: 200, annualConsumables: 0, annualInsuranceSubscriptions: 0, oneTimeExtras: 0, annualUses: 365, opportunityRate: 0.05, experience: { 影像: 2, 续航: 2, 游戏稳定性: 3, 屏幕: 3, 性能余量: 2 } },
    { id: 'mid', name: '中端新设备', kind: 'purchase_new', purchasePrice: 4_500, heldYears: 3, usefulLifeYears: 5, resaleValue: 800, annualMaintenance: 100, annualConsumables: 0, annualInsuranceSubscriptions: 0, oneTimeExtras: 100, annualUses: 365, opportunityRate: 0.05, oldAssetMarketValue: 1_500, sellOldAsset: true, experience: { 影像: 3, 续航: 4, 游戏稳定性: 4, 屏幕: 4, 性能余量: 3 } },
    { id: 'high', name: '旗舰新设备', kind: 'purchase_new', purchasePrice: 7_000, heldYears: 3, usefulLifeYears: 5, resaleValue: 1_500, annualMaintenance: 100, annualConsumables: 0, annualInsuranceSubscriptions: 0, oneTimeExtras: 100, annualUses: 365, opportunityRate: 0.05, oldAssetMarketValue: 1_500, sellOldAsset: true, experience: { 影像: 5, 续航: 5, 游戏稳定性: 5, 屏幕: 5, 性能余量: 5 } },
  ],
  car: {
    item: { id: 'car', name: '汽车', kind: 'purchase_new', purchasePrice: 150_000, heldYears: 5, usefulLifeYears: 10, resaleValue: 70_000, annualMaintenance: 3_000, annualConsumables: 0, annualInsuranceSubscriptions: 5_000, oneTimeExtras: 10_000, annualUses: 500, opportunityRate: 0.04 },
    annualParking: 6_000, annualEnergy: 8_000, annualRoadFees: 2_000,
    extraMileageCostPerKm: 0.1, annualKm: 12_000, roundTripCommuteKm: 30, annualNonCommuteKm: 4_500, commuteDaysPerYear: 250,
    energyMode: 'automatic', energyCostPerKm: 8_000 / 12_000, parkingPerCommuteDay: 0,
    residualAnchors: [{ years: 1, value: 120_000 }, { years: 3, value: 92_000 }, { years: 5, value: 70_000 }, { years: 8, value: 43_000 }],
    residualReferenceYears: 5, residualReferenceAnnualKm: 12_000,
    time: { ...zeroTime, oneWayTravelMinutes: 28, oneWayWalkingMinutes: 3, oneWayParkingMinutes: 4 },
    experience: { comfort: 4, flexibility: 5, privacy: 5, fatigue: 3, crowding: 1, parkingDifficulty: 4, weatherExposure: 1, drivingStress: 3, readingOpportunity: 1, accidentExposure: 3 },
  },
  alternatives: [
    { id: 'metro', name: '地铁', mode: 'metro', farePerTrip: 5, annualExtraCost: 0, commuteDaysPerYear: 250, time: { ...zeroTime, oneWayTravelMinutes: 38, oneWayTransferMinutes: 8, oneWayWaitingMinutes: 5, oneWayWalkingMinutes: 9 }, experience: { comfort: 2, flexibility: 2, privacy: 1, fatigue: 3, crowding: 4, parkingDifficulty: 1, weatherExposure: 2, drivingStress: 1, readingOpportunity: 4, accidentExposure: 2 } },
    { id: 'taxi', name: '打车', mode: 'taxi', farePerTrip: 32, annualExtraCost: 0, commuteDaysPerYear: 250, time: { ...zeroTime, oneWayTravelMinutes: 30, oneWayWaitingMinutes: 5, oneWayWalkingMinutes: 2 }, experience: {} },
  ],
  selectedAlternativeId: 'metro',
  timeValue: 100,
  assumedSavedMinutes: 50,
  currentAsset: { name: '现有相机', originalPrice: 8_000, marketValueNow: 6_500, futureResaleValue: 4_000, furtherYears: 2, annualKeepingCost: 100, opportunityRate: 0.05, annualUses: 20 },
  analysisHorizonYears: 3,
  experienceDimensions: ['影像', '续航', '游戏稳定性', '屏幕', '性能余量'],
};

const STORAGE_KEY = 'consumer-boundary-app-v2';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return migrateState(JSON.parse(raw) as Partial<AppState>);
  } catch {
    return defaultState;
  }
}

export function migrateState(data: Partial<AppState>): AppState {
  if (!data.profile || !Array.isArray(data.scenarios) || data.scenarios.length === 0 || !data.car || !Array.isArray(data.alternatives) || data.alternatives.length === 0) return defaultState;
  const scenarios = data.scenarios.map(s => ({ ...s, kind: s.kind ?? (s.ownedAlready ? 'keep_existing' as const : 'purchase_new' as const) }));
  const oldCar = data.car;
  const car: CarScenario = {
    ...oldCar,
    item: { ...oldCar.item, kind: oldCar.item.kind ?? (oldCar.item.ownedAlready ? 'keep_existing' : 'purchase_new') },
    energyMode: oldCar.energyMode ?? 'fixed',
    residualReferenceYears: oldCar.residualReferenceYears ?? oldCar.item.heldYears,
  };
  return { ...defaultState, ...data, scenarios, car,
    analysisHorizonYears: data.analysisHorizonYears ?? scenarios[0].heldYears,
    experienceDimensions: data.experienceDimensions ?? defaultState.experienceDimensions };
}

export function saveState(state: AppState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* Calculations remain usable when storage is unavailable. */ }
}

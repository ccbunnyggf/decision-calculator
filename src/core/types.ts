export type Yuan = number;
export type Years = number;
export type AnnualRate = number; // decimal: 0.05 = 5%
export type ScenarioKind = 'purchase_new' | 'keep_existing';
export type ExperienceDirection = 'positive' | 'negative';
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface CostBreakdown {
  assetCost: Yuan;
  acquisitionLessResale: Yuan;
  opportunityCost: Yuan;
  financingCost: Yuan;
  oneTimeExtras: Yuan;
  fixedHoldingAnnual: Yuan;
  fixedHoldingTotal: Yuan;
  variableUseAnnual: Yuan;
  variableUseTotal: Yuan;
}

export type PurchaseFeasibility = 'insufficient_cash' | 'below_reserve' | 'within_reserve';

export interface FinancialProfile {
  cash: Yuan;
  monthlyIncome: Yuan;
  monthlyEssentials: Yuan;
  monthlyDebt: Yuan;
  monthlySaving: Yuan;
  monthlyKnownCommitments: Yuan;
  nearTermKnownCommitments: Yuan;
  minimumReserve: Yuan;
  otherLiquidAssets: Yuan;
  externalEmergencySupport: boolean;
}

export interface FinancialSnapshot {
  monthlyFreeCashFlow: Yuan;
  allocatableCash: Yuan;
  monthsOfEssentialCoverage: number | null;
}

export type FinanceMode = 'cash' | 'loan' | 'installment' | 'family' | 'delay';

export interface Financing {
  mode: FinanceMode;
  financedPrice?: Yuan; // sticker price under this payment plan, before interest and fees
  downPayment?: Yuan;
  totalInterest?: Yuan;
  fees?: Yuan;
  upfrontFees?: Yuan;
  termMonths?: number;
  monthlyPayment?: Yuan; // optional disclosed payment; compared with derived payment
  delayMonths?: number;
  cashDiscountAvailable?: boolean;
  advertisedZeroRate?: boolean;
}

export interface FinancingResult {
  mode: FinanceMode;
  financedPrice: Yuan;
  principal: Yuan;
  pricePremium: Yuan;
  totalFinancingCost: Yuan;
  initialPayment: Yuan;
  derivedMonthlyPayment: Yuan;
  disclosedMonthlyPayment: Yuan | null;
  paymentMismatch: Yuan | null;
  delayMonths: number;
}

export interface ConsumptionScenario {
  id: string;
  name: string;
  kind?: ScenarioKind; // old saved data without this field is migrated at load time
  ownedAlready?: boolean; // legacy alias; kind takes precedence
  purchasePrice: Yuan;
  heldYears: Years;
  usefulLifeYears?: Years;
  resaleValue: Yuan;
  annualMaintenance: Yuan;
  annualConsumables: Yuan;
  annualInsuranceSubscriptions: Yuan;
  oneTimeExtras: Yuan;
  annualUses: number;
  opportunityRate: AnnualRate;
  financing?: Financing;
  oldAssetMarketValue?: Yuan;
  oldAssetAnnualCost?: Yuan;
  oldAssetFutureResale?: Yuan;
  sellOldAsset?: boolean;
  extraAnnualFixedCosts?: Yuan; // derived transport costs, never entered twice
  extraAnnualVariableCosts?: Yuan; // derived transport costs, never entered twice
  experience?: Partial<Record<string, Rating>>;
}

export interface FormulaDetail {
  formula: string;
  inputs: Record<string, number | string>;
  note?: string;
}

export interface ConsumptionResult {
  scenarioId: string;
  name: string;
  kind: ScenarioKind;
  heldYears: Years;
  costBreakdown: CostBreakdown;
  baseTco: Yuan;
  opportunityCost: Yuan;
  economicTco: Yuan;
  annualCost: Yuan;
  monthlyCost: Yuan;
  costPerUse: Yuan | null;
  totalUses: number;
  annualOperatingCost: Yuan;
  financingCost: Yuan;
  oldAssetSale: Yuan;
  keepOldEconomicCost: Yuan | null;
  incrementalVsKeepOld: Yuan | null;
  resaleValue: Yuan;
  initialOutlay: Yuan;
  netInitialOutlay: Yuan;
  freeCashFlowMonths: number | null;
  initialFundingMonths: number | null;
  economicCostCashFlowMonths: number | null;
  cashAfterPurchase: Yuan;
  reserveGap: Yuan;
  fundingGap: Yuan;
  reserveShortfall: Yuan;
  feasibility: PurchaseFeasibility;
  executionCashBase: Yuan;
  lifetimeRealization: number | null;
  financing: FinancingResult;
  details: Record<string, FormulaDetail>;
}

export interface CurrentAsset {
  name: string;
  originalPrice: Yuan;
  marketValueNow: Yuan;
  futureResaleValue: Yuan;
  furtherYears: Years;
  annualKeepingCost: Yuan;
  opportunityRate: AnnualRate;
  annualUses: number;
}

export interface KeepAssetResult {
  historicalPrice: Yuan;
  cashAvailableIfSoldNow: Yuan;
  foregoneSaleProceeds: Yuan;
  futureEconomicCost: Yuan;
  futureOpportunityCost: Yuan;
  futureCostPerUse: Yuan | null;
}

export type TransportMode = 'car' | 'metro' | 'bus' | 'taxi' | 'bike' | 'other';

export interface CommuteTime {
  oneWayTravelMinutes: number;
  oneWayTransferMinutes: number;
  oneWayWaitingMinutes: number;
  oneWayWalkingMinutes: number;
  oneWayParkingMinutes: number;
}

export interface TransportAlternative {
  id: string;
  name: string;
  mode: Exclude<TransportMode, 'car'>;
  farePerTrip?: Yuan;
  farePerDay?: Yuan;
  annualExtraCost: Yuan;
  commuteDaysPerYear: number;
  time: CommuteTime;
  usableTravelTimeRatio?: number; // fraction of in-vehicle time, 0..1; no default assumption
  experience: ExperienceScores;
}

export interface ResidualAnchor {
  years: Years;
  value: Yuan;
}

export type EnergyCostMode = 'automatic' | 'fixed';

export interface CarScenario {
  item: ConsumptionScenario;
  annualParking: Yuan; // fixed annual parking, retained for V1 data
  parkingPerCommuteDay?: Yuan;
  annualEnergy: Yuan; // used only in fixed energy mode
  energyMode?: EnergyCostMode; // absent in V1 data => fixed, preserving prior result
  energyCostPerKm?: Yuan;
  annualRoadFees: Yuan; // annual user estimate; do not also enter the same toll in per-km field
  roadFeesPerKm?: Yuan;
  perKmWear?: Yuan; // V1 alias, never added on top of extraMileageCostPerKm
  extraMileageCostPerKm?: Yuan;
  annualKm: number; // V1 total-mileage fallback when split is unknown
  roundTripCommuteKm?: number;
  annualNonCommuteKm?: number;
  commuteDaysPerYear: number;
  residualAnchors?: ResidualAnchor[];
  residualReferenceYears?: Years;
  residualReferenceAnnualKm?: number;
  residualLossPerExtraKm?: Yuan;
  time: CommuteTime;
  usableTravelTimeRatio?: number;
  experience: ExperienceScores;
}

export type ExperienceKey =
  | 'comfort' | 'flexibility' | 'privacy' | 'fatigue' | 'crowding'
  | 'parkingDifficulty' | 'weatherExposure' | 'drivingStress'
  | 'readingOpportunity' | 'accidentExposure';
export type ExperienceScores = Partial<Record<ExperienceKey, Rating>>;

export interface ExperienceDimension {
  key: ExperienceKey;
  label: string;
  direction: ExperienceDirection;
}

export interface CarDerivedCosts {
  mileageLinked: boolean;
  annualCommuteKm: number | null;
  annualNonCommuteKm: number | null;
  annualTotalKm: number;
  annualEnergyCost: Yuan;
  fixedAnnualParking: Yuan;
  variableAnnualParking: Yuan;
  annualRoadCost: Yuan;
  annualExtraMileageCost: Yuan;
  annualFixedCostAdded: Yuan;
  annualVariableCostAdded: Yuan;
  warnings: string[];
}

export interface TransportResult {
  car: ConsumptionResult;
  derived: CarDerivedCosts;
  alternativeEconomicTco: Yuan;
  alternativeAnnualCost: Yuan;
  alternativeDailyTimeMinutes: number;
  carDailyTimeMinutes: number;
  dailySavedMinutes: number;
  annualSavedHours: number;
  totalSavedHours: number;
  incrementalTco: Yuan;
  costPerSavedHour: Yuan | null;
  economicCostPerKm: Yuan | null;
  economicCostPerCommuteDay: Yuan | null;
  alternativeUnusableDailyMinutes: number | null;
  carUnusableDailyMinutes: number | null;
  unusableDailyMinutesDifference: number | null;
}

export interface BoundaryPoint {
  dailySavedMinutes: number;
  costPerSavedHour: Yuan | null;
}

export interface BoundaryResult {
  valuePerHour: Yuan;
  minimumDailyMinutes: number | null;
  maximumCarPrice: Yuan | null;
  maximumAnnualParking: Yuan | null;
  curve: BoundaryPoint[];
}

export type SensitivityParameter = 'opportunityRate' | 'resaleValue' | 'heldYears' | 'annualParking' | 'dailySavedMinutes';
export interface SensitivityRow {
  input: number;
  carEconomicTco: Yuan | null;
  incrementalTco: Yuan | null;
  costPerSavedHour: Yuan | null;
  note?: string;
}

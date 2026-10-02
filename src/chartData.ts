import { withCarPrice } from './core/boundary.ts';
import { calculateTransport } from './core/transport.ts';
import type { BoundaryPoint, CarScenario, FinancialProfile, TransportAlternative } from './core/types.ts';

export type PlotPoint = { x: number; y: number | null };

export function hourlyCostPoint(incrementalTco: number, days: number, years: number, minutes: number): PlotPoint {
  const hours = minutes * days * years / 60;
  return { x: minutes, y: hours > 0 ? incrementalTco / hours : null };
}

export function timeChartPoints(curve: BoundaryPoint[], currentMinutes: number, boundaryMinutes: number | null,
  incrementalTco: number, days: number, years: number): PlotPoint[] {
  const points = curve.map(p => ({ x: p.dailySavedMinutes, y: p.costPerSavedHour }));
  points.push(hourlyCostPoint(incrementalTco, days, years, currentMinutes));
  if (boundaryMinutes !== null && Number.isFinite(boundaryMinutes)) points.push(hourlyCostPoint(incrementalTco, days, years, boundaryMinutes));
  return points.filter((p, i, all) => all.findIndex(q => Math.abs(q.x - p.x) < 1e-6) === i).sort((a, b) => a.x - b.x);
}

export function priceHourlyPoints(car: CarScenario, alternative: TransportAlternative, profile: FinancialProfile,
  prices: number[], dailySavedMinutes: number): PlotPoint[] {
  const hours = dailySavedMinutes * car.commuteDaysPerYear * car.item.heldYears / 60;
  return [...new Set(prices.filter(Number.isFinite))].sort((a, b) => a - b).map(price => {
    try {
      const r = calculateTransport(withCarPrice(car, price), alternative, profile);
      return { x: price, y: hours > 0 ? r.incrementalTco / hours : null };
    } catch { return { x: price, y: null }; }
  });
}

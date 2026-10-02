import test from 'node:test';
import assert from 'node:assert/strict';
import { priceHourlyPoints, timeChartPoints } from '../src/chartData.ts';
import { calculateBoundary, withCarPrice } from '../src/core/boundary.ts';
import { calculateTransport } from '../src/core/transport.ts';
import { defaultState } from '../src/state.ts';

const { car, profile } = defaultState;
const alternative = defaultState.alternatives[0];

test('时间图显示全部计算点，并保留真实当前点和边界点', () => {
  const t = calculateTransport(car, alternative, profile);
  const b = calculateBoundary(car, alternative, profile, 100, 50);
  const points = timeChartPoints(b.curve, 50, b.minimumDailyMinutes, t.incrementalTco,
    car.commuteDaysPerYear, car.item.heldYears);
  assert.ok(points.length >= b.curve.length);
  assert.ok(b.curve.every(p => points.some(x => x.x === p.dailySavedMinutes && x.y === p.costPerSavedHour)));
  const current = points.find(p => p.x === 50);
  const crossing = points.find(p => p.x === b.minimumDailyMinutes);
  assert.ok(current && crossing);
  assert.equal(current.y, t.incrementalTco / (50 * car.commuteDaysPerYear * car.item.heldYears / 60));
  assert.ok(Math.abs(crossing.y! - 100) < 1e-8);
});

test('价格图使用与边界反解相同的融资价格变换', () => {
  const b = calculateBoundary(car, alternative, profile, 200, 50);
  assert.ok(b.maximumCarPrice !== null);
  const points = priceHourlyPoints(car, alternative, profile,
    [car.item.purchasePrice, b.maximumCarPrice!], 50);
  const crossing = points.find(p => p.x === b.maximumCarPrice);
  assert.ok(crossing);
  assert.ok(Math.abs(crossing.y! - 200) < 1e-8);
  const transport = calculateTransport(withCarPrice(car, car.item.purchasePrice), alternative, profile);
  assert.equal(points.find(p => p.x === car.item.purchasePrice)?.y,
    transport.incrementalTco / (50 * car.commuteDaysPerYear * car.item.heldYears / 60));
});

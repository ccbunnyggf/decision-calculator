import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRoomChangeMs, roomPeriodAt } from '../src/landingTime.ts';

test('本地时间场景在四个指定边界切换', () => {
  for (const [clock, expected] of [
    ['04:59', 'night'], ['05:00', 'morning'], ['09:59', 'morning'],
    ['10:00', 'day'], ['16:59', 'day'], ['17:00', 'sunset'],
    ['19:29', 'sunset'], ['19:30', 'night'],
  ] as const) {
    assert.equal(roomPeriodAt(new Date(`2026-10-02T${clock}:00`)), expected);
  }
});

test('下一次场景更新只安排在时间边界', () => {
  assert.equal(nextRoomChangeMs(new Date('2026-10-02T09:59:59.950')), 100);
  assert.equal(nextRoomChangeMs(new Date('2026-10-02T19:30:00.000')), 9.5 * 60 * 60 * 1000 + 50);
});

export type RoomPeriod = 'morning' | 'day' | 'sunset' | 'night';

export function roomPeriodAt(date: Date): RoomPeriod {
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute >= 300 && minute < 600) return 'morning';
  if (minute >= 600 && minute < 1020) return 'day';
  if (minute >= 1020 && minute < 1170) return 'sunset';
  return 'night';
}

export function nextRoomChangeMs(date: Date): number {
  const elapsed = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
  const nextMinute = [300, 600, 1020, 1170, 1740].find(minute => minute * 60_000 > elapsed) ?? 1740;
  return nextMinute * 60_000 - elapsed + 50;
}

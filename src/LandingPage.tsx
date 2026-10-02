import { useEffect, useRef, useState } from 'react';
import { nextRoomChangeMs, roomPeriodAt, type RoomPeriod } from './landingTime.ts';

const periodNames: Record<RoomPeriod, string> = {
  morning: '早晨', day: '白天', sunset: '傍晚', night: '夜晚',
};
const periodRanges: Record<RoomPeriod, string> = {
  morning: '05:00—09:59', day: '10:00—16:59', sunset: '17:00—19:29', night: '19:30—04:59',
};

export function LandingPage({ onExplore }: { onExplore: () => void }) {
  const [period, setPeriod] = useState(() => roomPeriodAt(new Date()));
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [exiting, setExiting] = useState(false);
  const entered = useRef(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    const now = new Date();
    const timer = window.setTimeout(() => setPeriod(roomPeriodAt(new Date())), nextRoomChangeMs(now));
    return () => window.clearTimeout(timer);
  }, [period]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  const explore = () => {
    if (entered.current) return;
    entered.current = true;
    if (reducedMotion) onExplore();
    else {
      setExiting(true);
      exitTimer.current = window.setTimeout(onExplore, 650);
    }
  };

  return <main className={`landing-page period-${period} ${exiting ? 'is-exiting' : ''}`}>
    <div className="landing-room" aria-hidden="true">
      <div className="landing-window-light" />
      <div className="landing-screen-cell" />
      <div className="landing-steam"><i /><i /><i /></div>
      <div className="landing-traffic" />
      <div className="landing-leaf" />
    </div>
    <span className="landing-period" aria-label={`本地时间场景：${periodNames[period]}`}>
      <strong>{periodNames[period]}</strong><small>本地时间 · {periodRanges[period]}</small>
    </span>
    <div className="landing-hero">
      <h1>每个选择，都算数。</h1>
      <p>生活不只有价格，还有时间、体验和更多的可能性。</p>
      <button type="button" onClick={explore} disabled={exiting}>开始探索 <span aria-hidden="true">→</span></button>
    </div>
  </main>;
}

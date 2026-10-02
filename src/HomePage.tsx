import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageHeader, Section } from './components.tsx';
import { nav, type Page } from './navigation.ts';

const entries = nav.filter(item => item.id !== 'home');
type Point = { x: number; y: number };
type TourController = { pause: () => void; resume: () => void; stop: () => void };

function ConceptPreview({ page }: { page: Page }) {
  if (page === 'finance') return <div className="home-concept home-finance" aria-hidden="true">
    {['现金', '安全垫', '可配置'].map((label, index) => <div className="home-finance-row" key={label}><span>{label}</span><i><b className={`home-finance-fill fill-${index}`} /></i></div>)}
  </div>;
  if (page === 'consumption') return <div className="home-concept home-consumption" aria-hidden="true"><span>购买</span><i>→</i><span>持有成本</span><i>→</i><span>残值</span><b>TCO</b></div>;
  if (page === 'transport') return <div className="home-concept home-transport" aria-hidden="true"><div><span>地铁</span><i><b /></i></div><div><span>汽车</span><i><b /></i></div><small>时间 ↔ 成本</small></div>;
  if (page === 'comparison') return <div className="home-concept home-comparison" aria-hidden="true">{['A', 'B', 'C'].map((label, index) => <div key={label}><span>{label}</span><i><b className={`compare-${index}`} /></i></div>)}</div>;
  if (page === 'boundary') return <div className="home-concept home-boundary" aria-hidden="true"><svg viewBox="0 0 170 56" preserveAspectRatio="none"><line x1="0" x2="170" y1="27" y2="27" /><path d="M2 48 C30 47 39 44 57 36 S91 10 122 9 S152 9 168 6" /><circle cx="72" cy="27" r="4" /></svg></div>;
  return null;
}

export function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [tourIndex, setTourIndex] = useState<number | null>(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : -1);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [clicked, setClicked] = useState<number | null>(null);
  const [keyboardTakeover, setKeyboardTakeover] = useState(false);
  const [positions, setPositions] = useState<Point[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const controllerRef = useRef<TourController | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const clickLocked = useRef(false);
  const keyboardLocked = useRef(false);
  const lastCursorPoint = useRef<Point | null>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const bounds = grid.getBoundingClientRect();
      setPositions(cardRefs.current.map(card => {
        const rect = card?.getBoundingClientRect();
        return rect ? { x: rect.left - bounds.left + 24, y: rect.top - bounds.top - 4 } : { x: 0, y: 0 };
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    cardRefs.current.forEach(card => { if (card) observer.observe(card); });
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useEffect(() => {
    if (reducedMotion || clickLocked.current) {
      setTourIndex(null);
      return;
    }
    let timeout: number | null = null;
    let dueAt = 0;
    let remaining = 0;
    let pending: (() => void) | null = null;
    let paused = false;
    let stopped = false;
    let nextIndex = 0;
    const schedule = (callback: () => void, delay: number) => {
      pending = callback;
      remaining = delay;
      if (paused || stopped) return;
      dueAt = performance.now() + delay;
      timeout = window.setTimeout(() => {
        timeout = null;
        pending = null;
        callback();
      }, delay);
    };
    const advance = () => {
      if (stopped) return;
      if (nextIndex === entries.length) {
        setTourIndex(null);
        return;
      }
      setTourIndex(nextIndex++);
      schedule(advance, 1700);
    };
    const controller: TourController = {
      pause: () => {
        if (stopped || paused) return;
        paused = true;
        if (timeout !== null) {
          window.clearTimeout(timeout);
          timeout = null;
          remaining = Math.max(0, dueAt - performance.now());
        }
      },
      resume: () => {
        if (stopped || !paused) return;
        paused = false;
        if (pending) schedule(pending, remaining);
      },
      stop: () => {
        stopped = true;
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
        pending = null;
      },
    };
    controllerRef.current = controller;
    setTourIndex(-1);
    schedule(advance, 80);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      keyboardLocked.current = true;
      setKeyboardTakeover(true);
      controller.pause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reducedMotion]);

  useEffect(() => () => {
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
  }, []);

  const enter = (index: number) => {
    setHovered(index);
    controllerRef.current?.pause();
  };
  const leave = () => {
    setHovered(null);
    if (!keyboardLocked.current && !clickLocked.current) controllerRef.current?.resume();
  };
  const open = (index: number, page: Page) => {
    if (clickLocked.current) return;
    clickLocked.current = true;
    controllerRef.current?.stop();
    setClicked(index);
    setTourIndex(null);
    if (reducedMotion) onNavigate(page);
    else navigationTimer.current = window.setTimeout(() => onNavigate(page), 180);
  };
  const interactionIndex = clicked ?? hovered ?? focused;
  const cursorIndex = interactionIndex ?? (keyboardTakeover ? null : tourIndex);
  const requestedPoint = cursorIndex === -1 ? { x: (positions[0]?.x ?? 24) - 12, y: -20 } : cursorIndex === null ? null : positions[cursorIndex];
  if (requestedPoint) lastCursorPoint.current = requestedPoint;
  const cursorPoint = requestedPoint ?? lastCursorPoint.current;
  const showCursor = !reducedMotion && !!requestedPoint && positions.length === entries.length;

  return <>
    <PageHeader number="00" title="选择你要解决的问题" description="从一个具体决定入手，查看成本、现金占用、体验与边界。" />
    <Section title="开始分析" eyebrow="选择一个入口" number={1}>
      <div className="home-tour-grid" ref={gridRef}>
        <div className="home-grid">{entries.map((item, index) => {
          const highlighted = interactionIndex === null ? !keyboardTakeover && tourIndex === index : interactionIndex === index;
          return <button className={`home-card home-tour-card ${highlighted ? 'is-highlighted is-animated' : ''} ${clicked === index ? 'is-clicked' : ''}`} key={item.id}
            ref={element => { cardRefs.current[index] = element; }}
            onMouseEnter={() => enter(index)} onMouseLeave={leave}
            onFocus={() => { setFocused(index); controllerRef.current?.pause(); }}
            onBlur={() => setFocused(null)} onClick={() => open(index, item.id)}>
            <span className="home-number">{item.number}</span><h2>{item.label}</h2><p>{item.description}</p><ConceptPreview page={item.id} /><span className="home-arrow">↗</span>
          </button>;
        })}</div>
        <span className={`home-guide-cursor ${showCursor ? 'is-visible' : ''} ${clicked !== null ? 'is-snapping' : ''}`}
          style={cursorPoint ? { transform: `translate3d(${cursorPoint.x}px, ${cursorPoint.y}px, 0)` } : undefined} aria-hidden="true" />
      </div>
    </Section>
    <p className="demo-note">当前预填示例数据，所有修改会自动保存于此浏览器。结果只提供计算与解释。</p>
  </>;
}

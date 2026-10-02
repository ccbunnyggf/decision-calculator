import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FormulaDetail } from './core/types.ts';

export const yuan = (value: number | null) => value === null || !Number.isFinite(value)
  ? '—' : `${value < 0 ? '-' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
export const num = (value: number | null, digits = 1) => value === null || !Number.isFinite(value)
  ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits });

export function NumberField({ label, value, onChange, unit = '元', step = 'any', min = 0, hint, max }:
  { label: string; value: number; onChange: (n: number) => void; unit?: string; step?: number | 'any'; min?: number; max?: number; hint?: string }) {
  const error = !Number.isFinite(value) ? '请输入有效数字' : value < min ? `不能小于 ${min}` : max !== undefined && value > max ? `不能大于 ${max}` : null;
  return <label className="field">
    <span className="field-label">{label}</span>
    <span className="input-wrap"><input type="number" inputMode="decimal" value={value} step={step} min={min} max={max} aria-invalid={!!error}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} /><span>{unit}</span></span>
    {error && <small className="field-error" role="alert">{error}</small>}
    {hint && <small>{hint}</small>}
  </label>;
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return <label className="field"><span className="field-label">{label}</span><input type="text" value={value} onChange={e => onChange(e.target.value)} /></label>;
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (s: string) => void; options: { value: string; label: string }[] }) {
  return <label className="field"><span className="field-label">{label}</span><select value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

export function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <NumberField label={label} value={Number((value * 100).toFixed(4))} onChange={n => onChange(n / 100)} unit="% / 年" />;
}

export function OptionalPercentField({ label, value, onChange, hint }: { label: string; value?: number; onChange: (n?: number) => void; hint?: string }) {
  return <label className="field"><span className="field-label">{label}</span><span className="input-wrap"><input type="number" inputMode="decimal" min="0" max="100" step="any" value={value === undefined ? '' : value * 100} placeholder="留空" aria-invalid={value !== undefined && (value < 0 || value > 1)} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value) / 100)} /><span>%</span></span>{value !== undefined && (value < 0 || value > 1) && <small className="field-error">请输入 0–100%</small>}{hint && <small>{hint}</small>}</label>;
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <span className="info-tip"><button type="button" aria-label="查看说明" aria-expanded={open} title={text} onClick={() => setOpen(!open)}>ⓘ</button>{open && <span role="note" className="info-popover">{text}</span>}</span>;
}

export function PageHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <header className="page-heading"><p className="eyebrow">{number} / {title}</p><h1>{number} {title}</h1><p>{description}</p></header>;
}

export function Metric({ label, value, detail, onOpen, tone, suffix }: {
  label: string; value: string; detail?: FormulaDetail; onOpen: (label: string, detail: FormulaDetail) => void;
  tone?: 'accent' | 'warn'; suffix?: string;
}) {
  return <button type="button" className={`metric ${tone ?? ''}`} onClick={() => detail && onOpen(label, detail)} disabled={!detail}>
    <span className="metric-label">{label}<span className="info-symbol">ⓘ</span></span>
    <strong>{value}</strong>{suffix && <span className="metric-suffix">{suffix}</span>}
  </button>;
}

export function DetailModal({ title, detail, onClose }: { title: string; detail: FormulaDetail; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={`${title}的计算方法`} onClick={e => e.stopPropagation()}>
      <button className="close" onClick={onClose} aria-label="关闭">×</button>
      <p className="eyebrow">计算说明</p><h2>{title}</h2>
      <div className="formula">{detail.formula}</div>
      <dl>{Object.entries(detail.inputs).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'number' ? num(value, 3) : value}</dd></div>)}</dl>
      {detail.note && <p className="note">{detail.note}</p>}
    </section>
  </div>;
}

export function Section({ title, eyebrow, children, action, number }: { title: string; eyebrow?: string; children: ReactNode; action?: ReactNode; number?: number }) {
  return <section className="section"><div className="section-head"><div className="section-title">{number !== undefined && <span className="section-number">{number}</span>}<div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div></div>{action}</div>{children}</section>;
}

export function LineChart({ title, points, xLabel, yLabel, reference, formatY = yuan, formatX = v => num(v), currentX, boundaryPoint, xUnit = '', yUnit = '' }: {
  title: string; points: { x: number; y: number | null }[]; xLabel: string; yLabel: string;
  reference?: number; formatY?: (value: number | null) => string; formatX?: (value: number) => string;
  currentX?: number; boundaryPoint?: { x: number; y: number }; xUnit?: string; yUnit?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollRef.current;
    const marker = scroller?.querySelector<SVGCircleElement>('.chart-point.current');
    if (scroller && marker) scroller.scrollLeft = Number(marker.getAttribute('cx')) - scroller.clientWidth / 2;
  }, [currentX, points.length]);
  const valid = [...points].filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  if (valid.length === 0) return <div className="chart-card"><h3>{title}</h3><p className="muted">当前输入无法绘制曲线。</p></div>;
  const xs = valid.map(p => p.x);
  const ys = valid.map(p => p.y);
  if (reference !== undefined) ys.push(reference);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys);
  const rangeX = Math.max(1, maxX - minX), rangeY = Math.max(1, maxY - minY);
  const left = 82, right = 48, top = 64, bottom = 70, height = 320;
  const nominalSpan = Math.max(550, (valid.length - 1) * 92);
  const positions = valid.reduce<number[]>((all, p, i) => {
    all.push(i === 0 ? left : all[i - 1] + Math.max(92, (p.x - valid[i - 1].x) / rangeX * nominalSpan));
    return all;
  }, []);
  const width = Math.max(680, positions[positions.length - 1] + right);
  const px = (x: number) => {
    const exact = valid.findIndex(p => Math.abs(p.x - x) < 1e-6);
    if (exact >= 0) return positions[exact];
    const next = valid.findIndex(p => p.x > x);
    if (next <= 0) return x < minX ? positions[0] : positions[positions.length - 1];
    const prev = next - 1;
    return positions[prev] + (x - valid[prev].x) / (valid[next].x - valid[prev].x) * (positions[next] - positions[prev]);
  };
  const py = (y: number) => top + (maxY - y) / rangeY * (height - top - bottom);
  const path = valid.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const current = currentX === undefined ? null : valid.find(p => Math.abs(p.x - currentX) < 1e-6) ?? null;
  return <div className="chart-card">
    <h3>{title}</h3>
    <div className="chart-scroll" ref={scrollRef}><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label={`${title}；横轴${xLabel}，纵轴${yLabel}；每个数据点均标出数值`}>
      {[0, .25, .5, .75, 1].map(t => { const y = minY + (maxY - minY) * t; return <g key={t}><line x1={left} x2={width - right} y1={py(y)} y2={py(y)} className="gridline"/><text x={left - 10} y={py(y) + 4} textAnchor="end" className="axis-text">{formatY(y)}</text></g>; })}
      {reference !== undefined && <g><line x1={left} x2={width - right} y1={py(reference)} y2={py(reference)} className="reference-line" /><text x={width - right} y={py(reference) - 7} textAnchor="end" className="reference-label">边界 {formatY(reference)}</text></g>}
      {current && <g><line x1={px(current.x)} x2={px(current.x)} y1={top} y2={height - bottom} className="current-guide"/><line x1={left} x2={px(current.x)} y1={py(current.y)} y2={py(current.y)} className="current-guide"/></g>}
      <path d={path} className="chart-line" />
      {valid.map((p, i) => { const isCurrent = current !== null && p === current; const isBoundary = boundaryPoint !== undefined && Math.abs(p.x - boundaryPoint.x) < 1e-6; return <g key={`${p.x}-${i}`}><circle cx={px(p.x)} cy={py(p.y)} r={isCurrent ? 7 : isBoundary ? 6 : 4} className={isCurrent ? 'chart-point current' : isBoundary ? 'chart-point boundary' : 'chart-point'}><title>{xLabel}: {formatX(p.x)}{xUnit}；{yLabel}: {formatY(p.y)}{yUnit}</title></circle><text x={px(p.x)} y={py(p.y) + (i % 2 === 0 ? -12 : 19)} textAnchor="middle" className={isCurrent ? 'point-label current-label' : 'point-label'}>{formatY(p.y)}</text><text x={px(p.x)} y={height - bottom + 22} textAnchor="middle" className="axis-text">{formatX(p.x)}</text>{isCurrent && <text x={px(p.x)} y={top - 30} textAnchor="middle" className="current-tag">当前</text>}{isBoundary && <text x={px(p.x)} y={top - 13} textAnchor="middle" className="boundary-tag">边界点</text>}</g>; })}
      <text x={width / 2} y={height - 8} textAnchor="middle" className="axis-title">{xLabel}{xUnit ? `（${xUnit}）` : ''}</text>
    </svg></div>
    {boundaryPoint && <p className="chart-boundary-text">边界点：{xLabel} {formatX(boundaryPoint.x)}{xUnit}，{yLabel} {formatY(boundaryPoint.y)}{yUnit}</p>}
    <div className="chart-footer"><span>{yLabel}{yUnit ? `（${yUnit}）` : ''}</span><span>横向滚动查看全部点；点间保留标签间距，横向距离不严格按比例</span></div>
    <details className="chart-data"><summary>查看全部数据点（{points.length}）</summary><div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>{xLabel}{xUnit ? `（${xUnit}）` : ''}</th><th>{yLabel}{yUnit ? `（${yUnit}）` : ''}</th></tr></thead><tbody>{points.map((p, i) => <tr key={i} className={currentX !== undefined && Math.abs(p.x - currentX) < 1e-6 ? 'current-data-row' : ''}><th>{formatX(p.x)}</th><td>{formatY(p.y)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

export function BarChart({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map(i => Math.max(0, i.value)));
  return <div className="chart-card"><h3>{title}</h3><div className="bar-list">{items.map(i => <div className="bar-row" key={i.label}>
    <div><span>{i.label}</span><strong>{yuan(i.value)}</strong></div>
    <div className="bar-track"><span style={{ width: `${Math.max(0, i.value) / max * 100}%` }} /></div>
  </div>)}</div></div>;
}

export function TcoComposition({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((sum, x) => sum + Math.max(0, x.value), 0);
  const colors = ['#294a3b', '#739883', '#b7aa7b', '#d1c7b1', '#8d8d86'];
  return <div className="chart-card"><h3>TCO 构成</h3>
    <div className="stacked-bar">{items.map((i, n) => i.value > 0 ? <span key={i.label} title={`${i.label} ${yuan(i.value)}`} style={{ width: `${i.value / total * 100}%`, backgroundColor: colors[n % colors.length] }} /> : null)}</div>
    <div className="legend">{items.map((i, n) => <div key={i.label}><span style={{ backgroundColor: colors[n % colors.length] }} />{i.label}<strong>{yuan(i.value)}</strong></div>)}</div>
    {items.some(i => i.value < 0) && <p className="note">负数为回款扣减，不占上方成本条宽度。</p>}
  </div>;
}

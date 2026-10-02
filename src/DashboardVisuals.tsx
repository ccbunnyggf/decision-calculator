import { yuan } from './components.tsx';

export function CashLayers({ cash, planned, reserve, allocatable }: { cash: number; planned: number; reserve: number; allocatable: number }) {
  const scale = Math.max(1, cash, planned + reserve);
  const plannedShown = Math.max(0, Math.min(cash, planned));
  const reserveShown = Math.max(0, Math.min(Math.max(0, cash - plannedShown), reserve));
  const freeShown = Math.max(0, cash - plannedShown - reserveShown);
  return <div className="cash-layers">
    <div className="cash-flow-row"><span>当前可支配现金</span><strong>{yuan(cash)}</strong></div>
    <div className="cash-flow-row"><span>− 近期已知刚性支出</span><strong>{yuan(planned)}</strong></div>
    <div className="cash-flow-row"><span>− 设定的最低安全垫</span><strong>{yuan(reserve)}</strong></div>
    <div className={`cash-flow-row cash-result ${allocatable < 0 ? 'negative' : ''}`}><span>= 可自由配置资本</span><strong>{yuan(allocatable)}</strong></div>
    <div className="cash-layer-bar" aria-label={`现金分层：计划支出 ${yuan(planned)}，安全垫 ${yuan(reserve)}，可自由配置 ${yuan(allocatable)}`}>
      <span className="planned" style={{ width: `${plannedShown / scale * 100}%` }} title={`计划支出 ${yuan(planned)}`} />
      <span className="reserved" style={{ width: `${reserveShown / scale * 100}%` }} title={`安全垫 ${yuan(reserve)}`} />
      <span className="free" style={{ width: `${freeShown / scale * 100}%` }} title={`可自由配置 ${yuan(allocatable)}`} />
    </div>
    <div className="cash-layer-legend"><span>● 计划支出</span><span>● 安全垫</span><span>● 可自由配置</span></div>
    {allocatable < 0 && <p className="field-error">计划支出与安全垫合计超过当前现金 {yuan(-allocatable)}。</p>}
  </div>;
}

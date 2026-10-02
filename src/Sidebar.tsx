import { useEffect, useRef } from 'react';
import { nav, type Page } from './navigation.ts';

export function Sidebar({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  const current = nav.find(item => item.id === page) ?? nav[0];
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia('(max-width: 760px)').matches) return;
    const container = navRef.current;
    const active = container?.querySelector<HTMLElement>('.side-link.active');
    if (container && active) container.scrollTo({ left: active.offsetLeft - container.offsetLeft - (container.clientWidth - active.clientWidth) / 2 });
  }, [page]);
  return <aside className="sidebar" aria-label="页面导航">
    <button className="sidebar-brand" onClick={() => onNavigate('home')}><span className="brand-mark">界</span><span>个人消费<br/>决策计算器</span></button>
    <nav ref={navRef} className="sidebar-nav" aria-label="主要导航">{nav.map(item => <button key={item.id} className={`side-link ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>
      <span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-copy"><strong>{item.id === 'home' ? item.label : `${item.number} ${item.label}`}</strong><small>{item.subtitle}</small></span>
    </button>)}</nav>
    <div className="sidebar-help"><span>这是什么？</span><p>{current.description.replace(/[。.]$/, '')}。这里提供计算与解释，判断由你自己作出。</p></div>
  </aside>;
}

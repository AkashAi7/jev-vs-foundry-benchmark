import { ArrowUpRight, ChartNoAxesCombined, CircleHelp, Cpu, FlaskConical, LayoutDashboard, ListFilter, Plug, Radio } from 'lucide-react';
import type { PublicConfig } from '../../shared/types';

export type Page = 'overview' | 'cases' | 'converter' | 'methodology' | 'connections';
const items = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'cases', label: 'Cases & results', icon: ListFilter },
  { id: 'converter', label: 'Jev converter', icon: Cpu },
  { id: 'methodology', label: 'Methodology', icon: FlaskConical },
  { id: 'connections', label: 'Connections', icon: Plug },
] as const;

export function Sidebar({ page, navigate, config }: {
  page: Page; navigate: (page: Page) => void; config?: PublicConfig;
}) {
  return <aside className="sidebar">
    <a className="brand" href="#main" aria-label="Jev Benchmark Lab, skip to workspace">
      <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
      <span className="brand-name">jev<span className="brand-period">.</span></span>
      <span className="brand-caption">BENCHMARK LAB</span>
    </a>
    <div className="workspace-label"><span className="workspace-dot" /> LOCAL WORKSPACE</div>
    <nav aria-label="Main navigation">
      {items.map(({ id, label, icon: Icon }, index) => <button
        key={id} className={`nav-item ${page === id ? 'active' : ''}`}
        onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}
      ><Icon size={18} aria-hidden="true" /><span>{label}</span><small>0{index + 1}</small></button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="sidebar-note">
        <ChartNoAxesCombined size={22} aria-hidden="true" />
        <p>Different approaches.<br /><strong>The same decision.</strong></p>
        <span>Compare quality, latency and the trade-offs that matter.</span>
        <button onClick={() => navigate('methodology')}>Explore the protocol <ArrowUpRight size={15} aria-hidden="true" /></button>
      </div>
      <button className="connection-shortcut" onClick={() => navigate('connections')}>
        <Radio size={16} aria-hidden="true" /><span>Provider connections</span>
        <span className="connection-count">{Number(config?.foundryConfigured ?? false) + Number(config?.jevConfigured ?? false)}/2</span>
      </button>
      <div className="sidebar-footer"><CircleHelp size={13} aria-hidden="true" /><span>A small pilot. Not a model ranking.</span></div>
    </div>
  </aside>;
}

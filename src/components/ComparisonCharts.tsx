import type { CSSProperties } from 'react';
import { MoveUpRight } from 'lucide-react';
import { ARM_LABELS, type MetricSummary } from '../../shared/types';
import { armColors, latency, percent } from '../lib/format';

export function ComparisonCharts({ summaries, demo }: { summaries: MetricSummary[]; demo: boolean }) {
  const points = summaries.filter(item => item.successes > 0 && item.p50Ms !== null && item.accuracy !== null);
  const maximum = Math.max(100, ...points.map(item => item.p50Ms ?? 0)) * 1.15;
  return <section className="panel comparison-panel" aria-labelledby="comparison-title">
    <div className="panel-heading"><div><span className="eyebrow">THE TRADE-OFF</span><h2 id="comparison-title">Quality meets latency</h2></div>
      <span className="chart-tag">{demo ? 'Illustrative' : 'Observed'}</span>
    </div>
    <div className="quality-chart">
      <div className="chart-caption"><h3>Error-inclusive accuracy</h3><span>Higher is better <MoveUpRight size={13} aria-hidden="true" /></span></div>
      {summaries.map(item => <div className="quality-row" key={item.arm}>
        <div><span className={`arm-dot ${item.arm}`} /><span>{ARM_LABELS[item.arm]}</span><strong>{!item.total ? 'Unmeasured' : !item.successes ? 'Inference unavailable' : percent(item.accuracy)}</strong></div>
        {item.successes > 0 && item.accuracy !== null && <div className="bar-track" aria-hidden="true"><div className={`bar-fill ${item.arm}`}
          style={{ '--bar-width': `${item.accuracy * 100}%` } as CSSProperties} /></div>}
      </div>)}
      <div className="bar-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
    <div className="latency-chart">
      <div className="chart-caption"><h3>Latency versus accuracy</h3><span>Top-left is preferable</span></div>
      <svg viewBox="0 0 460 205" role="img" aria-labelledby="scatter-title scatter-description" className="scatter">
        <title id="scatter-title">Median response latency versus decision accuracy</title>
        <desc id="scatter-description">{points.length
          ? points.map(item => `${ARM_LABELS[item.arm]}: ${latency(item.p50Ms)}, ${percent(item.accuracy)} accuracy.`).join(' ')
          : 'No successful observations yet. The metrics table provides equivalent values.'}</desc>
        {[0, 0.5, 1].map(value => <g key={value}>
          <line x1="52" y1={155 - value * 125} x2="424" y2={155 - value * 125} className="grid-line" />
          <text x="43" y={159 - value * 125} textAnchor="end">{value * 100}%</text>
        </g>)}
        {[0, 0.5, 1].map(value => <g key={value}>
          <line x1={52 + value * 372} y1="30" x2={52 + value * 372} y2="155" className="grid-line vertical" />
          <text x={52 + value * 372} y="177" textAnchor="middle">{Math.round(maximum * value).toLocaleString()}</text>
        </g>)}
        <text x="52" y="15" className="axis-title">ACCURACY</text>
        <text x="240" y="200" textAnchor="middle" className="axis-title">P50 LATENCY (MS) · LOWER IS BETTER</text>
        {points.map((item, index) => {
          const x = 52 + ((item.p50Ms ?? 0) / maximum) * 372;
          const y = 155 - (item.accuracy ?? 0) * 125;
          return <g key={item.arm}>
            <circle cx={x} cy={y} r={11 + index * 3} fill="none" stroke={armColors[item.arm]} strokeOpacity="0.25" />
            <circle cx={x} cy={y} r="6" fill={armColors[item.arm]} stroke="white" strokeWidth="2" />
            <title>{ARM_LABELS[item.arm]}: {latency(item.p50Ms)}, {percent(item.accuracy)}</title>
          </g>;
        })}
      </svg>
      <div className="chart-legend">{summaries.map(item => <span key={item.arm}><span className={`arm-dot ${item.arm}`} />{ARM_LABELS[item.arm]}</span>)}</div>
    </div>
    <p className="chart-footnote">The table below contains every chart value. Errors count against accuracy; latency excludes errors. All-error arms have no quality bar or latency point because inference is unavailable, not measured as incorrect.</p>
  </section>;
}

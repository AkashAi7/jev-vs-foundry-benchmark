import type { Arm, MetricSummary } from '../../shared/types';

export const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
export const latency = (value: number | null) => value === null ? '—' : `${Math.round(value).toLocaleString()} ms`;
export const count = (value: number) => value.toLocaleString();
export const armShort: Record<Arm, string> = { foundry: 'Foundry', jev: 'Jev', hybrid: 'Hybrid' };
export const armColors: Record<Arm, string> = { foundry: '#346fc4', jev: '#147c69', hybrid: '#b96526' };
export const dateTime = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});
export function tokens(summary: MetricSummary): string {
  if (!summary.total) return 'Not measured';
  const observed = summary.inputTokens + summary.outputTokens;
  if (summary.usageKnown) return count(observed);
  return observed > 0 ? `${count(observed)} (partial)` : 'Not reported';
}

import type { Observation } from './types';

export interface ConfidenceBin {
  lower: number;
  upper: number;
  count: number;
  correct: number;
  meanConfidence: number | null;
  accuracy: number | null;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator ? numerator / denominator : null;

export function analyzeJev(rows: Observation[], threshold: number, arm: 'jev' | 'hybrid' = 'jev') {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('Confidence threshold must be between zero and one.');
  }
  const selected = rows.filter(row => row.arm === arm);
  const samples = selected.flatMap(row => {
    const stage = row.stages.find(value => value.provider === 'jev');
    return stage && stage.confidence !== null
      ? [{ row, confidence: stage.confidence, correct: stage.choice === row.expected }]
      : [];
  });
  const accepted = samples.filter(sample => sample.confidence >= threshold);
  const acceptedCorrect = accepted.filter(sample => sample.correct).length;
  const bins: ConfidenceBin[] = Array.from({ length: 5 }, (_, index) => {
    const lower = index / 5;
    const upper = (index + 1) / 5;
    const bucket = samples.filter(sample => sample.confidence >= lower
      && (sample.confidence < upper || (index === 4 && sample.confidence === 1)));
    const correct = bucket.filter(sample => sample.correct).length;
    return {
      lower, upper, count: bucket.length, correct,
      meanConfidence: ratio(bucket.reduce((sum, sample) => sum + sample.confidence, 0), bucket.length),
      accuracy: ratio(correct, bucket.length),
    };
  });
  const escalations = selected.filter(row => row.escalated);
  const comparisons = samples.flatMap(sample => {
    const foundry = sample.row.stages.find(stage => stage.provider === 'foundry');
    return sample.row.escalated && sample.row.status === 'success' && foundry
      ? [{ before: sample.correct, after: foundry.choice === sample.row.expected }]
      : [];
  });
  return {
    arm, total: selected.length, samples: samples.length, unavailable: selected.length - samples.length,
    bins, accepted: accepted.length, acceptedCorrect,
    acceptedAccuracy: ratio(acceptedCorrect, accepted.length),
    escalated: samples.length - accepted.length,
    highConfidenceErrors: accepted.length - acceptedCorrect,
    thresholdSweep: [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 1].map(gate => {
      const subset = samples.filter(sample => sample.confidence >= gate);
      return {
        threshold: gate, accepted: subset.length,
        coverage: ratio(subset.length, selected.length),
        accuracy: ratio(subset.filter(sample => sample.correct).length, subset.length),
      };
    }),
    hybrid: arm === 'hybrid' ? {
      escalations: escalations.length,
      completedEscalations: comparisons.length,
      rescued: comparisons.filter(value => !value.before && value.after).length,
      regressed: comparisons.filter(value => value.before && !value.after).length,
      unchanged: comparisons.filter(value => value.before === value.after).length,
      failedEscalations: escalations.length - comparisons.length,
    } : null,
  };
}

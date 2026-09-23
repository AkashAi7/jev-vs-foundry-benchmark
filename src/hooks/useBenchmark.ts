import { useCallback, useEffect, useRef, useState } from 'react';
import type { BenchmarkRun, Bootstrap, ConfigUpdate, PublicConfig, RunOptions } from '../../shared/types';
import { errorMessage, request } from '../lib/api';

export function useBenchmark() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pollRetry, setPollRetry] = useState(0);
  const alive = useRef(true);
  const mutationVersion = useRef(0);
  const selected = data?.runs.find(run => run.id === selectedId) ?? null;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request<Bootstrap>('/api/bootstrap', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setData(result);
        setSelectedId(previous => result.runs.some(run => run.id === previous) ? previous
          : [...result.runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find(run => run.options.mode === 'live')?.id ?? null);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  const updateRun = useCallback((next: BenchmarkRun) => {
    setData(previous => {
      if (!previous) return previous;
      const current = previous.runs.find(run => run.id === next.id);
      if (current && (
        current.observations.length > next.observations.length
        || (current.status !== 'running' && next.status === 'running')
      )) return previous;
      const runs = current
        ? previous.runs.map(run => run.id === next.id ? next : run)
        : [next, ...previous.runs];
      return { ...previous, runs };
    });
  }, []);

  useEffect(() => {
    setPollError(null);
    if (!selectedId || selected?.status !== 'running') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = mutationVersion.current;
      try {
        const run = await request<BenchmarkRun>(`/api/runs/${encodeURIComponent(selectedId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (version === mutationVersion.current) updateRun(run);
        setPollError(null);
        if (run.status === 'running') timer = setTimeout(() => { void poll(); }, 1000);
      } catch (reason) {
        if (!controller.signal.aborted) setPollError(errorMessage(reason));
      }
    };
    timer = setTimeout(() => { void poll(); }, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedId, selected?.status, pollRetry, updateRun]);

  async function start(options: RunOptions) {
    if (!data || busy) return;
    setBusy(true);
    setError(null);
    mutationVersion.current += 1;
    try {
      const run = await request<BenchmarkRun>('/api/runs', { body: options, token: data.config.csrfToken });
      if (!alive.current) return;
      updateRun(run);
      setSelectedId(run.id);
      setPollRetry(value => value + 1);
    } catch (reason) {
      if (alive.current) setError(errorMessage(reason));
    } finally { if (alive.current) setBusy(false); }
  }

  async function cancel() {
    if (!data || !selected || busy) return;
    setBusy(true);
    setError(null);
    mutationVersion.current += 1;
    try {
      const run = await request<BenchmarkRun>(`/api/runs/${encodeURIComponent(selected.id)}/cancel`, {
        body: {}, token: data.config.csrfToken,
      });
      if (alive.current) { updateRun(run); setPollRetry(value => value + 1); }
    } catch (reason) {
      if (alive.current) setError(errorMessage(reason));
    } finally { if (alive.current) setBusy(false); }
  }

  async function configure(update: ConfigUpdate) {
    if (!data) throw new Error('Load the workspace before saving connections.');
    const config = await request<PublicConfig>('/api/config', { body: update, token: data.config.csrfToken });
    if (alive.current) setData(previous => previous ? { ...previous, config } : previous);
  }

  return {
    data, selected, selectedId, setSelectedId, loading, error, pollError, busy, start, cancel, configure,
    reload: () => setRetry(value => value + 1),
    retryPoll: () => setPollRetry(value => value + 1),
    dismissError: () => setError(null),
  };
}

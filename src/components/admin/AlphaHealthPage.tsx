import { useEffect, useState } from 'react';
import { loadAlphaHealth, type AlphaHealth } from '../../services/alphaOps';

export function AlphaHealthPage() {
  const [data, setData] = useState<AlphaHealth | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadAlphaHealth().then((value) => { if (active) setData(value); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'ADMIN_REQUIRED'); });
    return () => { active = false; };
  }, []);
  if (error) return <main className="min-h-dvh bg-ink p-6 text-cream"><h1 className="font-display text-2xl">Alpha Health</h1><p role="alert" className="mt-4 text-red-200">Access denied: {error}</p><a href="/" className="mt-4 inline-block underline">Return to town</a></main>;
  if (!data) return <main className="grid min-h-dvh place-items-center bg-ink text-cream">Loading Alpha health...</main>;
  return <main className="min-h-dvh bg-cream p-4 text-ink sm:p-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold uppercase text-clay">Internal · read only</p><h1 className="font-display text-3xl font-bold">Private Alpha Health</h1></div><a href="/admin/economy" className="rounded-lg bg-white px-3 py-2">Economy</a></header>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Database" value={data.databaseReachable ? 'Reachable' : 'Down'} />
        <Metric label="Economy version" value={data.economyVersion} />
        <Metric label="Active today" value={data.activePlayersToday} />
        <Metric label="Critical anomalies" value={data.unresolvedCriticalAnomalies} />
        <Metric label="Invited" value={data.invited} />
        <Metric label="Registered" value={data.registered} />
        <Metric label="Latest telemetry" value={data.latestTelemetryAt ?? 'None'} />
        <Metric label="Latest client error" value={data.latestClientErrorAt ?? 'None'} />
      </section>
      <section className="mt-6 rounded-xl bg-white p-4"><h2 className="font-display text-xl font-bold">Cohort Funnel</h2><pre className="mt-3 overflow-auto rounded-lg bg-ink p-3 text-xs text-cream">{JSON.stringify(data.cohort, null, 2)}</pre></section>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-widest text-ink/45">{label}</p><b className="mt-1 block break-words text-lg">{value}</b></div>;
}

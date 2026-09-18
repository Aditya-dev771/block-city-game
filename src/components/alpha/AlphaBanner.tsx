import { Flag, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';
import { submitAlphaFeedback, type FeedbackCategory } from '../../services/alphaOps';
import { useGameStore } from '../../stores/gameStore';

const categories: Array<{ id: FeedbackCategory; label: string }> = [
  { id: 'bug', label: 'Bug' },
  { id: 'confusing', label: 'Confusing' },
  { id: 'balance', label: 'Balance' },
  { id: 'performance', label: 'Performance' },
  { id: 'other', label: 'Other' }
];

export function AlphaBanner() {
  const [open, setOpen] = useState(false);
  return <>
    <div className="absolute left-2 top-[4.5rem] z-30 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-xl border border-gold/40 bg-ink/85 px-3 py-2 text-xs text-cream shadow-lg backdrop-blur">
      <Flag className="h-4 w-4 shrink-0 text-gold" />
      <div className="min-w-0">
        <p className="font-bold tracking-wide">PRIVATE ALPHA</p>
        <p className="truncate text-cream/65">Progress and economy values may change during testing.</p>
      </div>
      <button onClick={() => setOpen(true)} className="ml-1 rounded-lg bg-gold px-2 py-1 font-bold text-ink">Report Issue</button>
    </div>
    {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
  </>;
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const player = useGameStore((state) => state.player);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit() {
    setBusy(true); setMessage('');
    try {
      await submitAlphaFeedback({
        category,
        description,
        screen: player ? `${player.resident.currentLocation}:${useGameStore.getState().panel}` : window.location.pathname,
        metadata: player ? { playerId: player.playerId, location: player.resident.currentLocation, panel: useGameStore.getState().panel } : {}
      });
      setMessage('Thanks. Your report was recorded for the Alpha team.');
      setDescription('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Feedback could not be sent.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="absolute inset-0 z-[70] grid place-items-center bg-black/45 p-4">
    <section className="w-[min(92vw,460px)] rounded-2xl bg-cream p-5 text-ink shadow-2xl">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-moss p-2 text-cream"><MessageSquareWarning /></span><div><h2 className="font-display text-2xl font-bold">Report Alpha Issue</h2><p className="text-sm text-ink/60">Please include what happened and what you expected.</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`rounded-lg px-2 py-2 text-sm font-bold ${category === item.id ? 'bg-ink text-white' : 'bg-white'}`}>{item.label}</button>)}</div>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={5} maxLength={1200} className="mt-4 min-h-32 w-full rounded-xl border border-ink/15 bg-white p-3 text-sm outline-none focus:border-moss" placeholder="Short description" />
      {message ? <p role="status" className="mt-3 rounded-lg bg-ink/5 p-3 text-sm">{message}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-ink/15 px-4 py-2 font-bold">Close</button><button disabled={busy || description.trim().length < 5} onClick={() => void submit()} className="rounded-xl bg-moss px-4 py-2 font-bold text-white disabled:opacity-40">{busy ? 'Sending...' : 'Send report'}</button></div>
    </section>
  </div>;
}

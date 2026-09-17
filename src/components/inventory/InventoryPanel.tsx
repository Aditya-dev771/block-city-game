import { PackageOpen, X } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';

const symbols: Record<string, string> = { wood: '🪵', stone: '🪨', iron: '⛓️', food: '🥕', planks: '🟫', meals: '🥘', tools: '🛠️', constructionCrates: '📦' };
export function InventoryPanel() {
  const player = useGameStore((s) => s.player); const setPanel = useGameStore((s) => s.setPanel); const consumeMeal = useGameStore((s) => s.useMeal); const pending = useGameStore((s) => s.actionPending);
  if (!player) return null;
  const used = player.property.effectiveStorageUsed; const percent = Math.min(100,Math.round((used/player.property.storageCapacity)*100));
  return <section className="panel"><PanelHeader title="Inventory" onClose={() => setPanel('world')} />
    <div className={`mb-4 rounded-xl p-3 text-sm ${percent>=80?'bg-amber-100':'bg-ink/5'}`}><div className="flex items-center justify-between"><span className="flex items-center gap-2"><PackageOpen className="h-4 w-4"/>Effective home storage</span><b>{used} / {player.property.storageCapacity}</b></div>{player.property.reservedProductionStorage>0?<p className="mt-1 text-xs text-ink/55">Includes {player.property.reservedProductionStorage} reserved for production output.</p>:null}<div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${percent>=80?'bg-clay':'bg-moss'}`} style={{width:`${percent}%`}}/></div>{percent>=100?<p className="mt-2 font-semibold text-red-900">Storage is full. Sell or consume items, or upgrade your property.</p>:percent>=80?<p className="mt-2 text-amber-900">Storage is nearly full.</p>:null}</div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(player.inventory).map(([key, value]) => <div key={key} className="rounded-xl border border-ink/10 bg-white p-3"><div className="text-2xl">{symbols[key]}</div><div className="mt-2 capitalize text-ink/60">{key.replace(/([A-Z])/g, ' $1')}</div><b className="text-xl">{value}</b>{key === 'meals' ? <button disabled={pending || value < 1 || player.resident.energy >= player.resident.maxEnergy} onClick={() => void consumeMeal()} className="mt-2 block w-full rounded-lg bg-moss px-2 py-1.5 text-xs font-bold text-white disabled:opacity-40">Use meal</button> : null}</div>)}</div>
  </section>;
}

export function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) { return <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl font-bold text-ink">{title}</h2><button className="rounded-full p-2 hover:bg-ink/10" onClick={onClose} aria-label="Close"><X className="h-5 w-5"/></button></div>; }

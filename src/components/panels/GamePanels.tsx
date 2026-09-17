import { AlertTriangle, CheckCircle2, Hammer, Pickaxe, Sprout, Trees, X } from 'lucide-react';
import { ECONOMY } from '../../config/economy';
import { useGameStore } from '../../stores/gameStore';
import type { JobType, RecipeId, SkillKey } from '../../types/game';
import { InventoryPanel, PanelHeader } from '../inventory/InventoryPanel';
import { MarketPanel } from '../market/MarketPanel';
import { PropertyPanel } from '../property/PropertyPanel';
import { BusinessesPanel } from '../business/BusinessesPanel';
import { TodayPanel } from '../season/TodayPanel';

const JOB_PRESENTATION: Record<JobType, { title: string; subtitle: string; icon: typeof Trees }> = {
  lumberjack: { title: 'Whisperwood Shift', subtitle: 'Chop timber in the old forest.', icon: Trees },
  miner: { title: 'Old Mine Shift', subtitle: 'Extract stone and iron ore.', icon: Pickaxe },
  farmer: { title: 'Sunfield Shift', subtitle: 'Harvest food for the town.', icon: Sprout }
};
const LOCATION_JOB: Partial<Record<string, JobType>> = { forest: 'lumberjack', mine: 'miner', farm: 'farmer' };
const RECIPE_PRESENTATION: Record<RecipeId, { title: string; description: string; icon: string }> = {
  planks: { title: 'Planks', description: '5 Wood + 5 Coins → 2 Planks', icon: '🟫' },
  meal: { title: 'Meal', description: '3 Food + 5 Coins → 1 Meal', icon: '🥘' },
  tool: { title: 'Tool', description: '3 Iron + 2 Wood + 15 Coins → 1 Tool', icon: '🛠️' }
};
const PROFESSION_SKILLS: SkillKey[] = ['lumberjack', 'miner', 'farmer', 'builder', 'merchant', 'chef', 'engineer'];

function JobAction({ jobType }: { jobType: JobType }) {
  const player = useGameStore((state) => state.player); const pending = useGameStore((state) => state.actionPending); const executeJob = useGameStore((state) => state.executeJob);
  if (!player) return null;
  const job = ECONOMY.jobs[jobType]; const presentation = JOB_PRESENTATION[jobType]; const Icon = presentation.icon;
  const rewards = Object.entries(job.rewards).map(([key, value]) => `${value} ${key === 'professionXp' ? `${jobType} XP` : key}`).join(' · ');
  return <aside className="absolute bottom-20 left-1/2 z-20 w-[min(92%,400px)] -translate-x-1/2 rounded-2xl border border-white/30 bg-cream/95 p-4 shadow-2xl backdrop-blur">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-moss p-2.5 text-cream"><Icon/></span><div className="min-w-0 flex-1"><p className="font-display text-lg font-bold">{presentation.title}</p><p className="text-xs text-ink/50">{presentation.subtitle}</p><p className="mt-1 text-sm text-ink/70">{job.energy} energy · {rewards}</p></div></div>
    <button disabled={pending || player.resident.energy < job.energy} onClick={() => void executeJob(jobType)} className="mt-3 w-full rounded-xl bg-moss px-4 py-3 font-bold text-white shadow disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Working…' : `Work as ${jobType}`}</button>
  </aside>;
}

function CraftingPanel() {
  const setPanel = useGameStore((state) => state.setPanel); const craftItem = useGameStore((state) => state.craftItem); const pending = useGameStore((state) => state.actionPending);
  return <section className="panel"><PanelHeader title="Workshop" onClose={() => setPanel('world')} /><p className="mb-4 text-sm text-ink/60">Recipes are verified and completed by the town server.</p><div className="grid gap-3 sm:grid-cols-3">{(Object.keys(RECIPE_PRESENTATION) as RecipeId[]).map((id) => { const recipe = RECIPE_PRESENTATION[id]; return <article key={id} className="rounded-2xl border border-ink/10 bg-white p-4"><div className="text-3xl" aria-hidden="true">{recipe.icon}</div><h3 className="mt-3 font-display text-lg font-bold">{recipe.title}</h3><p className="mt-1 min-h-10 text-sm text-ink/60">{recipe.description}</p><button disabled={pending} onClick={() => void craftItem(id)} className="mt-4 w-full rounded-xl bg-clay px-3 py-2.5 font-bold text-white disabled:opacity-40">{pending ? 'Crafting…' : 'Craft'}</button></article>; })}</div></section>;
}

function TownHallPanel() {
  const player = useGameStore((state) => state.player); const setPanel = useGameStore((state) => state.setPanel); const completeOrder = useGameStore((state) => state.completeOrder); const pending = useGameStore((state) => state.actionPending);
  if (!player) return null; const order = ECONOMY.orders.repair_old_bridge; const completed = player.orders.repairOldBridge;
  return <section className="panel"><PanelHeader title="Town Hall" onClose={() => setPanel('world')} /><article className="overflow-hidden rounded-2xl border border-ink/10 bg-white"><div className="bg-clay p-5 text-white"><p className="text-xs font-bold uppercase tracking-[.2em] opacity-70">NPC Order</p><h3 className="mt-1 font-display text-2xl font-bold">{order.name}</h3><p className="mt-2 text-sm text-white/80">The east bridge needs fresh timber and a stronger stone foundation.</p></div><div className="p-5"><div className="grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-ink/5 p-3"><p className="text-ink/50">Required</p><b>{order.requirements.wood} Wood · {order.requirements.stone} Stone</b></div><div className="rounded-xl bg-gold/15 p-3"><p className="text-ink/50">Reward</p><b>{order.rewards.coins} Coins · {order.rewards.xp} XP · {order.rewards.founderPoints} FP</b></div></div><button disabled={pending || completed} onClick={() => void completeOrder()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-moss px-4 py-3 font-bold text-white disabled:opacity-50">{completed ? <><CheckCircle2 className="h-5 w-5"/>Order completed</> : pending ? 'Submitting…' : 'Deliver materials'}</button></div></article></section>;
}

function professionRank(xp: number) { return ECONOMY.professionThresholds.find((threshold) => xp >= threshold.min)?.title ?? 'Novice'; }
function ProfilePanel() {
  const player = useGameStore((state) => state.player); const setPanel = useGameStore((state) => state.setPanel); if (!player) return null;
  return <section className="panel"><PanelHeader title="Resident Profile" onClose={() => setPanel('world')} /><div className="mb-4 rounded-2xl bg-ink p-4 text-cream"><p className="text-xs uppercase tracking-widest text-gold">Level {player.resident.level}</p><h3 className="font-display text-2xl font-bold">{player.account.username}</h3><p className="text-sm text-cream/60">{player.resident.xp} total XP · {player.resident.jobsCompleted} jobs completed</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PROFESSION_SKILLS.map((skill) => <div key={skill} className="rounded-xl border border-ink/10 bg-white p-3"><p className="capitalize text-ink/60">{skill}</p><b>{professionRank(player.skills[skill])}</b><p className="text-xs text-ink/45">{player.skills[skill]} XP</p></div>)}</div></section>;
}

export function GamePanels() {
  const panel = useGameStore((state) => state.panel); const player = useGameStore((state) => state.player);
  if (!player) return null;
  if (panel === 'bag') return <InventoryPanel />;
  if (panel === 'crafting') return <CraftingPanel />;
  if (panel === 'market') return <MarketPanel />;
  if (panel === 'property') return <PropertyPanel />;
  if (panel === 'businesses') return <BusinessesPanel />;
  if (panel === 'quests') return <TodayPanel />;
  if (panel === 'profile') return <ProfilePanel />;
  const job = LOCATION_JOB[player.resident.currentLocation];
  return job ? <JobAction jobType={job} /> : null;
}
void TownHallPanel;

export function MessageToast() {
  const error = useGameStore((state) => state.error); const notice = useGameStore((state) => state.notice); const dismiss = useGameStore((state) => state.dismissMessage); const message = error ?? notice;
  if (!message) return null;
  return <div role={error ? 'alert' : 'status'} className={`absolute left-1/2 top-20 z-40 flex w-[min(92%,460px)] -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-xl ${error ? 'bg-red-950' : 'bg-moss'}`}>{error ? <AlertTriangle className="h-4 w-4 shrink-0"/> : <Hammer className="h-4 w-4 shrink-0"/>}<span className="flex-1">{message}</span><button onClick={dismiss} aria-label="Dismiss message"><X className="h-4 w-4"/></button></div>;
}

import { Battery, Coins, ShieldCheck, Star } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';

export function Hud() {
  const player = useGameStore((state) => state.player);
  if (!player) return null;
  const stats = [
    { label: 'Level', value: player.resident.level, icon: ShieldCheck },
    { label: 'Coins', value: player.economy.coins, icon: Coins },
    { label: 'Energy', value: `${player.resident.energy}/${player.resident.maxEnergy}`, icon: Battery },
    { label: 'Founder', value: player.season.founderPoints, icon: Star }
  ];
  return <header className="absolute inset-x-2 top-2 z-20 flex justify-center gap-1.5 sm:gap-3">
    {stats.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 items-center gap-1.5 rounded-xl border border-white/20 bg-ink/90 px-2.5 py-2 text-cream shadow-lg backdrop-blur sm:px-4">
      <Icon className="h-4 w-4 shrink-0 text-gold"/><span className="hidden text-[10px] uppercase tracking-widest opacity-60 sm:inline">{label}</span><strong className="text-xs sm:text-sm">{value}</strong>
    </div>)}
  </header>;
}

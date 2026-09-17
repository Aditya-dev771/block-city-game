import { Backpack, CircleUserRound, House, Map, ShoppingBasket, ScrollText } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';

const items = [ ['world', 'World', Map], ['bag', 'Bag', Backpack], ['market', 'Market', ShoppingBasket], ['businesses', 'Business', House], ['quests', 'Town Hall', ScrollText], ['profile', 'Profile', CircleUserRound] ] as const;
export function BottomNav() {
  const panel = useGameStore((s) => s.panel); const setPanel = useGameStore((s) => s.setPanel);
  return <nav className="absolute inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/10 bg-ink/95 pb-[env(safe-area-inset-bottom)] text-cream backdrop-blur">
    {items.map(([id, label, Icon]) => <button key={id} onClick={() => setPanel(id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] transition ${panel === id ? 'bg-white/10 text-gold' : 'text-cream/70 hover:text-cream'}`}><Icon className="h-5 w-5"/><span>{label}</span></button>)}
  </nav>;
}

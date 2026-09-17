import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { supabase } from './services/supabase';
import { useGameStore } from './stores/gameStore';
import { AuthScreen } from './components/auth/AuthScreen';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './components/hud/Hud';
import { BottomNav } from './components/navigation/BottomNav';
import { GamePanels, MessageToast } from './components/panels/GamePanels';
import { AdminEconomyPage } from './components/admin/AdminEconomyPage';
import { AlphaDebugPanel } from './components/debug/AlphaDebugPanel';
import { endObservedSession, heartbeatObservedSession, startObservedSession } from './services/sessionTelemetry';

export default function App(){return window.location.pathname==='/admin/economy'?<AdminEconomyPage/>:<GameApp/>}
function GameApp(){
 const[session,setSession]=useState<Session|null>(null);const[checking,setChecking]=useState(true);const player=useGameStore(s=>s.player);const error=useGameStore(s=>s.error);const load=useGameStore(s=>s.load);const clear=useGameStore(s=>s.clear);
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>{setSession(data.session);setChecking(false)});const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)void load();else clear()},[session,load,clear]);
 useEffect(()=>{if(!session)return;void startObservedSession();const timer=window.setInterval(()=>void heartbeatObservedSession(),180000);return()=>{window.clearInterval(timer);void endObservedSession()}},[session]);
 if(checking)return <div className="grid min-h-dvh place-items-center bg-ink font-display text-cream">Preparing the town…</div>;
 if(!session)return <AuthScreen/>;
 if(!player)return <div className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-cream"><div><p className="font-display text-xl">{error??'Loading your resident…'}</p>{error?<button onClick={()=>void load()} className="mt-4 rounded-xl bg-gold px-4 py-2 font-bold text-ink">Try again</button>:null}</div></div>;
 return <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-moss"><GameCanvas/><Hud/><AlphaDebugPanel/><button onClick={()=>void supabase.auth.signOut()} className="absolute right-2 top-[4.5rem] z-30 rounded-full bg-ink/80 p-2.5 text-cream shadow" aria-label="Log out"><LogOut className="h-4 w-4"/></button><GamePanels/><MessageToast/><BottomNav/></main>;
}

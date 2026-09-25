import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { supabase, supabaseConfigurationError } from './services/supabase';
import { useGameStore } from './stores/gameStore';
import { AuthScreen } from './components/auth/AuthScreen';
import { GameCanvas } from './game/GameCanvas';
import { Hud } from './components/hud/Hud';
import { BottomNav } from './components/navigation/BottomNav';
import { GamePanels, MessageToast } from './components/panels/GamePanels';
import { AdminEconomyPage } from './components/admin/AdminEconomyPage';
import { AlphaHealthPage } from './components/admin/AlphaHealthPage';
import { AlphaDebugPanel } from './components/debug/AlphaDebugPanel';
import { AlphaBanner } from './components/alpha/AlphaBanner';
import { endObservedSession, heartbeatObservedSession, startObservedSession } from './services/sessionTelemetry';

export default function App(){
 if(supabaseConfigurationError)return <ConfigurationError message={supabaseConfigurationError}/>;
 return window.location.pathname==='/admin/economy'?<AdminEconomyPage/>:window.location.pathname==='/admin/health'?<AlphaHealthPage/>:<GameApp/>;
}
function ConfigurationError({message}:{message:string}){
 return <main className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-cream"><section className="max-w-lg rounded-2xl border border-red-200/20 bg-white/10 p-6"><p className="text-xs font-bold uppercase tracking-widest text-red-200">Configuration error</p><h1 className="mt-2 font-display text-2xl font-bold">Block City cannot start</h1><p role="alert" className="mt-3 text-sm text-cream/80">{message}</p><p className="mt-4 text-xs text-cream/60">No credentials are displayed. Please contact the Private Alpha administrator.</p></section></main>;
}
function GameApp(){
 const[session,setSession]=useState<Session|null>(null);const[checking,setChecking]=useState(true);const player=useGameStore(s=>s.player);const error=useGameStore(s=>s.error);const load=useGameStore(s=>s.load);const clear=useGameStore(s=>s.clear);
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>{setSession(data.session);setChecking(false)});const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)void load();else clear()},[session,load,clear]);
 useEffect(()=>{if(!session)return;void startObservedSession();const timer=window.setInterval(()=>void heartbeatObservedSession(),180000);return()=>{window.clearInterval(timer);void endObservedSession()}},[session]);
 if(checking)return <div className="grid min-h-dvh place-items-center bg-ink font-display text-cream">Preparing the town…</div>;
 if(!session)return <AuthScreen/>;
 if(!player)return <div className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-cream"><div><p className="font-display text-xl">{error??'Loading your resident…'}</p>{error?<button onClick={()=>void load()} className="mt-4 rounded-xl bg-gold px-4 py-2 font-bold text-ink">Try again</button>:null}</div></div>;
 return <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-moss"><GameCanvas/><Hud/><AlphaBanner/><AlphaDebugPanel/><button onClick={()=>void supabase.auth.signOut()} className="absolute right-2 top-[4.5rem] z-30 rounded-full bg-ink/80 p-2.5 text-cream shadow" aria-label="Log out"><LogOut className="h-4 w-4"/></button><GamePanels/><MessageToast/><BottomNav/></main>;
}

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogOut, X } from 'lucide-react';
import { supabase, supabaseConfigurationError } from './services/supabase';
import { useGameStore } from './stores/gameStore';
import { AuthScreen } from './components/auth/AuthScreen';
import { WalletAuthPanel } from './components/auth/WalletAuthPanel';
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
 const[session,setSession]=useState<Session|null>(null);const player=useGameStore(s=>s.player);const error=useGameStore(s=>s.error);const load=useGameStore(s=>s.load);const clear=useGameStore(s=>s.clear);const authenticated=useGameStore(s=>s.authenticated);const authRequest=useGameStore(s=>s.authRequest);const dismissAuth=useGameStore(s=>s.dismissAuth);
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>setSession(data.session));const{data}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>data.subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)void load();else clear()},[session,load,clear]);
 useEffect(()=>{if(!session)return;void startObservedSession();const timer=window.setInterval(()=>void heartbeatObservedSession(),180000);return()=>{window.clearInterval(timer);void endObservedSession()}},[session]);
 if(!player)return <div className="grid min-h-dvh place-items-center bg-ink p-6 text-center text-cream"><div><p className="font-display text-xl">{error??'Loading your resident…'}</p>{error?<button onClick={()=>void load()} className="mt-4 rounded-xl bg-gold px-4 py-2 font-bold text-ink">Try again</button>:null}</div></div>;
 return <main className="relative h-dvh min-h-[480px] w-full overflow-hidden bg-moss"><GameCanvas/><Hud/><AlphaBanner/><AlphaDebugPanel/>{authenticated?<button onClick={()=>void supabase.auth.signOut()} className="absolute right-2 top-[4.5rem] z-30 rounded-full bg-ink/80 p-2.5 text-cream shadow" aria-label="Log out"><LogOut className="h-4 w-4"/></button>:null}<GamePanels/><MessageToast/><BottomNav/>{authRequest?<AuthOverlay mode={authRequest} onClose={dismissAuth}/>:null}</main>;
}

function AuthOverlay({mode,onClose}:{mode:'prompt'|'wallet'|'legacy';onClose:()=>void}){
 const requestAuth=useGameStore(s=>s.requestAuth);
 if(mode==='wallet')return <div className="absolute inset-0 z-50 overflow-auto bg-ink"><WalletAuthPanel onClose={onClose}/></div>;
 if(mode==='legacy')return <div className="absolute inset-0 z-50 overflow-auto bg-ink"><AuthScreen initialMode="login" onClose={onClose}/></div>;
 return <div className="absolute inset-0 z-50 grid place-items-center bg-ink/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="guest-auth-title"><section className="relative max-w-md rounded-3xl bg-cream p-7 text-center text-ink shadow-2xl"><button onClick={onClose} className="absolute right-3 top-3 rounded-full p-2 hover:bg-ink/10" aria-label="Close"><X className="h-5 w-5"/></button><p className="text-xs font-bold uppercase tracking-[.25em] text-clay">Enter the Economy</p><h2 id="guest-auth-title" className="mt-3 font-display text-3xl font-bold">Connect your wallet and verify your Citizen NFT.</h2><p className="mt-3 text-sm text-ink/60">Explore freely, then verify citizenship to start building your life in Block City.</p><button onClick={()=>requestAuth('wallet')} className="mt-6 w-full rounded-xl bg-moss px-4 py-3 font-bold text-white">Connect Wallet</button><button onClick={()=>requestAuth('legacy')} className="mt-2 w-full text-sm font-semibold text-ink/55">Legacy Alpha email access</button></section></div>;
}

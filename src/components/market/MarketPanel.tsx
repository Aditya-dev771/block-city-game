import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Store } from 'lucide-react';
import { marketplaceFee } from '../../domain/economyEngine';
import { useGameStore } from '../../stores/gameStore';
import type { MarketResource, MarketSide } from '../../types/game';
import { PanelHeader } from '../inventory/InventoryPanel';

const ICONS = { wood: '🪵', stone: '🪨', iron: '⛓️', food: '🥕' } as const;
const QUICK_QUANTITIES = [1,5,10] as const;

function MarketResourceCard({ resource, atMarket }: { resource: MarketResource; atMarket: boolean }) {
  const [side,setSide]=useState<MarketSide>('buy'); const [quantity,setQuantity]=useState(1);
  const player=useGameStore((state)=>state.player); const authenticated=useGameStore((state)=>state.authenticated); const pending=useGameStore((state)=>state.actionPending); const trade=useGameStore((state)=>state.tradeMarket);
  if(!player) return null;
  const gross=resource.currentPrice*quantity; const fee=marketplaceFee(gross); const finalAmount=side==='buy' ? gross+fee : gross-fee;
  const owned=player.inventory[resource.resourceId]; const unavailable=authenticated&&(side==='buy' ? resource.currentSupply<quantity || player.economy.coins<finalAmount : owned<quantity);
  return <article className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between"><div className="flex gap-3"><span className="text-3xl" aria-hidden="true">{ICONS[resource.resourceId]}</span><div><h3 className="font-display text-lg font-bold capitalize">{resource.resourceId}</h3><p className="text-xs text-ink/50">Supply {resource.currentSupply} · You own {owned}</p></div></div><strong className="rounded-lg bg-gold/15 px-2.5 py-1 text-ink">{resource.currentPrice} Coins</strong></div>
    <div className="mt-4 grid grid-cols-2 rounded-xl bg-ink/5 p-1"><button onClick={()=>setSide('buy')} className={`rounded-lg py-2 text-sm font-bold ${side==='buy'?'bg-white text-moss shadow':'text-ink/50'}`}>Buy</button><button onClick={()=>setSide('sell')} className={`rounded-lg py-2 text-sm font-bold ${side==='sell'?'bg-white text-clay shadow':'text-ink/50'}`}>Sell</button></div>
    <div className="mt-3 flex items-center gap-1.5">{QUICK_QUANTITIES.map((value)=><button key={value} onClick={()=>setQuantity(value)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${quantity===value?'border-moss bg-moss text-white':'border-ink/10'}`}>{value}</button>)}<label className="ml-auto flex items-center gap-2 text-xs text-ink/50">Qty<input aria-label={`${resource.resourceId} quantity`} type="number" min="1" max="25" value={quantity} onChange={(event)=>setQuantity(Math.min(25,Math.max(1,Number.parseInt(event.target.value,10)||1)))} className="w-16 rounded-lg border border-ink/15 px-2 py-1.5 text-center text-ink"/></label></div>
    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-cream p-3 text-xs"><div><dt className="text-ink/45">Gross</dt><dd className="font-bold">{gross}</dd></div><div><dt className="text-ink/45">Fee estimate</dt><dd className="font-bold">{fee}</dd></div><div><dt className="text-ink/45">{side==='buy'?'Total':'Net'}</dt><dd className="font-bold">{finalAmount}</dd></div></dl>
    <button disabled={!atMarket||pending||unavailable} onClick={()=>void trade(side,resource.resourceId,quantity)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-moss px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{side==='buy'?<ArrowDownToLine className="h-4 w-4"/>:<ArrowUpFromLine className="h-4 w-4"/>}{pending?'Trading…':`${side==='buy'?'Buy':'Sell'} ${quantity}`}</button>
  </article>;
}

export function MarketPanel() {
  const player=useGameStore((state)=>state.player); const setPanel=useGameStore((state)=>state.setPanel); if(!player) return null; const atMarket=player.resident.currentLocation==='market';
  return <section className="panel"><PanelHeader title="Town Market" onClose={()=>setPanel('world')}/>{!atMarket?<div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900"><Store className="h-4 w-4"/>Walk to the Market to trade.</div>:null}<p className="mb-4 text-sm text-ink/60">Prices respond to supply. Estimates may change; the server returns the actual execution price.</p><div className="grid gap-3 sm:grid-cols-2">{player.market.resources.map((resource)=><MarketResourceCard key={resource.resourceId} resource={resource} atMarket={atMarket}/>)}</div>{player.market.recentTransactions.length>0?<div className="mt-5"><h3 className="font-display text-lg font-bold">Recent trades</h3><div className="mt-2 space-y-1 text-sm">{player.market.recentTransactions.slice(0,5).map((transaction)=><div key={transaction.id} className="flex justify-between rounded-lg bg-white px-3 py-2"><span className="capitalize">{transaction.side} {transaction.quantity} {transaction.resource}</span><span>{transaction.net} Coins · fee {transaction.fee}</span></div>)}</div></div>:null}</section>;
}

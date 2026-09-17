import { ECONOMY } from '../config/economy';
import type { BusinessRecipeId, BusinessType, JobType, MarketResourceId, RecipeId, ResidentWorkState } from '../types/game';

export interface EconomySnapshot {
  coins: number; energy: number; maxEnergy: number; xp: number; level: number; founderPoints: number; propertyLevel: number; storageCapacity: number; businessSlots: number; orderCompleted: boolean; tradesCompleted: number; tradeQuestProgress: number; reservedProductionStorage?: number; businessQuestProgress?: number; workState?: ResidentWorkState;
  inventory: { wood: number; stone: number; iron: number; food: number; planks: number; meals: number; tools: number };
  skills: { lumberjack: number; miner: number; farmer: number; merchant: number; chef?: number; engineer?: number };
}
export interface ActionGuard { seen: Set<string> }
export interface LedgerEntry { transactionType: string; resource: string; amount: number; balanceBefore: number; balanceAfter: number; referenceId: string }
export interface EconomyActionResult { state: EconomySnapshot; ledger: LedgerEntry[]; referenceId: string }
const copy = (state: EconomySnapshot): EconomySnapshot => ({ ...state, inventory: { ...state.inventory }, skills: { ...state.skills } });
function once(guard: ActionGuard, key: string) { if (guard.seen.has(key)) throw new Error('Duplicate action'); guard.seen.add(key); }
function requireAtLeast(actual: number, required: number, label: string) { if (actual < required) throw new Error(`Not enough ${label}`); }
function entry(transactionType: string, resource: string, amount: number, balanceBefore: number, referenceId: string): LedgerEntry { return { transactionType, resource, amount, balanceBefore, balanceAfter: balanceBefore + amount, referenceId }; }
function updateLevel(state: EconomySnapshot) { state.level = 1 + Math.floor(state.xp / ECONOMY.xpPerLevel); }

export function storageUsed(inventory: EconomySnapshot['inventory']): number { return Object.values(inventory).reduce((total,value)=>total+value,0); }
export function validateStorageCapacity(inventory: EconomySnapshot['inventory'], capacity: number): void { if (storageUsed(inventory)>capacity) throw new Error('Storage capacity exceeded'); }
export function effectiveStorageUsage(inventory: EconomySnapshot['inventory'], reservedOutput=0): number { return storageUsed(inventory)+reservedOutput; }
export function validateBusinessSlot(used:number,total:number):void { if(used>=total) throw new Error('No business slot available'); }
export function calculateBusinessTax(gross:number,rate=0.05):number { return Math.ceil(gross*rate); }
export function calculateGeneralStoreNet(gross=75):number { return gross-calculateBusinessTax(gross); }
export function outputStorageRequirement(type:BusinessType):number { return ECONOMY.businesses[type].outputStorage; }
export function validateOutputReservation(state:EconomySnapshot,type:BusinessType):void { if(effectiveStorageUsage(state.inventory,state.reservedProductionStorage??0)+outputStorageRequirement(type)>state.storageCapacity) throw new Error('Storage capacity exceeded'); }
export function validateResidentAssignment(workState:ResidentWorkState,assignedBusinessId:string|null,businessOccupied:boolean):void { if(workState==='PRODUCING') throw new Error('Resident is producing'); if(assignedBusinessId) throw new Error('Resident already assigned'); if(businessOccupied) throw new Error('Business already has a resident'); }
export function validateProductionTransition(state:'NONE'|'RUNNING'|'READY'|'CLAIMED',action:'start'|'claim',nowMs=Date.now(),readyAtMs=0):void { if(action==='start'&&state!=='NONE') throw new Error('Production already active'); if(action==='claim'){ if(state==='CLAIMED') throw new Error('Production already claimed'); if(state!=='RUNNING'&&state!=='READY') throw new Error('Invalid production state'); if(nowMs<readyAtMs) throw new Error('PRODUCTION_NOT_READY'); } }
export function businessReadyAt(startedAt:Date,type:BusinessType):Date { return new Date(startedAt.getTime()+ECONOMY.businesses[type].durationSeconds*1000); }
export function businessQuestEligible(previousProgress:number):boolean { return previousProgress<ECONOMY.businessQuest.target; }
export function founderTier(points:number){return ECONOMY.founderRanks.find(t=>points>=t.min)??ECONOMY.founderRanks.at(-1)!;}
export function nextFounderTier(points:number){return [...ECONOMY.founderRanks].reverse().find(t=>t.min>points)??null;}
export function calculateStreak(lastActive:string|null,current:number,today:string){if(lastActive===today)return current;if(!lastActive)return 1;const day=86400000;const difference=(Date.parse(`${today}T00:00:00Z`)-Date.parse(`${lastActive}T00:00:00Z`))/day;return difference===1?current+1:1;}
export function weeklyCycleForStreak(streak:number){return Math.floor(streak/7);}
export function deterministicDailyOrders(playerId:string,date:string,pool:string[],count=3){let seed=[...`${playerId}:${date}`].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,2166136261);const values=[...pool];for(let i=values.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[values[i],values[j]]=[values[j]!,values[i]!];}return values.slice(0,count);}
export function sourceSinkRatio(created:number,destroyed:number){return destroyed===0?(created===0?0:Infinity):created/destroyed;}
export function netResourceFlow(created:number,destroyed:number){return created-destroyed;}
export function businessProfitability(type:BusinessType,prices:Record<'wood'|'stone'|'iron'|'food'|'meals'|'tools',number>){const config=ECONOMY.businesses[type];const input=Object.entries(config.input).reduce((sum,[resource,amount])=>sum+prices[resource as keyof typeof prices]*amount,0);const gross=type==='general_store'?75:type==='restaurant'?2*prices.meals:prices.tools;const tax=type==='general_store'?calculateBusinessTax(gross):0;const net=gross-tax;const profit=net-input;return{inputMarketValue:input,grossOutputValue:gross,tax,netOutputValue:net,profit,profitMargin:net===0?0:profit/net,profitPerHour:profit*3600/config.durationSeconds};}
export function fpPace(values:number[]){if(!values.length)return{average:0,median:0,p95:0};const sorted=[...values].sort((a,b)=>a-b);return{average:values.reduce((a,b)=>a+b,0)/values.length,median:sorted[Math.floor((sorted.length-1)*.5)]!,p95:sorted[Math.floor((sorted.length-1)*.95)]!};}
export function validateBusinessRecipeInput(state:EconomySnapshot,type:BusinessType):void { for(const [resource,amount] of Object.entries(ECONOMY.businesses[type].input)) requireAtLeast(state.inventory[resource as keyof EconomySnapshot['inventory']],amount,resource); }
export function startBusinessProduction(state:EconomySnapshot,guard:ActionGuard,key:string,type:BusinessType,recipeId:BusinessRecipeId):EconomyActionResult { const config=ECONOMY.businesses[type]; if(config.recipeId!==recipeId) throw new Error('Recipe does not belong to business'); validateBusinessRecipeInput(state,type); validateOutputReservation(state,type); once(guard,key); const next=copy(state); const ledger:LedgerEntry[]=[]; for(const [resource,amount] of Object.entries(config.input)){ const keyResource=resource as keyof EconomySnapshot['inventory']; ledger.push(entry('BUSINESS_INPUT_RESOURCE',resource,-amount,state.inventory[keyResource],key)); next.inventory[keyResource]-=amount; } next.reservedProductionStorage=(state.reservedProductionStorage??0)+config.outputStorage; next.workState='PRODUCING'; return {state:next,ledger,referenceId:key}; }
export function claimBusinessProduction(state:EconomySnapshot,guard:ActionGuard,key:string,type:BusinessType,readyAtMs:number,nowMs=Date.now()):EconomyActionResult { validateProductionTransition('RUNNING','claim',nowMs,readyAtMs); once(guard,key); const config=ECONOMY.businesses[type]; const next=copy(state); const ledger:LedgerEntry[]=[]; if(type==='general_store'){ const gross=ECONOMY.businesses.general_store.output.coins; const tax=calculateBusinessTax(gross,config.taxRate); const net=gross-tax; ledger.push(entry('BUSINESS_NET_REVENUE','coins',net,state.coins,key)); next.coins+=net; } else { const output=type==='restaurant'?'meals':'tools'; const amount=type==='restaurant'?2:1; ledger.push(entry('BUSINESS_OUTPUT_RESOURCE',output,amount,state.inventory[output],key)); next.inventory[output]+=amount; } next.reservedProductionStorage=Math.max(0,(state.reservedProductionStorage??0)-config.outputStorage); next.xp+=config.generalXp; next.skills[config.profession]=(next.skills[config.profession]??0)+config.professionXp; next.businessQuestProgress=Math.min(1,(state.businessQuestProgress??0)+1); next.workState='ASSIGNED_BUSINESS'; updateLevel(next); return {state:next,ledger,referenceId:key}; }
export function scarcityMultiplier(currentSupply: number, initialSupply: number, minMultiplier=ECONOMY.market.minMultiplier, maxMultiplier=ECONOMY.market.maxMultiplier): number {
  if (initialSupply<=0 || currentSupply<0) throw new Error('Invalid market supply');
  const raw=currentSupply===0 ? maxMultiplier : initialSupply/currentSupply;
  return Math.min(maxMultiplier,Math.max(minMultiplier,raw));
}
export function executionPrice(resource: MarketResourceId,currentSupply: number): number { const config=ECONOMY.market.resources[resource]; return Math.round(config.basePrice*scarcityMultiplier(currentSupply,config.initialSupply)); }
export function marketplaceFee(gross: number): number { return Math.ceil(gross*ECONOMY.market.feeRate); }
export function validateMarketQuantity(quantity: number): void { if (!Number.isSafeInteger(quantity) || quantity<ECONOMY.market.minQuantity || quantity>ECONOMY.market.maxQuantity) throw new Error('Quantity must be between 1 and 25'); }

export function executeJob(state: EconomySnapshot, guard: ActionGuard, key: string, jobType: JobType): EconomyActionResult {
  const job = ECONOMY.jobs[jobType]; requireAtLeast(state.energy, job.energy, 'energy');
  const next = copy(state); const referenceId = key; const ledger: LedgerEntry[] = [entry('JOB_ENERGY_COST', 'energy', -job.energy, state.energy, referenceId), entry('JOB_REWARD', 'coins', job.rewards.coins, state.coins, referenceId), entry('JOB_REWARD', 'xp', job.rewards.xp, state.xp, referenceId), entry('JOB_REWARD', `${jobType}_xp`, job.rewards.professionXp, state.skills[jobType], referenceId)];
  next.energy -= job.energy; next.coins += job.rewards.coins; next.xp += job.rewards.xp; next.skills[jobType] += job.rewards.professionXp;
  if (jobType === 'lumberjack') { const rewards=ECONOMY.jobs.lumberjack.rewards; ledger.push(entry('JOB_REWARD', 'wood', rewards.wood, state.inventory.wood, referenceId)); next.inventory.wood += rewards.wood; }
  if (jobType === 'miner') { const rewards=ECONOMY.jobs.miner.rewards; ledger.push(entry('JOB_REWARD', 'stone', rewards.stone, state.inventory.stone, referenceId), entry('JOB_REWARD', 'iron', rewards.iron, state.inventory.iron, referenceId)); next.inventory.stone += rewards.stone; next.inventory.iron += rewards.iron; }
  if (jobType === 'farmer') { const rewards=ECONOMY.jobs.farmer.rewards; ledger.push(entry('JOB_REWARD', 'food', rewards.food, state.inventory.food, referenceId)); next.inventory.food += rewards.food; }
  validateStorageCapacity(next.inventory,next.storageCapacity); once(guard,key); updateLevel(next); return { state: next, ledger, referenceId };
}

export function executeLumberjack(state: EconomySnapshot, guard: ActionGuard, key: string) {
  return executeJob(state, guard, key, 'lumberjack').state;
}
export function craft(state: EconomySnapshot, recipe: 'planks' | 'meal' | 'tool') {
  const next = copy(state);
  if (recipe === 'planks') { requireAtLeast(next.inventory.wood, 5, 'wood'); requireAtLeast(next.coins, 5, 'coins'); next.inventory.wood -= 5; next.coins -= 5; next.inventory.planks += 2; }
  if (recipe === 'meal') { requireAtLeast(next.inventory.food, 3, 'food'); requireAtLeast(next.coins, 5, 'coins'); next.inventory.food -= 3; next.coins -= 5; next.inventory.meals += 1; }
  if (recipe === 'tool') { requireAtLeast(next.inventory.iron, 3, 'iron'); requireAtLeast(next.inventory.wood, 2, 'wood'); requireAtLeast(next.coins, 15, 'coins'); next.inventory.iron -= 3; next.inventory.wood -= 2; next.coins -= 15; next.inventory.tools += 1; }
  return next;
}
export function marketTrade(state: EconomySnapshot, side: 'buy' | 'sell', resource: 'wood' | 'stone' | 'iron' | 'food', quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Invalid quantity');
  const prices = { wood: 22, stone: 18, iron: 48, food: 16 }; const gross = prices[resource] * quantity; const fee = Math.ceil(gross * 0.05); const next = copy(state);
  if (side === 'buy') { requireAtLeast(next.coins, gross + fee, 'coins'); next.coins -= gross + fee; next.inventory[resource] += quantity; }
  else { requireAtLeast(next.inventory[resource], quantity, resource); next.inventory[resource] -= quantity; next.coins += gross - fee; }
  return next;
}
export function upgradeProperty(state: EconomySnapshot) {
  const next = copy(state);
  if (state.propertyLevel === 1) { requireAtLeast(next.coins, 500, 'coins'); requireAtLeast(next.inventory.wood, 40, 'wood'); requireAtLeast(next.inventory.stone, 25, 'stone'); next.coins -= 500; next.inventory.wood -= 40; next.inventory.stone -= 25; next.propertyLevel = 2; next.businessSlots = 1; return next; }
  if (state.propertyLevel === 2) { requireAtLeast(next.coins, 1200, 'coins'); requireAtLeast(next.inventory.wood, 30, 'wood'); requireAtLeast(next.inventory.stone, 25, 'stone'); requireAtLeast(next.inventory.iron, 8, 'iron'); next.coins -= 1200; next.inventory.wood -= 30; next.inventory.stone -= 25; next.inventory.iron -= 8; next.propertyLevel = 3; next.businessSlots = 2; return next; }
  throw new Error('Property is already at maximum level');
}
export function produceGeneralStore(state: EconomySnapshot) { const next = copy(state); requireAtLeast(next.inventory.wood, 3, 'wood'); requireAtLeast(next.inventory.food, 2, 'food'); next.inventory.wood -= 3; next.inventory.food -= 2; next.coins += Math.floor(75 * 0.95); return next; }
export function claimFounderPoints(state: EconomySnapshot, reward: number, earnedToday: number, alreadyClaimed: boolean) { if (alreadyClaimed) throw new Error('Reward already claimed'); if (earnedToday + reward > 45) throw new Error('Daily Founder Point cap exceeded'); const next = copy(state); next.founderPoints += reward; return next; }

export function craftAction(state: EconomySnapshot, guard: ActionGuard, key: string, recipe: RecipeId): EconomyActionResult {
  const next = craft(state, recipe); validateStorageCapacity(next.inventory,next.storageCapacity); once(guard, key); const referenceId = key; const ledger: LedgerEntry[] = [];
  const coinCost = state.coins-next.coins; ledger.push(entry('CRAFT_COIN_COST','coins',-coinCost,state.coins,referenceId));
  for (const resource of ['wood','stone','iron','food'] as const) { const amount=next.inventory[resource]-state.inventory[resource]; if (amount<0) ledger.push(entry('CRAFT_RESOURCE_COST',resource,amount,state.inventory[resource],referenceId)); }
  for (const resource of ['planks','meals','tools'] as const) { const amount=next.inventory[resource]-state.inventory[resource]; if (amount>0) ledger.push(entry('CRAFT_OUTPUT',resource,amount,state.inventory[resource],referenceId)); }
  return { state: next, ledger, referenceId };
}

export function useMeal(state: EconomySnapshot, guard: ActionGuard, key: string): EconomyActionResult {
  if (state.energy >= state.maxEnergy) throw new Error('Energy is already full'); requireAtLeast(state.inventory.meals,1,'meals'); once(guard,key);
  const next=copy(state); const restored=Math.min(ECONOMY.mealEnergyRestore,state.maxEnergy-state.energy); next.inventory.meals-=1; next.energy+=restored;
  return { state:next,referenceId:key,ledger:[entry('MEAL_CONSUME','meals',-1,state.inventory.meals,key),entry('ENERGY_RESTORE','energy',restored,state.energy,key)] };
}

export function completeOldBridge(state: EconomySnapshot, guard: ActionGuard, key: string): EconomyActionResult {
  if (state.orderCompleted) throw new Error('Order already completed'); const order=ECONOMY.orders.repair_old_bridge; requireAtLeast(state.inventory.wood,order.requirements.wood,'wood'); requireAtLeast(state.inventory.stone,order.requirements.stone,'stone'); once(guard,key);
  const next=copy(state); next.inventory.wood-=order.requirements.wood; next.inventory.stone-=order.requirements.stone; next.coins+=order.rewards.coins; next.xp+=order.rewards.xp; next.founderPoints+=order.rewards.founderPoints; next.orderCompleted=true; updateLevel(next);
  return { state:next,referenceId:key,ledger:[entry('NPC_ORDER_RESOURCE_COST','wood',-order.requirements.wood,state.inventory.wood,key),entry('NPC_ORDER_RESOURCE_COST','stone',-order.requirements.stone,state.inventory.stone,key),entry('NPC_ORDER_REWARD','coins',order.rewards.coins,state.coins,key),entry('NPC_ORDER_REWARD','xp',order.rewards.xp,state.xp,key),entry('FOUNDER_POINTS_REWARD','founder_points',order.rewards.founderPoints,state.founderPoints,key)] };
}

export interface MarketActionResult extends EconomyActionResult { marketSupply: number; unitPrice: number; gross: number; fee: number; net: number }
export function buyFromMarket(state: EconomySnapshot, guard: ActionGuard, key: string, resource: MarketResourceId, quantity: number, currentSupply: number): MarketActionResult {
  validateMarketQuantity(quantity); if(currentSupply<quantity) throw new Error('Insufficient market supply'); const unitPrice=executionPrice(resource,currentSupply); const gross=unitPrice*quantity; const fee=marketplaceFee(gross); const total=gross+fee; requireAtLeast(state.coins,total,'coins');
  const next=copy(state); next.inventory[resource]+=quantity; validateStorageCapacity(next.inventory,next.storageCapacity); once(guard,key); next.coins-=total; next.skills.merchant+=ECONOMY.market.merchantXpPerTrade; next.tradesCompleted+=1; next.tradeQuestProgress=Math.min(2,next.tradeQuestProgress+1);
  const ledger=[entry('MARKET_BUY_COIN_COST','coins',-gross,state.coins,key),entry('MARKET_FEE','coins',-fee,state.coins-gross,key),entry('MARKET_BUY_RESOURCE',resource,quantity,state.inventory[resource],key)];
  return {state:next,ledger,referenceId:key,marketSupply:currentSupply-quantity,unitPrice,gross,fee,net:total};
}
export function sellToMarket(state: EconomySnapshot, guard: ActionGuard, key: string, resource: MarketResourceId, quantity: number, currentSupply: number): MarketActionResult {
  validateMarketQuantity(quantity); requireAtLeast(state.inventory[resource],quantity,resource); const unitPrice=executionPrice(resource,currentSupply); const gross=unitPrice*quantity; const fee=marketplaceFee(gross); const net=gross-fee; once(guard,key); const next=copy(state); next.inventory[resource]-=quantity; next.coins+=net; next.skills.merchant+=ECONOMY.market.merchantXpPerTrade; next.tradesCompleted+=1; next.tradeQuestProgress=Math.min(2,next.tradeQuestProgress+1);
  const ledger=[entry('MARKET_SELL_RESOURCE',resource,-quantity,state.inventory[resource],key),entry('MARKET_SELL_COIN_REWARD','coins',gross,state.coins,key),entry('MARKET_FEE','coins',-fee,state.coins+gross,key)];
  return {state:next,ledger,referenceId:key,marketSupply:currentSupply+quantity,unitPrice,gross,fee,net};
}

export function upgradePropertyAction(state: EconomySnapshot, guard: ActionGuard, key: string, targetLevel: 2|3): EconomyActionResult {
  if(targetLevel!==state.propertyLevel+1) throw new Error('Property upgrades must advance exactly one level'); const config=ECONOMY.property[targetLevel]; const cost=config.cost; const ironCost=targetLevel===3?ECONOMY.property[3].cost.iron:0; requireAtLeast(state.coins,cost.coins,'coins'); requireAtLeast(state.inventory.wood,cost.wood,'wood'); requireAtLeast(state.inventory.stone,cost.stone,'stone'); if(ironCost>0) requireAtLeast(state.inventory.iron,ironCost,'iron'); once(guard,key);
  const next=copy(state); next.coins-=cost.coins; next.inventory.wood-=cost.wood; next.inventory.stone-=cost.stone; if(ironCost>0) next.inventory.iron-=ironCost; next.propertyLevel=targetLevel; next.storageCapacity=config.storageCapacity; next.businessSlots=config.businessSlots;
  const ledger=[entry('PROPERTY_UPGRADE_COIN_COST','coins',-cost.coins,state.coins,key),entry('PROPERTY_UPGRADE_RESOURCE_COST','wood',-cost.wood,state.inventory.wood,key),entry('PROPERTY_UPGRADE_RESOURCE_COST','stone',-cost.stone,state.inventory.stone,key),entry('PROPERTY_LEVEL_CHANGE','property_level',1,state.propertyLevel,key)]; if(ironCost>0) ledger.splice(3,0,entry('PROPERTY_UPGRADE_RESOURCE_COST','iron',-ironCost,state.inventory.iron,key));
  return {state:next,ledger,referenceId:key};
}

import { beforeEach, describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import { businessProfitability, calculateStreak, deterministicDailyOrders, founderTier, fpPace, netResourceFlow, nextFounderTier, sourceSinkRatio, weeklyCycleForStreak } from './economyEngine';
import { businessQuestEligible, businessReadyAt, buyFromMarket, calculateBusinessTax, calculateGeneralStoreNet, claimBusinessProduction, claimFounderPoints, completeOldBridge, craft, craftAction, effectiveStorageUsage, executeJob, executeLumberjack, executionPrice, marketplaceFee, marketTrade, outputStorageRequirement, produceGeneralStore, scarcityMultiplier, sellToMarket, startBusinessProduction, storageUsed, upgradeProperty, upgradePropertyAction, useMeal, validateBusinessRecipeInput, validateBusinessSlot, validateMarketQuantity, validateOutputReservation, validateProductionTransition, validateResidentAssignment, validateStorageCapacity, type ActionGuard, type EconomySnapshot } from './economyEngine';

let state: EconomySnapshot; let guard: ActionGuard;
beforeEach(() => {
  state = { coins: 2000, energy: 60, maxEnergy: 100, xp: 0, level: 1, founderPoints: 0, propertyLevel: 1, storageCapacity: 500, businessSlots: 0, orderCompleted: false, tradesCompleted: 0, tradeQuestProgress: 0, reservedProductionStorage:0, businessQuestProgress:0, workState:'IDLE', inventory: { wood: 100, stone: 50, iron: 20, food: 30, planks: 0, meals: 2, tools: 0 }, skills: { lumberjack: 0, miner: 0, farmer: 0, merchant: 0, chef:0, engineer:0 } };
  guard = { seen: new Set() };
});

describe('Milestone 5 retention and telemetry',()=>{
  it('derives qualification tiers and next thresholds',()=>{expect(founderTier(499).rank).toBe('Settler');expect(founderTier(1200).rank).toBe('Whitelist');expect(nextFounderTier(1200)?.min).toBe(2000);expect(nextFounderTier(3000)).toBeNull();});
  it('increments, preserves, and resets UTC streaks',()=>{expect(calculateStreak(null,0,'2026-09-17')).toBe(1);expect(calculateStreak('2026-09-17',4,'2026-09-17')).toBe(4);expect(calculateStreak('2026-09-16',4,'2026-09-17')).toBe(5);expect(calculateStreak('2026-09-15',4,'2026-09-17')).toBe(1);});
  it('calculates weekly cycles without repeated same-cycle eligibility',()=>{expect(weeklyCycleForStreak(6)).toBe(0);expect(weeklyCycleForStreak(7)).toBe(1);expect(weeklyCycleForStreak(14)).toBe(2);});
  it('rotates three deterministic daily orders',()=>{const pool=['a','b','c','d','e'];const first=deterministicDailyOrders('player','2026-09-17',pool);expect(first).toHaveLength(3);expect(new Set(first).size).toBe(3);expect(deterministicDailyOrders('player','2026-09-17',pool)).toEqual(first);});
  it('calculates coin and resource flow metrics',()=>{expect(sourceSinkRatio(100,100)).toBe(1);expect(sourceSinkRatio(50,0)).toBe(Infinity);expect(netResourceFlow(40,15)).toBe(25);});
  it('calculates business profitability from market estimates',()=>{const prices={wood:22,stone:18,iron:48,food:16,meals:60,tools:160};const store=businessProfitability('general_store',prices);expect(store).toMatchObject({inputMarketValue:98,grossOutputValue:75,tax:4,netOutputValue:71,profit:-27});expect(store.profitPerHour).toBe(-108);expect(businessProfitability('restaurant',prices).profit).toBe(56);expect(businessProfitability('workshop',prices).profit).toBe(-24);});
  it('calculates average, median, and p95 FP pace',()=>{expect(fpPace([0,10,20,30,45])).toEqual({average:21,median:20,p95:30});expect(fpPace([])).toEqual({average:0,median:0,p95:0});});
  it('pins economy configuration version',()=>{expect(ECONOMY.version).toBe(1);});
});

describe('Milestone 4 businesses and production',()=>{
  it('enforces business slot limits',()=>{expect(()=>validateBusinessSlot(0,1)).not.toThrow();expect(()=>validateBusinessSlot(1,1)).toThrow('slot');});
  it('rounds General Store tax and returns exact net',()=>{expect(calculateBusinessTax(75)).toBe(4);expect(calculateGeneralStoreNet()).toBe(71);});
  it('validates Restaurant and Workshop inputs',()=>{expect(()=>validateBusinessRecipeInput(state,'restaurant')).not.toThrow(); state.inventory.food=3;expect(()=>validateBusinessRecipeInput(state,'restaurant')).toThrow('food');state.inventory.food=30;state.inventory.iron=1;expect(()=>validateBusinessRecipeInput(state,'workshop')).toThrow('iron');});
  it('defines output reservations separately',()=>{expect(outputStorageRequirement('general_store')).toBe(0);expect(outputStorageRequirement('restaurant')).toBe(2);expect(outputStorageRequirement('workshop')).toBe(1);expect(effectiveStorageUsage(state.inventory,2)).toBe(storageUsed(state.inventory)+2);});
  it('allows exact output capacity and rejects overbooking',()=>{state.storageCapacity=204;expect(()=>validateOutputReservation(state,'restaurant')).not.toThrow();state.storageCapacity=203;expect(()=>validateOutputReservation(state,'restaurant')).toThrow('Storage');});
  it('validates resident assignment and double assignment',()=>{expect(()=>validateResidentAssignment('IDLE',null,false)).not.toThrow();expect(()=>validateResidentAssignment('ASSIGNED_BUSINESS','one',false)).toThrow('already assigned');expect(()=>validateResidentAssignment('PRODUCING',null,false)).toThrow('producing');});
  it('uses trusted production durations',()=>{const start=new Date('2026-01-01T00:00:00Z');expect(businessReadyAt(start,'general_store').toISOString()).toBe('2026-01-01T00:15:00.000Z');expect(businessReadyAt(start,'restaurant').toISOString()).toBe('2026-01-01T00:20:00.000Z');expect(businessReadyAt(start,'workshop').toISOString()).toBe('2026-01-01T00:30:00.000Z');});
  it('consumes inputs and reserves Restaurant output on start',()=>{const result=startBusinessProduction(state,guard,'restaurant-start','restaurant','restaurant_meals');expect(result.state.inventory.food).toBe(26);expect(result.state.reservedProductionStorage).toBe(2);expect(result.state.workState).toBe('PRODUCING');});
  it('rejects a recipe belonging to another business',()=>{expect(()=>startBusinessProduction(state,guard,'wrong','restaurant','workshop_tools')).toThrow('does not belong');});
  it('rejects an early claim without consuming idempotency',()=>{expect(()=>claimBusinessProduction(state,guard,'early','restaurant',2000,1000)).toThrow('NOT_READY');expect(guard.seen.has('early')).toBe(false);});
  it('claims Restaurant output once with Chef and General XP',()=>{state.reservedProductionStorage=2;const result=claimBusinessProduction(state,guard,'claim-meals','restaurant',1000,2000);expect(result.state.inventory.meals).toBe(4);expect(result.state.reservedProductionStorage).toBe(0);expect(result.state.skills.chef).toBe(12);expect(result.state.xp).toBe(12);expect(result.state.businessQuestProgress).toBe(1);});
  it('claims Workshop output with Engineer XP',()=>{state.reservedProductionStorage=1;const result=claimBusinessProduction(state,guard,'claim-tools','workshop',1000,2000);expect(result.state.inventory.tools).toBe(1);expect(result.state.skills.engineer).toBe(12);expect(result.state.xp).toBe(15);});
  it('claims General Store net revenue with Merchant XP',()=>{const result=claimBusinessProduction(state,guard,'claim-store','general_store',1000,2000);expect(result.state.coins).toBe(2071);expect(result.state.skills.merchant).toBe(12);expect(result.state.xp).toBe(10);});
  it('prevents duplicate and concurrent claims',async()=>{const attempts=await Promise.allSettled([Promise.resolve().then(()=>claimBusinessProduction(state,guard,'same-claim','restaurant',1,2)),Promise.resolve().then(()=>claimBusinessProduction(state,guard,'same-claim','restaurant',1,2))]);expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);});
  it('advances the business quest only until complete',()=>{expect(businessQuestEligible(0)).toBe(true);expect(businessQuestEligible(1)).toBe(false);});
  it('validates production lifecycle transitions',()=>{expect(()=>validateProductionTransition('NONE','start')).not.toThrow();expect(()=>validateProductionTransition('RUNNING','start')).toThrow('active');expect(()=>validateProductionTransition('CLAIMED','claim')).toThrow('claimed');});
  it('serializes reserved production and work state across reload',()=>{state.reservedProductionStorage=2;state.workState='PRODUCING';expect(JSON.parse(JSON.stringify(state))).toMatchObject({reservedProductionStorage:2,workState:'PRODUCING'});});
});

describe('existing milestone-one economy behavior', () => {
  it('executes the exact lumberjack exchange', () => { const next = executeLumberjack(state, guard, 'one'); expect(next).toMatchObject({ coins: 2014, energy: 50, xp: 12, skills: { lumberjack: 12 } }); expect(next.inventory.wood).toBe(108); });
  it('crafts atomically without mutating input', () => { const next = craft(state, 'tool'); expect(next.inventory).toMatchObject({ iron: 17, wood: 98, tools: 1 }); expect(next.coins).toBe(1985); expect(state.inventory.tools).toBe(0); });
  it('retains marketplace fee validation for its later milestone', () => { const next = marketTrade(state, 'buy', 'iron', 2); expect(next.coins).toBe(1899); expect(next.inventory.iron).toBe(22); expect(() => marketTrade(state, 'buy', 'wood', -1)).toThrow('Invalid quantity'); });
  it('retains property and business rules for their later milestone', () => { const upgraded = upgradeProperty(state); expect(upgraded).toMatchObject({ coins: 1500, propertyLevel: 2, businessSlots: 1 }); expect(produceGeneralStore(state).coins).toBe(2071); });
  it('retains Founder Point daily-cap validation', () => { expect(claimFounderPoints(state, 10, 35, false).founderPoints).toBe(10); expect(() => claimFounderPoints(state, 15, 35, false)).toThrow('cap'); });
});

describe('generalized jobs', () => {
  it('runs Miner with exact costs and rewards', () => { const result=executeJob(state,guard,'miner-1','miner'); expect(result.state).toMatchObject({energy:48,coins:2012,xp:18,skills:{miner:12}}); expect(result.state.inventory).toMatchObject({stone:57,iron:22}); });
  it('rejects Miner with insufficient Energy without consuming its key', () => { state.energy=11; expect(()=>executeJob(state,guard,'miner-low','miner')).toThrow('energy'); expect(guard.seen.has('miner-low')).toBe(false); });
  it('runs Farmer with exact costs and rewards', () => { const result=executeJob(state,guard,'farm-1','farmer'); expect(result.state).toMatchObject({energy:52,coins:2010,xp:10,skills:{farmer:12}}); expect(result.state.inventory.food).toBe(36); });
  it('prevents duplicate and concurrent job requests', async () => { const attempts=await Promise.allSettled([Promise.resolve().then(()=>executeJob(state,guard,'same','miner')),Promise.resolve().then(()=>executeJob(state,guard,'same','miner'))]); expect(attempts.filter((result)=>result.status==='fulfilled')).toHaveLength(1); expect(attempts.filter((result)=>result.status==='rejected')).toHaveLength(1); });
  it('uses one reference id for every ledger mutation', () => { const result=executeJob(state,guard,'ledger-ref','miner'); expect(result.ledger).toHaveLength(6); expect(new Set(result.ledger.map((row)=>row.referenceId))).toEqual(new Set(['ledger-ref'])); expect(result.ledger.find((row)=>row.resource==='energy')?.amount).toBe(-12); });
  it('calculates levels from cumulative server XP', () => { state.xp=95; expect(executeJob(state,guard,'level','farmer').state.level).toBe(2); });
});

describe('crafting and meal use', () => {
  it('crafts Planks exactly', () => { const result=craftAction(state,guard,'planks-1','planks'); expect(result.state.inventory).toMatchObject({wood:95,planks:2}); expect(result.state.coins).toBe(1995); });
  it('rejects Planks with insufficient Wood', () => { state.inventory.wood=4; expect(()=>craftAction(state,guard,'bad-wood','planks')).toThrow('wood'); });
  it('rejects crafting with insufficient Coins', () => { state.coins=4; expect(()=>craftAction(state,guard,'bad-coins','planks')).toThrow('coins'); });
  it('deducts exact Tool inputs', () => { const result=craftAction(state,guard,'tool-1','tool'); expect(result.state.inventory).toMatchObject({iron:17,wood:98,tools:1}); expect(result.state.coins).toBe(1985); });
  it('crafts one Meal', () => { const result=craftAction(state,guard,'meal-1','meal'); expect(result.state.inventory).toMatchObject({food:27,meals:3}); expect(result.state.coins).toBe(1995); });
  it('consumes one Meal and restores 20 Energy', () => { const result=useMeal(state,guard,'eat-1'); expect(result.state.energy).toBe(80); expect(result.state.inventory.meals).toBe(1); });
  it('caps Energy at maximum', () => { state.energy=91; const result=useMeal(state,guard,'eat-cap'); expect(result.state.energy).toBe(100); expect(result.ledger.find((row)=>row.resource==='energy')?.amount).toBe(9); });
  it('does not consume a Meal at full Energy', () => { state.energy=100; expect(()=>useMeal(state,guard,'eat-full')).toThrow('full'); expect(state.inventory.meals).toBe(2); expect(guard.seen.has('eat-full')).toBe(false); });
});

describe('Repair the Old Bridge', () => {
  it('consumes exact resources and grants exact rewards once', () => { const result=completeOldBridge(state,guard,'bridge-1'); expect(result.state.inventory).toMatchObject({wood:84,stone:36}); expect(result.state).toMatchObject({coins:2180,xp:40,founderPoints:15,orderCompleted:true}); expect(result.ledger.map((row)=>row.amount)).toEqual([-16,-14,180,40,15]); });
  it('cannot be completed twice and Founder Points grant once', () => { const first=completeOldBridge(state,guard,'bridge-first'); expect(()=>completeOldBridge(first.state,guard,'bridge-second')).toThrow('already completed'); expect(first.state.founderPoints).toBe(15); });
  it('survives a persistence reload without changing balances', () => { const saved=JSON.stringify(completeOldBridge(state,guard,'persist').state); const reloaded=JSON.parse(saved) as EconomySnapshot; expect(reloaded).toEqual(JSON.parse(saved)); expect(reloaded.orderCompleted).toBe(true); });
});

describe('Milestone 3 marketplace pricing', () => {
  it('prices initial supply at the base price',()=>{ expect(scarcityMultiplier(120,120)).toBe(1); expect(executionPrice('wood',120)).toBe(22); });
  it('bounds scarce and abundant markets',()=>{ expect(scarcityMultiplier(1,120)).toBe(1.5); expect(scarcityMultiplier(1000,120)).toBe(.7); expect(executionPrice('wood',1)).toBe(33); expect(executionPrice('wood',1000)).toBe(15); });
  it('rounds fees upward to whole Coins',()=>{ expect(marketplaceFee(22)).toBe(2); expect(marketplaceFee(100)).toBe(5); });
  it('validates integer quantities from 1 through 25',()=>{ expect(()=>validateMarketQuantity(1)).not.toThrow(); expect(()=>validateMarketQuantity(25)).not.toThrow(); for(const quantity of [-1,0,26,1.5]) expect(()=>validateMarketQuantity(quantity)).toThrow('between 1 and 25'); });
  it('buys using authoritative price, fee, and supply',()=>{ const result=buyFromMarket(state,guard,'buy-1','wood',5,120); expect(result).toMatchObject({unitPrice:22,gross:110,fee:6,net:116,marketSupply:115}); expect(result.state).toMatchObject({coins:1884,tradesCompleted:1,tradeQuestProgress:1,skills:{merchant:10}}); expect(result.state.inventory.wood).toBe(105); });
  it('rejects buys with insufficient Coins or market supply',()=>{ state.coins=1; expect(()=>buyFromMarket(state,guard,'poor','iron',1,60)).toThrow('coins'); state.coins=2000; expect(()=>buyFromMarket(state,guard,'empty','iron',2,1)).toThrow('market supply'); });
  it('sells inventory for gross minus rounded fee',()=>{ const result=sellToMarket(state,guard,'sell-1','food',10,180); expect(result).toMatchObject({unitPrice:16,gross:160,fee:8,net:152,marketSupply:190}); expect(result.state).toMatchObject({coins:2152,tradesCompleted:1,tradeQuestProgress:1,skills:{merchant:10}}); expect(result.state.inventory.food).toBe(20); });
  it('rejects sells with insufficient inventory',()=>{ expect(()=>sellToMarket(state,guard,'sell-too-many','iron',21,60)).toThrow('iron'); });
  it('completes trade quest progress after two successful transactions',()=>{ const first=sellToMarket(state,guard,'trade-1','wood',1,120); const second=sellToMarket(first.state,guard,'trade-2','stone',1,140); expect(second.state.tradeQuestProgress).toBe(2); expect(second.state.skills.merchant).toBe(20); });
  it('prevents duplicate and concurrent market actions',async()=>{ const attempts=await Promise.allSettled([Promise.resolve().then(()=>buyFromMarket(state,guard,'same-market','wood',1,120)),Promise.resolve().then(()=>buyFromMarket(state,guard,'same-market','wood',1,120))]); expect(attempts.filter((result)=>result.status==='fulfilled')).toHaveLength(1); });
  it('keeps one reference id and continuous Coin ledger balances',()=>{ const result=buyFromMarket(state,guard,'market-ledger','wood',1,120); expect(new Set(result.ledger.map((row)=>row.referenceId))).toEqual(new Set(['market-ledger'])); const coinRows=result.ledger.filter((row)=>row.resource==='coins'); expect(coinRows[0]?.balanceAfter).toBe(coinRows[1]?.balanceBefore); });
});

describe('Milestone 3 property and storage',()=>{
  it('calculates every inventory unit as one storage unit',()=>{ expect(storageUsed({wood:20,stone:10,iron:5,food:5,planks:2,meals:1,tools:1})).toBe(44); });
  it('allows exact capacity and rejects overflow',()=>{ const inventory={wood:20,stone:10,iron:5,food:5,planks:5,meals:3,tools:2}; expect(()=>validateStorageCapacity(inventory,50)).not.toThrow(); expect(()=>validateStorageCapacity({...inventory,tools:3},50)).toThrow('Storage'); });
  it('upgrades Level 1 to 2 with exact permanent costs',()=>{ const result=upgradePropertyAction(state,guard,'house',2); expect(result.state).toMatchObject({propertyLevel:2,storageCapacity:100,businessSlots:1,coins:1500}); expect(result.state.inventory).toMatchObject({wood:60,stone:25}); });
  it('upgrades Level 2 to 3 with exact costs',()=>{ state.propertyLevel=2; state.storageCapacity=100; const result=upgradePropertyAction(state,guard,'workshop-home',3); expect(result.state).toMatchObject({propertyLevel:3,storageCapacity:180,businessSlots:2,coins:800}); expect(result.state.inventory).toMatchObject({wood:70,stone:25,iron:12}); });
  it('rejects insufficient costs, level skipping, and duplicate submission',()=>{ state.inventory.stone=24; expect(()=>upgradePropertyAction(state,guard,'short',2)).toThrow('stone'); state.inventory.stone=50; expect(()=>upgradePropertyAction(state,guard,'skip',3)).toThrow('exactly one'); upgradePropertyAction(state,guard,'duplicate',2); expect(()=>upgradePropertyAction(state,guard,'duplicate',2)).toThrow('Duplicate'); });
  it('blocks jobs, crafting, and market buys that overflow storage',()=>{ state.inventory={wood:49,stone:0,iron:0,food:0,planks:0,meals:0,tools:0}; state.storageCapacity=50; expect(()=>executeJob(state,guard,'job-full','lumberjack')).toThrow('Storage'); state.inventory={wood:5,stone:0,iron:0,food:0,planks:45,meals:0,tools:0}; expect(()=>craftAction(state,guard,'craft-exact','planks')).not.toThrow(); state.inventory={wood:50,stone:0,iron:0,food:0,planks:0,meals:0,tools:0}; expect(()=>buyFromMarket(state,guard,'buy-full','wood',1,120)).toThrow('Storage'); });
});

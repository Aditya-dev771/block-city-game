import { create } from 'zustand';
import type { BusinessRecipeId, BusinessType, JobType, LocationId, MarketResourceId, PlayerGameState, RecipeId } from '../types/game';
import { loadPlayerState, performGameAction, saveLocation } from '../services/gameApi';
import { gameErrorMessage } from '../services/errorMessages';

interface GameStore {
  player: PlayerGameState | null;
  loading: boolean;
  actionPending: boolean;
  error: string | null;
  notice: string | null;
  lastMarketExecution: string | null;
  panel: 'world' | 'bag' | 'crafting' | 'market' | 'property' | 'businesses' | 'quests' | 'profile';
  load: () => Promise<void>;
  setPanel: (panel: GameStore['panel']) => void;
  arriveAt: (location: LocationId) => Promise<void>;
  executeJob: (jobType: JobType) => Promise<void>;
  craftItem: (recipeId: RecipeId) => Promise<void>;
  useMeal: () => Promise<void>;
  completeOrder: (orderId?:string) => Promise<void>;
  tradeMarket: (side: 'buy' | 'sell', resourceId: MarketResourceId, quantity: number) => Promise<void>;
  upgradeProperty: (targetLevel: 2 | 3) => Promise<void>;
  fundPropertyUpgrade: (targetLevel: 2 | 3) => Promise<void>;
  openBusiness: (businessType: BusinessType) => Promise<void>;
  assignBusiness: (residentId: string, businessId: string) => Promise<void>;
  unassignBusiness: (residentId: string, businessId: string) => Promise<void>;
  startProduction: (businessId: string, recipeId: BusinessRecipeId) => Promise<void>;
  claimProduction: (productionId: string) => Promise<void>;
  claimDailyQuest:(questId:string)=>Promise<void>;
  claimWeeklyStreak:()=>Promise<void>;
  claimAchievement:(achievementId:string)=>Promise<void>;
  dismissMessage: () => void;
  clear: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  player: null, loading: false, actionPending: false, error: null, notice: null, lastMarketExecution: null, panel: 'world',
  load: async () => {
    set({ loading: true, error: null });
    try { set({ player: await loadPlayerState(), loading: false }); }
    catch (error) { set({ error: error instanceof Error ? error.message : 'Could not load your town.', loading: false }); }
  },
  setPanel: (panel) => set({ panel }),
  arriveAt: async (location) => {
    const prior = get().player;
    if (!prior) return;
    const nextPanel = location === 'town-hall' ? 'quests' : location === 'workshop' ? 'crafting' : location === 'market' ? 'market' : location === 'home' ? 'property' : 'world';
    set({ player: { ...prior, resident: { ...prior.resident, currentLocation: location } }, panel: nextPanel });
    try { await saveLocation(location); }
    catch { set({ player: prior, panel: 'world', error: 'Location could not be saved.' }); }
  },
  executeJob: async (jobType) => runAction(set, get, { action: 'execute_job', jobType }),
  craftItem: async (recipeId) => runAction(set, get, { action: 'craft_item', recipeId }),
  useMeal: async () => runAction(set, get, { action: 'use_meal' }),
  completeOrder: async (orderId='repair_old_bridge') => runAction(set, get, { action: 'complete_order', orderId }),
  tradeMarket: async (side, resourceId, quantity) => runAction(set, get, { action: side === 'buy' ? 'market_buy' : 'market_sell', resourceId, quantity }),
  upgradeProperty: async (targetLevel) => runAction(set, get, { action: 'upgrade_property', targetLevel }),
  fundPropertyUpgrade: async (targetLevel) => runAction(set, get, { action: 'fund_property_upgrade', targetLevel }),
  openBusiness: async (businessType) => runAction(set,get,{action:'open_business',businessType}),
  assignBusiness: async (residentId,businessId) => runAction(set,get,{action:'assign_resident_to_business',residentId,businessId}),
  unassignBusiness: async (residentId,businessId) => runAction(set,get,{action:'unassign_resident_from_business',residentId,businessId}),
  startProduction: async (businessId,recipeId) => runAction(set,get,{action:'start_business_production',businessId,recipeId}),
  claimProduction: async (productionId) => runAction(set,get,{action:'claim_business_production',productionId}),
  claimDailyQuest:async(questId)=>runAction(set,get,{action:'claim_daily_quest',questId}),
  claimWeeklyStreak:async()=>runAction(set,get,{action:'claim_weekly_streak'}),
  claimAchievement:async(achievementId)=>runAction(set,get,{action:'claim_achievement',achievementId}),
  dismissMessage: () => set({ error: null, notice: null }),
  clear: () => set({ player: null, panel: 'world', error: null, notice: null, lastMarketExecution: null })
}));

type StoreSet = (partial: Partial<GameStore>) => void;
type StoreGet = () => GameStore;
type Intent = Parameters<typeof performGameAction>[0];

async function runAction(set: StoreSet, get: StoreGet, intent: Intent): Promise<void> {
    if (get().actionPending) return;
    set({ actionPending: true, error: null, notice: null });
    try {
      const result = await performGameAction(intent, crypto.randomUUID());
      const execution = result.execution ? `${result.execution.side === 'buy' ? 'Bought' : 'Sold'} ${result.execution.quantity} ${result.execution.resource} at ${result.execution.unitPrice} Coins each · Fee ${result.execution.fee}` : null;
      set({ player: result.state, notice: execution ?? result.message, lastMarketExecution: execution, actionPending: false });
    } catch (error) {
      const message = gameErrorMessage(error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      try { set({ player: await loadPlayerState(), error: message, actionPending: false }); }
      catch { set({ error: `${message} State refresh failed; reconnect before trying again.`, actionPending: false }); }
    }
}

import { create } from 'zustand';
import type { BusinessRecipeId, BusinessType, JobType, LocationId, MarketResourceId, PlayerGameState, RecipeId } from '../types/game';
import { loadPlayerState, performGameAction, saveLocation } from '../services/gameApi';
import { gameErrorMessage } from '../services/errorMessages';
import { logClientError, recordAlphaCohortEvent } from '../services/alphaOps';
import { GUEST_PLAYER_STATE } from '../config/guestState';
import { loadCitizenAccess, type CitizenAccess } from '../services/walletAuth';

interface GameStore {
  player: PlayerGameState | null;
  authenticated: boolean;
  accessState: CitizenAccess['state'];
  walletAddress: string | null;
  accessMessage: string | null;
  authRequest: 'prompt' | 'wallet' | 'legacy' | null;
  loading: boolean;
  actionPending: boolean;
  error: string | null;
  notice: string | null;
  lastMarketExecution: string | null;
  panel: 'world' | 'bag' | 'crafting' | 'market' | 'property' | 'businesses' | 'quests' | 'profile';
  load: () => Promise<void>;
  requestAuth: (mode?: 'prompt' | 'wallet' | 'legacy') => void;
  dismissAuth: () => void;
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
  player: GUEST_PLAYER_STATE, authenticated: false, accessState:'explorer', walletAddress:null, accessMessage:null, authRequest: null, loading: false, actionPending: false, error: null, notice: null, lastMarketExecution: null, panel: 'world',
  load: async () => {
    set({ loading: true, error: null });
    try {
      const access=await loadCitizenAccess();
      if(!access.eligible){set({player:GUEST_PLAYER_STATE,authenticated:false,accessState:access.state,walletAddress:access.walletAddress,accessMessage:access.message,authRequest:null,loading:false});return;}
      const player = await loadPlayerState();
      set({ player, authenticated: true, accessState:'citizen',walletAddress:access.walletAddress,accessMessage:access.message, authRequest: null, loading: false });

      quietly(recordAlphaCohortEvent('ACTIVE'));
      if (player.resident.jobsCompleted > 0) quietly(recordAlphaCohortEvent('FIRST_JOB'));
      if (player.resident.tradesCompleted > 0) quietly(recordAlphaCohortEvent('REACHED_MARKET'));
      if (player.property.level >= 2) quietly(recordAlphaCohortEvent('PROPERTY_LEVEL_2'));
      if (player.businesses.length > 0) quietly(recordAlphaCohortEvent('OPENED_BUSINESS'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load your town.';
      quietly(logClientError({ errorCode: 'LOAD_STATE_FAILED', context: { message } }));
      set({ player:GUEST_PLAYER_STATE,authenticated:false,accessState:'unavailable',accessMessage:message,authRequest:null,error: message, loading: false });
    }
  },
  requestAuth: (authRequest='prompt') => set({ authRequest }),
  dismissAuth: () => set({ authRequest: null }),
  setPanel: (panel) => set({ panel }),
  arriveAt: async (location) => {
    const prior = get().player;
    if (!prior) return;
    const nextPanel = location === 'town-hall' ? 'quests' : location === 'workshop' ? 'crafting' : location === 'market' ? 'market' : location === 'home' ? 'property' : 'world';
    set({ player: { ...prior, resident: { ...prior.resident, currentLocation: location } }, panel: nextPanel });
    if (!get().authenticated) return;
    try { await saveLocation(location); }
    catch {
      quietly(logClientError({
        errorCode: 'LOCATION_SAVE_FAILED',
        actionType: 'set_current_location',
        context: { location }
      }));
      set({ player: prior, panel: 'world', error: 'Location could not be saved.' });
    }
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
  clear: () => set({ player: GUEST_PLAYER_STATE, authenticated: false, accessState:'explorer',walletAddress:null,accessMessage:null,authRequest: null, panel: 'world', error: null, notice: null, lastMarketExecution: null })
}));

type StoreSet = (partial: Partial<GameStore>) => void;
type StoreGet = () => GameStore;
type Intent = Parameters<typeof performGameAction>[0];
const quietly = (promise: Promise<unknown>) => { void promise.catch(() => undefined); };

async function runAction(set: StoreSet, get: StoreGet, intent: Intent): Promise<void> {
    if (!get().authenticated) { set({ authRequest: 'prompt' }); return; }
    if (get().actionPending) return;
    set({ actionPending: true, error: null, notice: null });
    try {
      const result = await performGameAction(intent, crypto.randomUUID());
      const execution = result.execution ? `${result.execution.side === 'buy' ? 'Bought' : 'Sold'} ${result.execution.quantity} ${result.execution.resource} at ${result.execution.unitPrice} Coins each · Fee ${result.execution.fee}` : null;
      set({ player: result.state, notice: execution ?? result.message, lastMarketExecution: execution, actionPending: false });
      if (intent.action === 'execute_job') quietly(recordAlphaCohortEvent('FIRST_JOB'));
      if (intent.action === 'market_buy' || intent.action === 'market_sell') quietly(recordAlphaCohortEvent('REACHED_MARKET'));
      if (intent.action === 'upgrade_property') quietly(recordAlphaCohortEvent('PROPERTY_LEVEL_2'));
      if (intent.action === 'open_business') quietly(recordAlphaCohortEvent('OPENED_BUSINESS'));
    } catch (error) {
      const message = gameErrorMessage(error instanceof Error ? error.message : 'UNKNOWN_ERROR');
      quietly(logClientError({
        errorCode: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        actionType: intent.action,
        context: { mappedMessage: message }
      }));
      try { set({ player: await loadPlayerState(), error: message, actionPending: false }); }
      catch { set({ error: `${message} State refresh failed; reconnect before trying again.`, actionPending: false }); }
    }
}

export type LocationId = 'town-square' | 'forest' | 'mine' | 'farm' | 'town-hall' | 'home' | 'market' | 'workshop' | 'industrial';
export type ResourceKey = 'wood' | 'stone' | 'iron' | 'food' | 'planks' | 'meals' | 'tools' | 'constructionCrates';
export type SkillKey = 'lumberjack' | 'miner' | 'farmer' | 'builder' | 'merchant' | 'chef' | 'engineer';
export type JobType = 'lumberjack' | 'miner' | 'farmer';
export type RecipeId = 'planks' | 'meal' | 'tool';
export type BusinessType = 'general_store' | 'restaurant' | 'workshop';
export type BusinessRecipeId = 'general_store_sales' | 'restaurant_meals' | 'workshop_tools';
export type ResidentWorkState = 'IDLE' | 'TRAVELING' | 'WORKING_JOB' | 'ASSIGNED_BUSINESS' | 'PRODUCING';
export type ProductionState = 'RUNNING' | 'READY' | 'CLAIMED';
export type GameActionName = 'execute_job' | 'craft_item' | 'use_meal' | 'complete_order' | 'market_buy' | 'market_sell' | 'upgrade_property' | 'fund_property_upgrade' | 'open_business' | 'assign_resident_to_business' | 'unassign_resident_from_business' | 'start_business_production' | 'claim_business_production';
export type DailyQuestId = 'daily-jobs-3'|'daily-order-1'|'daily-trades-2'|'daily-business-1';
export interface DailyQuestState { id:DailyQuestId; title:string; progress:number; target:number; founderPoints:number; completed:boolean; claimed:boolean }
export interface AchievementState { id:string; title:string; founderPoints:number; eligible:boolean; claimed:boolean }
export interface FounderPointEntry { id:string; amount:number; reason:string; createdAt:string }
export type MarketResourceId = 'wood' | 'stone' | 'iron' | 'food';
export type MarketSide = 'buy' | 'sell';

export interface MarketResource {
  resourceId: MarketResourceId;
  basePrice: number;
  currentPrice: number;
  currentSupply: number;
  initialSupply: number;
  minMultiplier: number;
  maxMultiplier: number;
}

export interface MarketTransaction {
  id: string;
  side: MarketSide;
  resource: MarketResourceId;
  quantity: number;
  unitPrice: number;
  gross: number;
  fee: number;
  net: number;
  createdAt: string;
}

export interface MarketExecution { side: MarketSide; resource: MarketResourceId; quantity: number; unitPrice: number; gross: number; fee: number; net: number }
export interface BusinessProduction { id: string; businessId: string; recipeId: BusinessRecipeId; state: ProductionState; startedAt: string; readyAt: string; claimedAt: string | null; reservedStorage: number }
export interface PlayerBusiness { id: string; type: BusinessType; status: 'ACTIVE' | 'INACTIVE'; assignedResidentId: string | null; openedAt: string; production: BusinessProduction | null }

export interface PlayerGameState {
  playerId: string;
  account: { username: string; createdAt: string };
  resident: { id: string; level: number; xp: number; energy: number; maxEnergy: number; currentLocation: LocationId; jobsCompleted: number; ordersCompleted: number; tradesCompleted: number; workState: ResidentWorkState; assignedBusinessId: string | null; activeProductionId: string | null };
  skills: Record<SkillKey, number>;
  economy: { coins: number };
  inventory: Record<ResourceKey, number>;
  property: { level: number; storageCapacity: number; storageUsed: number; reservedProductionStorage: number; effectiveStorageUsed: number; residentCapacity: number; businessSlots: number; businessSlotsUsed: number; upgradeProgress: { targetLevel: number | null; wood: number; stone: number; iron: number } };
  businesses: PlayerBusiness[];
  season: { seasonId: string; founderPoints: number; streak: number; longestStreak:number; lastActiveQuestDate:string|null; weeklyCycle:number; weeklyRewardClaimed:boolean; achievements: AchievementState[]; founderSeals: number; rank: string; nextRank:string|null; nextRankAt:number|null; dailyQuests:DailyQuestState[]; recentFounderPoints:FounderPointEntry[] };
  orders: { repairOldBridge: boolean; active:Array<{id:string;title:string;requirements:Record<string,number>;rewards:{coins:number;xp:number};completed:boolean;npc:string}> };
  market: { resources: MarketResource[]; recentTransactions: MarketTransaction[] };
  productionHistory: Array<{id:string;businessType:BusinessType;recipeId:BusinessRecipeId;startedAt:string;readyAt:string;claimedAt:string|null}>;
  economyVersion:number;
}

export interface ActionResult { state: PlayerGameState; message: string; transactionId?: string; execution?: MarketExecution }

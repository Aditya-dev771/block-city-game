import { ECONOMY } from './economy';
import type { MarketResourceId, PlayerGameState, ResourceKey, SkillKey } from '../types/game';

const inventory = Object.fromEntries(['wood','stone','iron','food','planks','meals','tools','constructionCrates'].map((resource)=>[resource,0])) as Record<ResourceKey,number>;
const skills = Object.fromEntries(['lumberjack','miner','farmer','builder','merchant','chef','engineer'].map((skill)=>[skill,0])) as Record<SkillKey,number>;
const marketResources = (Object.keys(ECONOMY.market.resources) as MarketResourceId[]).map((resourceId)=>({
  resourceId,
  basePrice:ECONOMY.market.resources[resourceId].basePrice,
  currentPrice:ECONOMY.market.resources[resourceId].basePrice,
  currentSupply:ECONOMY.market.resources[resourceId].initialSupply,
  initialSupply:ECONOMY.market.resources[resourceId].initialSupply,
  minMultiplier:ECONOMY.market.minMultiplier,
  maxMultiplier:ECONOMY.market.maxMultiplier
}));

export const GUEST_PLAYER_STATE: PlayerGameState = {
  playerId:'guest',account:{username:'Guest',createdAt:''},resident:{id:'guest',level:0,xp:0,energy:0,maxEnergy:0,currentLocation:'town-square',jobsCompleted:0,ordersCompleted:0,tradesCompleted:0,workState:'IDLE',assignedBusinessId:null,activeProductionId:null},
  skills,economy:{coins:0},inventory,property:{level:1,storageCapacity:0,storageUsed:0,reservedProductionStorage:0,effectiveStorageUsed:0,residentCapacity:0,businessSlots:0,businessSlotsUsed:0,upgradeProgress:{targetLevel:null,wood:0,stone:0,iron:0}},businesses:[],
  season:{seasonId:'season-0',founderPoints:0,streak:0,longestStreak:0,lastActiveQuestDate:null,weeklyCycle:0,weeklyRewardClaimed:false,achievements:[],founderSeals:0,rank:'Guest',nextRank:'Settler',nextRankAt:0,dailyQuests:[],recentFounderPoints:[]},
  orders:{repairOldBridge:false,active:[{id:'repair_old_bridge',title:ECONOMY.orders.repair_old_bridge.name,npc:ECONOMY.orders.repair_old_bridge.npc,requirements:ECONOMY.orders.repair_old_bridge.requirements,rewards:{coins:ECONOMY.orders.repair_old_bridge.rewards.coins,xp:ECONOMY.orders.repair_old_bridge.rewards.xp},completed:false}]},
  market:{resources:marketResources,recentTransactions:[]},productionHistory:[],economyVersion:ECONOMY.version
};

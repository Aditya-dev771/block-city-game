import type { ResourceKey, SkillKey } from '../types/game';

export const ECONOMY = {
  version: 1,
  starter: { coins: 500, energy: 100, propertyLevel: 1, residentLevel: 1, founderPoints: 0 },
  jobs: {
    lumberjack: { energy: 10, rewards: { wood: 8, coins: 14, xp: 12, professionXp: 12 }, skill: 'lumberjack' as SkillKey },
    miner: { energy: 12, rewards: { stone: 7, iron: 2, coins: 12, xp: 18, professionXp: 12 }, skill: 'miner' as SkillKey },
    farmer: { energy: 8, rewards: { food: 6, coins: 10, xp: 10, professionXp: 12 }, skill: 'farmer' as SkillKey }
  },
  recipes: {
    planks: { cost: { wood: 5, coins: 5 }, output: { planks: 2 } },
    meal: { cost: { food: 3, coins: 5 }, output: { meals: 1 } },
    tool: { cost: { iron: 3, wood: 2, coins: 15 }, output: { tools: 1 } }
  },
  orders: {
    repair_old_bridge: { name: 'Repair the Old Bridge', npc:'Builder', requirements: { wood: 16, stone: 14 }, rewards: { coins: 180, xp: 40, founderPoints: 15 } },
    feed_workers: { name:'Feed the Workers',npc:'Chef',requirements:{food:12},rewards:{coins:120,xp:20} },
    workshop_repairs: { name:'Workshop Repairs',npc:'Foreman',requirements:{wood:8,iron:4},rewards:{coins:170,xp:25} },
    road_reinforcement: { name:'Road Reinforcement',npc:'Builder',requirements:{stone:10,wood:5},rewards:{coins:150,xp:22} },
    tool_delivery: { name:'Tool Delivery',npc:'Merchant',requirements:{tools:2},rewards:{coins:260,xp:35} }
  },
  xpPerLevel: 100,
  mealEnergyRestore: 20,
  market: {
    feeRate: 0.05,
    minMultiplier: 0.7,
    maxMultiplier: 1.5,
    minQuantity: 1,
    maxQuantity: 25,
    merchantXpPerTrade: 10,
    resources: {
      wood: { basePrice: 22, initialSupply: 120 },
      stone: { basePrice: 18, initialSupply: 140 },
      iron: { basePrice: 48, initialSupply: 60 },
      food: { basePrice: 16, initialSupply: 180 }
    },
    prices: { wood: 22, stone: 18, iron: 48, food: 16 } satisfies Partial<Record<ResourceKey, number>>
  },
  property: {
    1: { name: 'Starter Home', storageCapacity: 50, residentCapacity: 1, businessSlots: 0 },
    2: { name: 'House', cost: { coins: 500, wood: 40, stone: 25 }, storageCapacity: 100, residentCapacity: 3, businessSlots: 1 },
    3: { name: 'Workshop Home', cost: { coins: 1200, wood: 30, stone: 25, iron: 8 }, storageCapacity: 180, residentCapacity: 5, businessSlots: 2 }
  },
  businesses: {
    general_store: { name: 'General Store', openingCost: 600, requiredPropertyLevel: 2, recipeId: 'general_store_sales', durationSeconds: 900, input: { wood: 3, food: 2 }, output: { coins: 75 }, outputStorage: 0, taxRate: 0.05, profession: 'merchant', professionXp: 12, generalXp: 10 },
    restaurant: { name: 'Restaurant', openingCost: 700, requiredPropertyLevel: 2, recipeId: 'restaurant_meals', durationSeconds: 1200, input: { food: 4 }, output: { meals: 2 }, outputStorage: 2, taxRate: 0, profession: 'chef', professionXp: 12, generalXp: 12 },
    workshop: { name: 'Workshop', openingCost: 900, requiredPropertyLevel: 2, recipeId: 'workshop_tools', durationSeconds: 1800, input: { wood: 4, iron: 2 }, output: { tools: 1 }, outputStorage: 1, taxRate: 0, profession: 'engineer', professionXp: 12, generalXp: 15 }
  },
  businessQuest: { id: 'daily-business-1', target: 1, founderPoints: 10 },
  founderRanks: [{ min: 3000, rank: 'Guaranteed' }, { min: 2000, rank: 'Priority' }, { min: 1200, rank: 'Whitelist' }, { min: 500, rank: 'Citizen' }, { min: 0, rank: 'Settler' }],
  professionThresholds: [{ min: 400, title: 'Master', bonus: 0.1 }, { min: 150, title: 'Specialist', bonus: 0.05 }, { min: 50, title: 'Apprentice', bonus: 0.02 }, { min: 0, title: 'Novice', bonus: 0 }],
  dailyFounderPointCap: 45
} as const;

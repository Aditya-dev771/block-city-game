import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};
const JOBS = new Set(['lumberjack', 'miner', 'farmer']);
const RECIPES = new Set(['planks', 'meal', 'tool']);
const MARKET_RESOURCES = new Set(['wood', 'stone', 'iron', 'food']);
const BUSINESS_TYPES = new Set(['general_store','restaurant','workshop']);
const BUSINESS_RECIPES = new Set(['general_store_sales','restaurant_meals','workshop_tools']);

interface ActionBody {
  action?: 'execute_job' | 'craft_item' | 'use_meal' | 'complete_order' | 'market_buy' | 'market_sell' | 'upgrade_property' | 'fund_property_upgrade' | 'open_business' | 'assign_resident_to_business' | 'unassign_resident_from_business' | 'start_business_production' | 'claim_business_production' | 'claim_daily_quest' | 'claim_weekly_streak' | 'claim_achievement';
  idempotencyKey?: string;
  jobType?: string;
  recipeId?: string;
  orderId?: string;
  resourceId?: string;
  quantity?: number;
  targetLevel?: number;
  businessType?: string;
  residentId?: string;
  businessId?: string;
  productionId?: string;
  questId?:string;
  achievementId?:string;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  try {
    const auth = request.headers.get('Authorization');
    if (!auth) return response({ error: 'Authentication required' }, 401);
    const body: ActionBody = await request.json();
    if (!body.idempotencyKey || !isUuid(body.idempotencyKey)) return response({ error: 'A valid idempotency key is required' }, 400);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    let result: { data: unknown; error: { message: string } | null };
    switch (body.action) {
      case 'execute_job':
        if (!body.jobType || !JOBS.has(body.jobType)) return response({ error: 'Unsupported job type' }, 400);
        result = await client.rpc('execute_job', { requested_job: body.jobType, request_key: body.idempotencyKey });
        break;
      case 'craft_item':
        if (!body.recipeId || !RECIPES.has(body.recipeId)) return response({ error: 'Unsupported recipe' }, 400);
        result = await client.rpc('craft_item', { requested_recipe: body.recipeId, request_key: body.idempotencyKey });
        break;
      case 'use_meal':
        result = await client.rpc('use_meal', { request_key: body.idempotencyKey });
        break;
      case 'complete_order':
        if (!body.orderId || !['repair_old_bridge','feed_workers','workshop_repairs','road_reinforcement','tool_delivery'].includes(body.orderId)) return response({ error: 'Unsupported order' }, 400);
        result = await client.rpc('complete_npc_order', { requested_order: body.orderId, request_key: body.idempotencyKey });
        break;
      case 'market_buy':
      case 'market_sell':
        if (!body.resourceId || !MARKET_RESOURCES.has(body.resourceId)) return response({ error: 'Unsupported market resource' }, 400);
        if (!Number.isSafeInteger(body.quantity) || (body.quantity ?? 0) < 1 || (body.quantity ?? 0) > 25) return response({ error: 'Quantity must be between 1 and 25' }, 400);
        result = await client.rpc('market_trade', { trade_side: body.action, requested_resource: body.resourceId, requested_quantity: body.quantity, request_key: body.idempotencyKey });
        break;
      case 'upgrade_property':
        if (body.targetLevel !== 2 && body.targetLevel !== 3) return response({ error: 'Unsupported property level' }, 400);
        result = await client.rpc('upgrade_property', { target_level: body.targetLevel, request_key: body.idempotencyKey });
        break;
      case 'fund_property_upgrade':
        if (body.targetLevel !== 2 && body.targetLevel !== 3) return response({ error: 'Unsupported property level' }, 400);
        result = await client.rpc('fund_property_upgrade', { target_level: body.targetLevel, request_key: body.idempotencyKey });
        break;
      case 'open_business':
        if(!body.businessType||!BUSINESS_TYPES.has(body.businessType)) return response({error:'Unsupported business type'},400);
        result=await client.rpc('open_business',{requested_business_type:body.businessType,request_key:body.idempotencyKey}); break;
      case 'assign_resident_to_business':
      case 'unassign_resident_from_business':
        if(!body.residentId||!isUuid(body.residentId)||!body.businessId||!isUuid(body.businessId)) return response({error:'Valid resident and business IDs are required'},400);
        result=await client.rpc(body.action,{requested_resident:body.residentId,requested_business:body.businessId,request_key:body.idempotencyKey}); break;
      case 'start_business_production':
        if(!body.businessId||!isUuid(body.businessId)||!body.recipeId||!BUSINESS_RECIPES.has(body.recipeId)) return response({error:'Valid business and recipe are required'},400);
        result=await client.rpc('start_business_production',{requested_business:body.businessId,requested_recipe:body.recipeId,request_key:body.idempotencyKey}); break;
      case 'claim_business_production':
        if(!body.productionId||!isUuid(body.productionId)) return response({error:'Valid production ID is required'},400);
        result=await client.rpc('claim_business_production',{requested_production:body.productionId,request_key:body.idempotencyKey}); break;
      case 'claim_daily_quest':
        if(!body.questId) return response({error:'Quest ID required'},400); result=await client.rpc('claim_daily_quest',{requested_quest:body.questId,request_key:body.idempotencyKey}); break;
      case 'claim_weekly_streak': result=await client.rpc('claim_weekly_streak',{request_key:body.idempotencyKey}); break;
      case 'claim_achievement':
        if(!body.achievementId) return response({error:'Achievement ID required'},400); result=await client.rpc('claim_achievement',{requested_achievement:body.achievementId,request_key:body.idempotencyKey}); break;
      default:
        return response({ error: 'Unsupported action' }, 400);
    }
    if (result.error) return response({ error: result.error.message }, 400);
    return response(result.data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    return response({ error: message }, 400);
  }
});

function response(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers }); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractVerifiedEthereumIdentity, verifyCitizenEligibility } from '../_shared/citizenEligibility.ts';

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
  action?: 'get_citizen_access' | 'execute_job' | 'craft_item' | 'use_meal' | 'complete_order' | 'market_buy' | 'market_sell' | 'upgrade_property' | 'fund_property_upgrade' | 'open_business' | 'assign_resident_to_business' | 'unassign_resident_from_business' | 'start_business_production' | 'claim_business_production' | 'claim_daily_quest' | 'claim_weekly_streak' | 'claim_achievement';
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) return response({ error: 'Authentication required' }, 401);
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) return response({ error: 'Citizen authorization is unavailable' }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const wallet = extractVerifiedEthereumIdentity(userData.user.identities);
    const legacyEnabled = Deno.env.get('ALLOW_LEGACY_ALPHA_TESTERS') === 'true';
    let legacyAccess = false;
    if (!wallet && legacyEnabled && userData.user.email) {
      const legacy = await admin.from('alpha_invites').select('registered_player_id').eq('registered_player_id', userData.user.id).maybeSingle();
      legacyAccess = !legacy.error && Boolean(legacy.data);
    }
    if (!wallet && !legacyAccess) return response({ error: 'An authenticated Ethereum wallet is required' }, 403);
    if (wallet) {
      const mapping = await admin.from('wallet_identities').select('wallet_address,chain_id').eq('user_id', userData.user.id).maybeSingle();
      if (mapping.error || !mapping.data || mapping.data.wallet_address !== wallet.address || mapping.data.chain_id !== wallet.chainId) {
        return response({ error: 'Authenticated wallet does not match the player identity' }, 403);
      }
    }
    const eligibility = wallet ? await verifyCitizenEligibility({
      wallet, rpcUrl: Deno.env.get('ROBINHOOD_RPC_URL'), contractAddress: Deno.env.get('CITIZEN_NFT_CONTRACT'),
      contractStandard: Deno.env.get('CITIZEN_NFT_STANDARD'), configuredChainId: Deno.env.get('CITIZEN_NFT_CHAIN_ID'),
      cacheTtlMs: Number(Deno.env.get('CITIZEN_ELIGIBILITY_CACHE_TTL_SECONDS') ?? '60') * 1000
    }) : { status:'eligible' as const, eligible:true, balance:0, checkedAt:new Date().toISOString(), message:'Legacy Private Alpha tester access is active.' };
    if (eligibility.eligible) {
      const ttlSeconds = Math.min(300, Math.max(15, Number(Deno.env.get('CITIZEN_ELIGIBILITY_CACHE_TTL_SECONDS') ?? '60')));
      const { error: grantError } = await admin.from('citizen_access_grants').upsert({
        user_id: userData.user.id, access_source:legacyAccess?'legacy_alpha':'nft',wallet_address: wallet?.address??null, chain_id: wallet?.chainId??null,
        contract_address: wallet?Deno.env.get('CITIZEN_NFT_CONTRACT')!.toLowerCase():null, nft_balance: eligibility.balance,
        verified_at: eligibility.checkedAt, expires_at: new Date(Date.parse(eligibility.checkedAt) + ttlSeconds * 1000).toISOString()
      });
      if (grantError) return response({ error: 'Citizen authorization is unavailable' }, 503);
    } else {
      await admin.from('citizen_access_grants').delete().eq('user_id', userData.user.id);
    }
    const access = {
      state: eligibility.status === 'eligible' ? 'citizen' : eligibility.status,
      walletAddress: wallet?.address??null,
      eligible: eligibility.eligible,
      balance: eligibility.balance,
      checkedAt: eligibility.checkedAt,
      message: eligibility.message
    };
    if (body.action === 'get_citizen_access') return response(access, 200);
    if (!eligibility.eligible) {
      const status = eligibility.status === 'unavailable' ? 503 : 403;
      return response({ error: eligibility.message, code: `CITIZEN_${eligibility.status.toUpperCase()}` }, status);
    }
    if (!body.idempotencyKey || !isUuid(body.idempotencyKey)) return response({ error: 'A valid idempotency key is required' }, 400);
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

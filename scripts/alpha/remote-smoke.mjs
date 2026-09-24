import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const url=process.env.ALPHA_SUPABASE_URL;
const anonKey=process.env.ALPHA_SUPABASE_ANON_KEY;
const serviceKey=process.env.ALPHA_SUPABASE_SERVICE_ROLE_KEY;
assert(url&&anonKey&&serviceKey,'ALPHA_SUPABASE_URL, ALPHA_SUPABASE_ANON_KEY, and ALPHA_SUPABASE_SERVICE_ROLE_KEY are required');

class DisabledRealtimeWebSocket{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(){throw new Error('Realtime disabled for alpha smoke');}}
const clientOptions={auth:{persistSession:false},realtime:{transport:DisabledRealtimeWebSocket}};
const admin=createClient(url,serviceKey,clientOptions);
const password=`Alpha-smoke-${crypto.randomUUID()}!1`;

async function invitedPlayer(label){
  const email=`${label}-${crypto.randomUUID()}@alpha-smoke.example`.toLowerCase();
  await admin.from('alpha_invites').upsert({email,label:'remote smoke',active:true}).throwOnError();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:label}});
  assert.ifError(created.error);
  const client=createClient(url,anonKey,clientOptions);
  const login=await client.auth.signInWithPassword({email,password});
  assert.ifError(login.error);
  return {id:created.data.user.id,email,client,token:login.data.session.access_token};
}

async function edge(token,body){
  const response=await fetch(`${url}/functions/v1/game-action`,{method:'POST',headers:{authorization:`Bearer ${token}`,apikey:anonKey,'content-type':'application/json'},body:JSON.stringify(body)});
  const json=await response.json().catch(()=>({}));
  return {response,json};
}

async function action(player,body){
  const result=await edge(player.token,{...body,idempotencyKey:crypto.randomUUID()});
  assert.equal(result.response.ok,true,`${body.action} failed: ${JSON.stringify(result.json)}`);
  return result.json;
}

async function setResource(playerId,resource,amount){
  await admin.from('player_resources').update({amount}).eq('player_id',playerId).eq('resource',resource).throwOnError();
}

async function assertStorageWithinCapacity(playerId,label){
  const resources=await admin.from('player_resources').select('amount').eq('player_id',playerId);
  assert.ifError(resources.error);
  const property=await admin.from('properties').select('storage_capacity').eq('player_id',playerId).single();
  assert.ifError(property.error);
  const used=resources.data.reduce((total,row)=>total+row.amount,0);
  assert(used<=property.data.storage_capacity,`${label} exceeds storage: ${used}/${property.data.storage_capacity}`);
}

async function ensureDailyOrder(player,orderId){
  const state=await player.client.rpc('get_player_game_state');
  assert.ifError(state.error);
  const orders=await admin.from('player_daily_orders').select('order_date,order_id,slot').eq('player_id',player.id).order('slot');
  assert.ifError(orders.error);
  assert.equal(orders.data.length,3,'daily order fixture must contain three orders');
  if(orders.data.some((order)=>order.order_id===orderId)) return;
  const replaced=await admin.from('player_daily_orders').update({order_id:orderId}).eq('player_id',player.id).eq('order_date',orders.data[0].order_date).eq('slot',orders.data[0].slot).select('order_id').single();
  assert.ifError(replaced.error);
  assert.equal(replaced.data.order_id,orderId,'daily order fixture must activate the requested order');
}

const first=await invitedPlayer('SmokeOne');
const second=await invitedPlayer('SmokeTwo');
const adminUser=await invitedPlayer('SmokeAdmin');
await admin.from('profiles').update({app_role:'admin'}).eq('id',adminUser.id).throwOnError();

const options=await fetch(`${url}/functions/v1/game-action`,{method:'OPTIONS'});
assert.equal(options.ok,true,'Edge Function CORS OPTIONS must succeed');
const unauthorized=await fetch(`${url}/functions/v1/game-action`,{method:'POST',headers:{apikey:anonKey,'content-type':'application/json'},body:JSON.stringify({action:'execute_job',idempotencyKey:crypto.randomUUID(),jobType:'lumberjack'})});
assert.equal(unauthorized.status,401,'unauthorized Edge Function action must fail');
const malformed=await edge(first.token,{action:'bad_action',idempotencyKey:crypto.randomUUID()});
assert.equal(malformed.response.status,400,'malformed Edge Function action must fail');

const anon=createClient(url,anonKey,clientOptions);
const anonOpen=await anon.rpc('open_business',{requested_business_type:'restaurant',request_key:crypto.randomUUID()});
assert(anonOpen.error,'anonymous protected RPC must fail');
const hiddenProfile=await first.client.from('profiles').select('id').eq('id',second.id);
assert.ifError(hiddenProfile.error);
assert.equal(hiddenProfile.data.length,0,'Player A must not read Player B profile');
const beforeOther=await admin.from('player_economy').select('coins').eq('player_id',second.id).single();
assert.ifError(beforeOther.error);
const mutateOther=await first.client.from('player_economy').update({coins:999999}).eq('player_id',second.id).select();
assert(mutateOther.error,'Player A must be denied direct economy mutation');
assert.equal(mutateOther.error.code,'42501','Player A economy mutation must be rejected by RLS');
assert.equal(mutateOther.data?.length ?? 0,0,'Player A update must not return Player B economy rows');
const afterOther=await admin.from('player_economy').select('coins').eq('player_id',second.id).single();
assert.ifError(afterOther.error);
assert.equal(afterOther.data.coins,beforeOther.data.coins,'Player A must not mutate Player B economy');
const playerAdmin=await first.client.rpc('get_admin_economy_dashboard_v2',{period_days:1});
assert(playerAdmin.error?.message.includes('ADMIN_REQUIRED'),'ordinary user must be denied admin dashboard');
const adminDashboard=await adminUser.client.rpc('get_admin_economy_dashboard_v2',{period_days:1});
assert.ifError(adminDashboard.error);

await first.client.rpc('set_current_location',{next_location:'forest'});
const jobKey=crypto.randomUUID();
const jobA=await edge(first.token,{action:'execute_job',jobType:'lumberjack',idempotencyKey:jobKey});
const jobB=await edge(first.token,{action:'execute_job',jobType:'lumberjack',idempotencyKey:jobKey});
assert.equal(jobA.response.ok,true,'job request must pass');
assert.deepEqual(jobB.json.transactionId,jobA.json.transactionId,'duplicate job must replay transaction');
await first.client.rpc('set_current_location',{next_location:'mine'});
await action(first,{action:'execute_job',jobType:'miner'});
await first.client.rpc('set_current_location',{next_location:'farm'});
await action(first,{action:'execute_job',jobType:'farmer'});

await setResource(first.id,'wood',25);
await setResource(first.id,'stone',14);
await setResource(first.id,'iron',2);
await setResource(first.id,'food',5);
await assertStorageWithinCapacity(first.id,'pre-bridge fixture resources');
await ensureDailyOrder(first,'repair_old_bridge');
await admin.from('player_economy').update({coins:5000}).eq('player_id',first.id).throwOnError();
await first.client.rpc('set_current_location',{next_location:'workshop'});
await action(first,{action:'craft_item',recipeId:'planks'});
await action(first,{action:'complete_order',orderId:'repair_old_bridge'});

await first.client.rpc('set_current_location',{next_location:'market'});
const marketKey=crypto.randomUUID();
const marketA=await edge(first.token,{action:'market_buy',resourceId:'food',quantity:1,idempotencyKey:marketKey});
const marketB=await edge(first.token,{action:'market_buy',resourceId:'food',quantity:1,idempotencyKey:marketKey});
assert.equal(marketA.response.ok,true,'market buy must pass');
assert.deepEqual(marketB.json.transactionId,marketA.json.transactionId,'duplicate market action must replay');
await Promise.all([action(first,{action:'market_sell',resourceId:'food',quantity:1}),action(first,{action:'market_sell',resourceId:'food',quantity:1})]);

await first.client.rpc('set_current_location',{next_location:'home'});
await setResource(first.id,'wood',40);
await assertStorageWithinCapacity(first.id,'wood construction fixture resources');
const reserveKey=crypto.randomUUID();
const reserveA=await edge(first.token,{action:'fund_property_upgrade',targetLevel:2,idempotencyKey:reserveKey});
const reserveB=await edge(first.token,{action:'fund_property_upgrade',targetLevel:2,idempotencyKey:reserveKey});
assert.equal(reserveA.response.ok,true,'construction reservation must pass');
assert.deepEqual(reserveB.json.transactionId,reserveA.json.transactionId,'duplicate construction reservation must replay');
await setResource(first.id,'stone',25);
await assertStorageWithinCapacity(first.id,'stone construction fixture resources');
await action(first,{action:'fund_property_upgrade',targetLevel:2});
await action(first,{action:'upgrade_property',targetLevel:2});

await setResource(first.id,'wood',4);
await assertStorageWithinCapacity(first.id,'post-upgrade production fixture resources');
const businessRace=await Promise.all([edge(first.token,{action:'open_business',businessType:'restaurant',idempotencyKey:crypto.randomUUID()}),edge(first.token,{action:'open_business',businessType:'workshop',idempotencyKey:crypto.randomUUID()})]);
assert.equal(businessRace.filter((item)=>item.response.ok).length,1,'business slot race must allow exactly one open');
const stateAfterBusiness=businessRace.find((item)=>item.response.ok).json.state;
const business=stateAfterBusiness.businesses[0];
await action(first,{action:'assign_resident_to_business',residentId:stateAfterBusiness.resident.id,businessId:business.id});
const recipeByBusiness={general_store:'general_store_sales',restaurant:'restaurant_meals',workshop:'workshop_tools'};
const started=await action(first,{action:'start_business_production',businessId:business.id,recipeId:recipeByBusiness[business.type]});
const productionId=started.state.businesses.find((item)=>item.id===business.id).production.id;
await admin.from('business_productions').update({started_at:new Date(Date.now()-2000).toISOString(),ready_at:new Date(Date.now()-1000).toISOString()}).eq('id',productionId).throwOnError();
const claimKey=crypto.randomUUID();
const claimA=await edge(first.token,{action:'claim_business_production',productionId,idempotencyKey:claimKey});
const claimB=await edge(first.token,{action:'claim_business_production',productionId,idempotencyKey:claimKey});
assert.equal(claimA.response.ok,true,'production claim must pass');
assert.deepEqual(claimB.json.transactionId,claimA.json.transactionId,'duplicate production claim must replay');

const quest=claimA.json.state.season.dailyQuests.find((item)=>item.completed&&!item.claimed);
if(quest) await action(first,{action:'claim_daily_quest',questId:quest.id});
await first.client.auth.signOut();
const relogin=await first.client.auth.signInWithPassword({email:first.email,password});
assert.ifError(relogin.error);
const persisted=await first.client.rpc('get_player_game_state');
assert.ifError(persisted.error);
assert(persisted.data.playerId===first.id,'persistence check must reload same player');

const health=await adminUser.client.rpc('get_alpha_health');
assert.ifError(health.error);
assert.equal(health.data.databaseReachable,true,'alpha health must report database reachable');

console.log('Remote Alpha smoke passed: signup/login, starter provisioning, jobs, craft, order, market, construction, property upgrade, business, assignment, production, quest/persistence, RLS/admin, idempotency, concurrency spot checks, telemetry health, Edge CORS/auth.');

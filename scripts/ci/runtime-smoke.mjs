import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const url=process.env.API_URL??process.env.SUPABASE_URL;
const anonKey=process.env.ANON_KEY??process.env.SUPABASE_ANON_KEY;
const serviceKey=process.env.SERVICE_ROLE_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url&&anonKey&&serviceKey,'Local Supabase API_URL, ANON_KEY, and SERVICE_ROLE_KEY are required');
class RuntimeSmokeWebSocket {
  static CONNECTING=0;
  static OPEN=1;
  static CLOSING=2;
  static CLOSED=3;
  constructor(){throw new Error('Realtime WebSocket transport is disabled in runtime smoke tests');}
}
const clientOptions={auth:{persistSession:false},realtime:{transport:RuntimeSmokeWebSocket}};
const admin=createClient(url,serviceKey,clientOptions);
const password='Runtime-only-password-7!';
async function player(label){const email=`${label}-${crypto.randomUUID()}@example.test`;const{data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:label}});assert.ifError(error);const client=createClient(url,anonKey,clientOptions);const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);return{id:data.user.id,client};}
const first=await player('RuntimeOne');const second=await player('RuntimeTwo');
await admin.from('properties').update({level:2,storage_capacity:100,resident_capacity:3,business_slots:1}).eq('player_id',first.id).throwOnError();
await admin.from('player_economy').update({coins:3000}).eq('player_id',first.id).throwOnError();
const openKeyA=crypto.randomUUID(),openKeyB=crypto.randomUUID();
const concurrent=await Promise.all([first.client.rpc('open_business',{requested_business_type:'restaurant',request_key:openKeyA}),first.client.rpc('open_business',{requested_business_type:'workshop',request_key:openKeyB})]);
assert.equal(concurrent.filter(result=>!result.error).length,1,'one-slot property must allow exactly one concurrent business open');
const winner=concurrent.find(result=>!result.error);assert(winner?.data?.state,'winning open must return authoritative state');
const replay=await first.client.rpc('open_business',{requested_business_type:winner.data.state.businesses[0].type,request_key:concurrent[0].error?openKeyB:openKeyA});assert.ifError(replay.error);assert.equal(replay.data.transactionId,winner.data.transactionId,'idempotent replay must return the original result');
const anonymous=createClient(url,anonKey,clientOptions);const anonymousOpen=await anonymous.rpc('open_business',{requested_business_type:'restaurant',request_key:crypto.randomUUID()});assert(anonymousOpen.error,'anonymous economy RPC must fail');
const inspect=await first.client.rpc('admin_inspect_player',{target_player:second.id});assert(inspect.error?.message.includes('ADMIN_REQUIRED'),'ordinary player must not inspect another player');
await admin.from('residents').update({current_location:'home'}).eq('player_id',second.id).throwOnError();
await admin.from('player_economy').update({coins:1000}).eq('player_id',second.id).throwOnError();
await admin.from('player_resources').update({amount:40}).eq('player_id',second.id).eq('resource','wood').throwOnError();
const reserveKey=crypto.randomUUID();const reserve=await second.client.rpc('fund_property_upgrade',{target_level:2,request_key:reserveKey});assert.ifError(reserve.error);const reserveReplay=await second.client.rpc('fund_property_upgrade',{target_level:2,request_key:reserveKey});assert.ifError(reserveReplay.error);
const progress=await admin.from('property_upgrade_progress').select('wood,stone').eq('player_id',second.id).single();assert.ifError(progress.error);assert.equal(progress.data.wood,40,'duplicate reserve must not reserve twice');
const wood=await admin.from('player_resources').select('amount').eq('player_id',second.id).eq('resource','wood').single();assert.equal(wood.data.amount,0,'reserved wood must leave sellable inventory');
console.log('Runtime smoke passed: provisioning, RLS/admin denial, anonymous denial, slot concurrency, idempotency, and construction reservation replay.');

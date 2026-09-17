import { supabase } from './supabase';
let sessionId:string|null=null;
export async function startObservedSession(){const{data,error}=await supabase.rpc('start_observed_session');if(!error)sessionId=data as string;return sessionId;}
export async function heartbeatObservedSession(){if(sessionId)await supabase.rpc('heartbeat_observed_session',{observed_session:sessionId});}
export async function endObservedSession(){if(sessionId)await supabase.rpc('end_observed_session',{observed_session:sessionId});sessionId=null;}

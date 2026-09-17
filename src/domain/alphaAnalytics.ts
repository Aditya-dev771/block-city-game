export type Health='LOW'|'HEALTHY'|'HIGH';
export type FlowHealth='DEFLATIONARY'|'BALANCED'|'INFLATIONARY';
export function coinHealth(ratio:number):Health{return ratio<.85?'LOW':ratio>1.15?'HIGH':'HEALTHY';}
export function resourceHealth(net:number,throughput:number):FlowHealth{const share=throughput===0?0:net/throughput;return share<-.1?'DEFLATIONARY':share>.1?'INFLATIONARY':'BALANCED';}
export function pressureHealth(current:number,initial:number):Health{const ratio=initial===0?1:current/initial;return ratio<.7?'HIGH':ratio>1.3?'LOW':'HEALTHY';}
export function profitHealth(profitPerHour:number):'NEGATIVE'|'NEUTRAL'|'HIGH'{return profitPerHour<0?'NEGATIVE':profitPerHour>100?'HIGH':'NEUTRAL';}
export function fpPaceHealth(fpPerDay:number):'SLOW'|'EXPECTED'|'FAST'{return fpPerDay<10?'SLOW':fpPerDay>45?'FAST':'EXPECTED';}
export function approximateSessionMinutes(startedAt:string,lastActivityAt:string,endedAt?:string|null){const end=Date.parse(endedAt??lastActivityAt);return Math.max(0,Math.round((end-Date.parse(startedAt))/60000));}
export function propertyTiming(createdAt:string,level2At:string|null,level3At:string|null){return{accountToLevel2Hours:level2At?(Date.parse(level2At)-Date.parse(createdAt))/3600000:null,level2ToLevel3Hours:level2At&&level3At?(Date.parse(level3At)-Date.parse(level2At))/3600000:null};}
export function retentionRate(cohort:number,returned:number,minSample=5){return cohort<minSample?null:returned/cohort;}
export function funnelConversions(stages:Record<string,number>){const entries=Object.entries(stages);return entries.map(([stage,count],index)=>({stage,count,fromPrevious:index===0||entries[index-1]![1]===0?null:count/entries[index-1]![1]}));}
export function anomalySeverity(type:string,count:number):'LOW'|'MEDIUM'|'HIGH'{if(['EXTREME_COIN_GAIN','IMPOSSIBLE_ACTION_SEQUENCE'].includes(type)||count>=20)return'HIGH';if(count>=5)return'MEDIUM';return'LOW';}

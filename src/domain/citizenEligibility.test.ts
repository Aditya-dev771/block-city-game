import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearEligibilityCacheForTests, extractVerifiedEthereumIdentity, verifyCitizenEligibility } from '../../supabase/functions/_shared/citizenEligibility';

const wallet={address:'0x1111111111111111111111111111111111111111',chainId:4663};
const config={wallet,rpcUrl:'https://rpc.invalid',contractAddress:'0x2222222222222222222222222222222222222222',contractStandard:'erc721',configuredChainId:'4663'};
const rpc=(balance:string,chain='0x1237')=>vi.fn(async()=>new Response(JSON.stringify([{id:1,result:chain},{id:2,result:balance}]),{status:200}));

describe('citizen eligibility',()=>{
 beforeEach(()=>clearEligibilityCacheForTests());
 it('derives the address and chain only from verified Web3 identity data',()=>expect(extractVerifiedEthereumIdentity([{provider:'web3',provider_id:`web3:ethereum:${wallet.address}`,identity_data:{custom_claims:{address:wallet.address,chain:'ethereum',network:'4663'}}}])).toEqual(wallet));
 it('rejects spoofed mismatched identity addresses',()=>expect(extractVerifiedEthereumIdentity([{provider:'web3',provider_id:`web3:ethereum:${wallet.address}`,identity_data:{custom_claims:{address:'0x3333333333333333333333333333333333333333',chain:'ethereum',network:'4663'}}}])).toBeNull());
 it('fails closed when configuration is absent',async()=>expect((await verifyCitizenEligibility({wallet})).status).toBe('not_configured'));
 it('rejects the wrong chain',async()=>expect((await verifyCitizenEligibility({...config,wallet:{...wallet,chainId:1}})).status).toBe('wrong_chain'));
 it('rejects a zero balance',async()=>expect((await verifyCitizenEligibility({...config,fetcher:rpc('0x0')})).eligible).toBe(false));
 it('accepts one or more NFTs without multiplying access',async()=>expect((await verifyCitizenEligibility({...config,fetcher:rpc('0x2')})).balance).toBe(2));
 it('fails closed when RPC is unavailable',async()=>expect((await verifyCitizenEligibility({...config,fetcher:vi.fn(async()=>{throw new Error('offline')})})).status).toBe('unavailable'));
 it('fails closed for malformed RPC balances',async()=>expect((await verifyCitizenEligibility({...config,fetcher:rpc('not-hex')})).status).toBe('unavailable'));
 it('fails closed when the RPC reports another chain',async()=>expect((await verifyCitizenEligibility({...config,fetcher:rpc('0x1','0x1')})).status).toBe('unavailable'));
 it('uses a bounded cache and rechecks after expiry',async()=>{let now=0;const fetcher=rpc('0x1');await verifyCitizenEligibility({...config,fetcher,now:()=>now,cacheTtlMs:15_000});await verifyCitizenEligibility({...config,fetcher,now:()=>now});expect(fetcher).toHaveBeenCalledTimes(1);now=15_001;await verifyCitizenEligibility({...config,fetcher,now:()=>now});expect(fetcher).toHaveBeenCalledTimes(2);});
});

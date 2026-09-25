export const REQUIRED_CHAIN_ID = 4663;
export const DEFAULT_CACHE_TTL_MS = 60_000;

export type EligibilityResult = {
  status: 'eligible' | 'ineligible' | 'not_configured' | 'unavailable' | 'wrong_chain';
  eligible: boolean;
  balance: number;
  checkedAt: string;
  message: string;
};

export type VerifiedWalletIdentity = { address: string; chainId: number };
type AuthIdentity = { provider?: string; provider_id?: string; identity_data?: Record<string, unknown> };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const cache = new Map<string, { expiresAt: number; result: EligibilityResult }>();

export function extractVerifiedEthereumIdentity(identities: AuthIdentity[] | undefined): VerifiedWalletIdentity | null {
  for (const identity of identities ?? []) {
    if (identity.provider !== 'web3') continue;
    const data = identity.identity_data ?? {};
    const claims = typeof data.custom_claims === 'object' && data.custom_claims ? data.custom_claims as Record<string, unknown> : data;
    if (claims.chain !== 'ethereum') continue;
    const address = typeof claims.address === 'string' ? claims.address : identity.provider_id?.split(':').at(-1);
    const chainId = Number(claims.network ?? claims.chain_id ?? claims.chainId);
    if (!address || !ADDRESS.test(address) || !Number.isSafeInteger(chainId)) continue;
    const providerAddress = identity.provider_id?.split(':').at(-1);
    if (providerAddress && providerAddress.toLowerCase() !== address.toLowerCase()) continue;
    return { address: address.toLowerCase(), chainId };
  }
  return null;
}

export async function verifyCitizenEligibility(input: {
  wallet: VerifiedWalletIdentity;
  rpcUrl?: string;
  contractAddress?: string;
  contractStandard?: string;
  configuredChainId?: string;
  cacheTtlMs?: number;
  now?: () => number;
  fetcher?: typeof fetch;
}): Promise<EligibilityResult> {
  const now = input.now ?? Date.now;
  const checkedAt = new Date(now()).toISOString();
  const chainId = Number(input.configuredChainId);
  if (!input.rpcUrl || !input.contractAddress || !input.contractStandard || !Number.isSafeInteger(chainId)) return result('not_configured', checkedAt, 'Citizen NFT verification is not configured.');
  if (chainId !== REQUIRED_CHAIN_ID || input.wallet.chainId !== REQUIRED_CHAIN_ID) return result('wrong_chain', checkedAt, 'Switch to Robinhood Chain.');
  if (input.contractStandard.toLowerCase() !== 'erc721' || !ADDRESS.test(input.contractAddress)) return result('not_configured', checkedAt, 'Citizen NFT verification is not configured.');
  const ttl = Math.min(300_000, Math.max(15_000, input.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
  const key = `${input.wallet.address}:${chainId}:${input.contractAddress.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.result;
  try {
    const fetcher = input.fetcher ?? fetch;
    const calls = [
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'eth_call', params: [{ to: input.contractAddress, data: `0x70a08231${input.wallet.address.slice(2).padStart(64, '0')}` }, 'latest'] }
    ];
    const response = await fetcher(input.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(calls), signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json() as Array<{ id: number; result?: string; error?: unknown }>;
    const network = payload.find(item => item.id === 1);
    const balanceCall = payload.find(item => item.id === 2);
    if (network?.error || balanceCall?.error || !network?.result || !balanceCall?.result) throw new Error('RPC returned an invalid response');
    if (Number.parseInt(network.result, 16) !== REQUIRED_CHAIN_ID) throw new Error('RPC is connected to the wrong chain');
    const rawBalance = BigInt(balanceCall.result);
    const balance = rawBalance > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(rawBalance);
    const verified = result(balance > 0 ? 'eligible' : 'ineligible', checkedAt, balance > 0 ? 'Citizen access is active.' : 'An eligible Block City Citizen NFT is required.', balance);
    cache.set(key, { expiresAt: now() + ttl, result: verified });
    return verified;
  } catch {
    return result('unavailable', checkedAt, 'Citizen verification is temporarily unavailable. Please retry.');
  }
}

export function clearEligibilityCacheForTests(): void { cache.clear(); }

function result(status: EligibilityResult['status'], checkedAt: string, message: string, balance = 0): EligibilityResult {
  return { status, eligible: status === 'eligible', balance, checkedAt, message };
}

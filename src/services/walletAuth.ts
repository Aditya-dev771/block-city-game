import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const GAME_CHAIN_ID = 4663;
const GAME_CHAIN_HEX = `0x${GAME_CHAIN_ID.toString(16)}`;

export interface EthereumProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export type CitizenAccess = {
  state: 'explorer' | 'not_configured' | 'unavailable' | 'ineligible' | 'citizen';
  walletAddress: string | null;
  eligible: boolean;
  balance: number;
  checkedAt: string | null;
  message: string;
};

declare global { interface Window { ethereum?: EthereumProvider } }

export function injectedWallet(): EthereumProvider | null {
  return window.ethereum && typeof window.ethereum.request === 'function' && typeof window.ethereum.on === 'function' ? window.ethereum : null;
}

export async function connectWallet(): Promise<{ provider: EthereumProvider; address: string; chainId: number }> {
  const provider = injectedWallet();
  if (!provider) throw new Error('No compatible EVM wallet was found. Install MetaMask, Rabby, or another EIP-1193 wallet.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
  if (!accounts[0]) throw new Error('The wallet did not provide an account.');
  const chainId = Number.parseInt(await provider.request({ method: 'eth_chainId' }) as string, 16);
  return { provider, address: accounts[0], chainId };
}

export async function switchToGameChain(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GAME_CHAIN_HEX }] });
  } catch {
    throw new Error('Switch to Robinhood Chain in your wallet. Verified chain metadata is not configured, so Block City will not add the network automatically.');
  }
}

export async function signInWithWallet(provider: EthereumProvider, address: string): Promise<Session> {
  const wallet = { address, request: provider.request.bind(provider), on: provider.on.bind(provider), removeListener: provider.removeListener.bind(provider) };
  const result = await supabase.auth.signInWithWeb3({
    chain: 'ethereum',
    wallet,
    statement: 'Sign in to Block City and verify Citizen access.',
    options: { signInWithEthereum: { chainId: GAME_CHAIN_ID } }
  });
  if (result.error || !result.data.session) throw result.error ?? new Error('Wallet authentication failed.');
  return result.data.session;
}

export async function loadCitizenAccess(): Promise<CitizenAccess> {
  const { data, error } = await supabase.functions.invoke('game-action', { body: { action: 'get_citizen_access' } });
  if (error) {
    let message = error.message;
    if ('context' in error && error.context instanceof Response) {
      try { message = ((await error.context.clone().json()) as { error?: string }).error ?? message; } catch { /* transport fallback */ }
    }
    throw new Error(message);
  }
  return data as CitizenAccess;
}

export function shortWallet(address: string | null): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
}

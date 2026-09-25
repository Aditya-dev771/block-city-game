# Wallet authentication and Citizen NFT gate

Block City uses Supabase Sign-In with Web3 for EIP-4361 authentication. Wallet connection alone is not authentication and never unlocks gameplay. Supabase validates the SIWE signature, domain, URI, timestamp, and wallet identity before issuing a session.

The `game-action` Edge Function derives the address and chain from the authenticated Supabase Web3 identity. It never accepts an address or eligibility flag from the request body. It checks ERC-721 `balanceOf(address)` through the configured Robinhood Chain RPC and issues a database access grant lasting 60 seconds by default. Economy-table triggers require that unexpired grant, which also prevents direct authenticated RPC calls from bypassing the Edge Function. RPC failures fail closed and are distinct from a zero NFT balance.

Selling or transferring all eligible NFTs locks gameplay after the current grant/cache expires. Player progression is retained and becomes available again if the same wallet regains eligibility. Owning multiple NFTs does not modify rewards.

## Required configuration

Enable the Ethereum Web3 provider in Supabase Auth and register every production/preview URL as an allowed redirect URL.

Set these as Supabase Edge Function secrets and GitHub `private-alpha` environment secrets when the contract is deployed:

- `ROBINHOOD_RPC_URL`
- `CITIZEN_NFT_CONTRACT`
- `CITIZEN_NFT_CHAIN_ID` (`4663`)
- `CITIZEN_NFT_STANDARD` (`erc721`)
- `CITIZEN_ELIGIBILITY_CACHE_TTL_SECONDS` (`60` recommended; server clamps it to 15–300 seconds)
- `ALLOW_LEGACY_ALPHA_TESTERS` (`false` by default; set `true` only during the documented email-account migration period)

Optional browser presentation variables are `VITE_GAME_CHAIN_ID` and `VITE_CITIZEN_NFT_CONTRACT`. They are not authoritative and cannot bypass the server gate. Never expose the RPC URL or Supabase service-role key through `VITE_*` variables.

Until a verified contract address and Robinhood RPC are configured, wallet authentication works but Citizen eligibility returns `not_configured` and economy actions remain locked.

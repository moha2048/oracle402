// Shows the buyer wallet balance and its Circle Gateway balance (what the agent can actually spend gaslessly).
import { GatewayClient } from "@circle-fin/x402-batching/client";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
const b: any = await client.getBalances();
console.log(`Wallet USDC:           ${b.wallet?.formatted}`);
console.log(`Gateway available:     ${b.gateway?.formattedAvailable}`);
console.log(`Gateway total:         ${b.gateway?.formattedTotal}  (available + pending)`);

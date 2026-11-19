// One-time onchain step: move USDC from the buyer wallet into its Circle Gateway balance so it can pay gaslessly.
import { GatewayClient } from "@circle-fin/x402-batching/client";

const amount = process.argv[2] ?? "1";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });

const before = await client.getBalances();
console.log("Before:", JSON.stringify(before, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const result = await client.deposit(amount);
console.log(`Deposited ${amount} USDC into Gateway.`, JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const after = await client.getBalances();
console.log("After:", JSON.stringify(after, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

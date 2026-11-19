// One real paid x402 call against the local seller (sanity check). Usage: npx tsx --env-file=.env scripts/paid-call.ts <TICKER>
import { GatewayClient } from "@circle-fin/x402-batching/client";
const ticker = process.argv[2] ?? "BTC2611302200";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });
const before: any = await client.getBalances();
console.log("Gateway available before:", before.gateway?.formattedAvailable);
const { data, status } = await client.pay(`${process.env.SELLER_URL ?? "http://localhost:3000"}/forecast/${ticker}`);
const d: any = data;
console.log("status", status, "paid", JSON.stringify(d?.paid), "title", d?.title, "contracts", d?.contracts?.length);
console.log("first contracts:", JSON.stringify(d?.contracts?.slice(0, 3)));
const after: any = await client.getBalances();
console.log("Gateway available after: ", after.gateway?.formattedAvailable);

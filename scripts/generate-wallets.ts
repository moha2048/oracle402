// Generates a SELLER and a BUYER (agent) wallet and prints .env lines. Testnet only: never reuse these keys.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const buyerKey = generatePrivateKey();
const sellerKey = generatePrivateKey();
console.log(`
# --- paste into .env (testnet only!) ---
SELLER_ADDRESS=${privateKeyToAccount(sellerKey).address}
SELLER_PRIVATE_KEY=${sellerKey}
BUYER_ADDRESS=${privateKeyToAccount(buyerKey).address}
BUYER_PRIVATE_KEY=${buyerKey}

# Next: fund BUYER_ADDRESS with testnet USDC at https://faucet.circle.com (select Arc Testnet), then: npm run deposit
`);

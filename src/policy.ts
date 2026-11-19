// Spending guardrails. EVERY payment the agent makes must pass through Policy.check().
// Controls: hard budget cap, per-call cap, host allowlist, human approval above a spend threshold, global kill switch.

export const usdcToMicro = (usdc: number) => Math.round(usdc * 1_000_000);
export const microToUsdc = (micro: number) => micro / 1_000_000;
/** "$0.001" -> 1000 (micro-USDC, 6 decimals) */
export const priceToMicro = (price: string) => usdcToMicro(Number(price.replace("$", "")));

export type Decision =
  | { allow: true }
  | { allow: false; reason: string }
  | { allow: "approval"; reason: string };

export class Policy {
  spentMicro = 0;
  killed = false;
  constructor(
    public budgetMicro: number,
    public approveAfterMicro: number, // once cumulative spend would pass this, a human must approve each purchase
    public maxPerCallMicro: number,
    public allowedHosts: Set<string>,
  ) {}

  get remainingMicro() {
    return Math.max(0, this.budgetMicro - this.spentMicro);
  }

  check(url: string, priceMicro: number): Decision {
    if (this.killed) return { allow: false, reason: "Kill switch is engaged. All spending is halted." };
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return { allow: false, reason: "Invalid URL." };
    }
    if (!this.allowedHosts.has(host)) return { allow: false, reason: `Host ${host} is not on the allowlist.` };
    if (priceMicro > this.maxPerCallMicro)
      return { allow: false, reason: `Price ${microToUsdc(priceMicro)} USDC exceeds the per-call cap of ${microToUsdc(this.maxPerCallMicro)} USDC.` };
    if (this.spentMicro + priceMicro > this.budgetMicro)
      return { allow: false, reason: `Budget exhausted: ${microToUsdc(this.remainingMicro)} USDC left, call costs ${microToUsdc(priceMicro)} USDC.` };
    if (this.spentMicro + priceMicro > this.approveAfterMicro)
      return { allow: "approval", reason: `Spend would pass the ${microToUsdc(this.approveAfterMicro)} USDC auto-approve threshold. Human approval required.` };
    return { allow: true };
  }

  record(priceMicro: number) {
    this.spentMicro += priceMicro;
  }
}

// src/utils/karmaEngine.ts
// Karma Oracle — Math Layer
// Proof source: Karma_Proof.pdf
//
// Weight:    ωᵢ(t) = B^α · b^(1−α) · e^(−λΔt)   [Cobb-Douglas, α=0.5 → √(B·b)]
// P_curr:    Σ ωᵢ·pᵢ / Σ ωᵢ                      [current epoch aggregated price]
// Utility:   Uᵢ = δ·[ (pᵢ−P_prev)·(Bᵢ−bᵢ) + Wᵢ/ΣWⱼ·R(t) ]
// Evolution: Bᵢ(t+1) = Bᵢ·P_curr/P_prev,  bᵢ(t+1) = bᵢ·(2·P_prev−P_curr)/P_prev
// Nash eq:   Bᵢ≈bᵢ (balanced), pᵢ≈P_prev (aligns with previous epoch consensus)
//
// NOTE: Karma uses NO external oracle. P_prev is the consensus price from the
// previous epoch stored on-chain in KarmaOracle.sol via getPreviousEpochPrice().
// There is no external "true price" — truth emerges from community consensus.

export const KARMA_CONSTANTS = {
  DECAY_HALF_LIFE_S: 3600,  // 1-hour half-life; flash loans: Δt→0 → W→0
  ALPHA: 0.5,               // Cobb-Douglas α → geometric mean at 0.5
  DELTA: 0.95,              // discount factor δ
  MOCK_REWARD_POOL: 10_000, // R(t) — replace with on-chain value post-deploy
  BOOTSTRAP_PRICE: 100,     // Initial P_prev for epoch 0 (set in contract constructor)
} as const;

const { DECAY_HALF_LIFE_S, ALPHA, DELTA, MOCK_REWARD_POOL, BOOTSTRAP_PRICE } = KARMA_CONSTANTS;
const LAMBDA = Math.LN2 / DECAY_HALF_LIFE_S;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KarmaWeightInput {
  bullBalance: number;
  bearBalance: number;
  lastSubmissionTime: number; // Unix seconds
}

export interface KarmaSubmission extends KarmaWeightInput {
  id: string;
  price: number;
  source: "user" | "bot" | "seed";
  label?: string;
  address?: string;
}

export interface KarmaSubmissionWithWeight extends KarmaSubmission {
  weight: number;
}

export interface UtilityInput {
  price: number;
  pPrev: number;        // previous epoch consensus price (from contract, NOT external oracle)
  bullBalance: number;
  bearBalance: number;
  weight: number;
  totalWeight: number;
  rewardPool?: number;
}

export interface BalanceEvolutionInput {
  bullBalance: number;
  bearBalance: number;
  pCurr: number;        // current epoch aggregated price  (was: pAgg)
  pPrev: number;        // previous epoch consensus price  (was: pTrue)
}

// ── Core weight ωᵢ(t) ────────────────────────────────────────────────────────
// Zero at boundary: W(B,0)=W(0,b)=0  ← biased wallets silenced (Theorem 1a)
// Flash loan proof: lim_{Δt→0} W = 0  (page 3)
// Sybil proof: Σ√(Bⱼbⱼ) ≤ √(ΣBⱼ)(Σbⱼ)  [Cauchy-Schwarz, page 3]
export function calcKarmaWeight({
  bullBalance: B,
  bearBalance: b,
  lastSubmissionTime,
}: KarmaWeightInput): number {
  if (B <= 0 || b <= 0) return 0;
  const cobbDouglas = Math.pow(B, ALPHA) * Math.pow(b, 1 - ALPHA);
  const deltaT = Math.max(0, Date.now() / 1000 - lastSubmissionTime);
  return cobbDouglas * Math.exp(-LAMBDA * deltaT);
}

// ── Weighted average price P_curr ────────────────────────────────────────────
// P_curr = Σ(ωᵢ·pᵢ) / Σωᵢ  — current epoch aggregated price
// This becomes P_prev for the NEXT epoch once settleEpoch() is called on-chain.
export function calcWeightedAveragePrice(subs: KarmaSubmissionWithWeight[]): number {
  const totalW = subs.reduce((s, x) => s + x.weight, 0);
  if (totalW === 0) return 0;
  return subs.reduce((s, x) => s + x.price * x.weight, 0) / totalW;
}

// ── Utility Uᵢ (single period) ───────────────────────────────────────────────
// Nash: at Bᵢ=bᵢ, trading profit (Bᵢ−bᵢ)=0, utility = reward share only.
// Reward share maximised when pᵢ ≈ P_prev → aligning with past consensus is dominant strategy.
// P_prev comes from KarmaOracle.getPreviousEpochPrice() — NOT an external feed.
export function calcUtility({
  price,
  pPrev,              // was: pTrue — now previous epoch consensus price
  bullBalance: B,
  bearBalance: b,
  weight,
  totalWeight,
  rewardPool = MOCK_REWARD_POOL,
}: UtilityInput): number {
  const tradingProfit = (price - pPrev) * (B - b);
  const rewardShare = totalWeight > 0 ? (weight / totalWeight) * rewardPool : 0;
  return DELTA * (tradingProfit + rewardShare);
}

// ── Balance evolution ─────────────────────────────────────────────────────────
// B_new = B · (P_curr / P_prev)
// b_new = b · (2·P_prev − P_curr) / P_prev
//
// P_prev = previous epoch consensus price stored on-chain (no external oracle).
// For epoch 0, P_prev = BOOTSTRAP_PRICE (set in contract constructor).
// Future weight is maximised when P_curr = P_prev → reporters rewarded for consensus alignment.
export function evolveBalances({
  bullBalance: B,
  bearBalance: b,
  pCurr,    // was: pAgg
  pPrev,    // was: pTrue
}: BalanceEvolutionInput) {
  if (pPrev === 0) return { newBull: B, newBear: b };
  return {
    newBull: Math.max(0, B * (pCurr / pPrev)),
    newBear: Math.max(0, b * ((2 * pPrev - pCurr) / pPrev)),
  };
}

// ── Next-period weight Wᵢ(t+1) ───────────────────────────────────────────────
// Wᵢ(t+1) = Bᵢ·bᵢ · P_curr·(2·P_prev−P_curr) / P_prev²
// Maximised when P_curr = P_prev
// Derivative condition: ∂W/∂P_curr = 0 at P_curr = P_prev  (manipulation proof)
export function nextPeriodWeight({
  bullBalance: B,
  bearBalance: b,
  pCurr,    // was: pAgg
  pPrev,    // was: pTrue
}: BalanceEvolutionInput): number {
  if (pPrev === 0) return 0;
  return (B * b * pCurr * (2 * pPrev - pCurr)) / (pPrev * pPrev);
}

// ── Sybil resistance (Cauchy-Schwarz) ────────────────────────────────────────
export function checkSybilResistance(subs: KarmaSubmission[]) {
  const lhs = subs.reduce((s, x) => s + Math.sqrt(x.bullBalance * x.bearBalance), 0);
  const rhs = Math.sqrt(
    subs.reduce((s, x) => s + x.bullBalance, 0) *
    subs.reduce((s, x) => s + x.bearBalance, 0)
  );
  return { lhs, rhs, holds: lhs <= rhs + 0.001 };
}

// ── Flash loan weight (Δt → 0) ───────────────────────────────────────────────
export function flashLoanWeight(B: number, b: number, deltaT: number): number {
  if (B <= 0 || b <= 0) return 0;
  return Math.sqrt(B * b) * Math.exp(-LAMBDA * deltaT);
}

// ── Attach weights to submission array ───────────────────────────────────────
export function withWeights(subs: KarmaSubmission[]): KarmaSubmissionWithWeight[] {
  return subs.map((s) => ({ ...s, weight: calcKarmaWeight(s) }));
}

// ── Resolve P_prev safely ─────────────────────────────────────────────────────
// Use this anywhere you need P_prev — falls back to bootstrap price for epoch 0.
// Post-deploy: replace with useReadContract({ functionName: 'getPreviousEpochPrice' })
export function resolvePPrev(
  previousEpochPrice?: number,
  firstSubmissionPrice?: number
): number {
  return previousEpochPrice ?? firstSubmissionPrice ?? BOOTSTRAP_PRICE;
}

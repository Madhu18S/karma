// src/utils/karmaEngine.ts
// Karma Oracle — Math Layer
// Proof source: Karma_Proof.pdf
//
// Weight:   ωᵢ(t) = B^α · b^(1−α) · e^(−λΔt)   [Cobb-Douglas, α=0.5 → √(B·b)]
// P_agg:    Σ ωᵢ·pᵢ / Σ ωᵢ
// Utility:  Uᵢ = δ·[ (pᵢ−p_true)·(Bᵢ−bᵢ) + Wᵢ/ΣWⱼ·R(t) ]
// Evolution: Bᵢ(t+1) = Bᵢ·P_agg/P_true,  bᵢ(t+1) = bᵢ·(2P_true−P_agg)/P_true
// Nash eq:  Bᵢ≈bᵢ (balanced), pᵢ=p_true (truthful) — both incentive-compatible

export const KARMA_CONSTANTS = {
  DECAY_HALF_LIFE_S: 3600,  // 1-hour half-life; flash loans: Δt→0 → W→0
  ALPHA: 0.5,               // Cobb-Douglas α → geometric mean at 0.5
  DELTA: 0.95,              // discount factor δ
  MOCK_REWARD_POOL: 10_000, // R(t) — replace with on-chain value post-deploy
} as const;

const { DECAY_HALF_LIFE_S, ALPHA, DELTA, MOCK_REWARD_POOL } = KARMA_CONSTANTS;
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
  pTrue: number;
  bullBalance: number;
  bearBalance: number;
  weight: number;
  totalWeight: number;
  rewardPool?: number;
}

export interface BalanceEvolutionInput {
  bullBalance: number;
  bearBalance: number;
  pAgg: number;
  pTrue: number;
}

// ── Core weight ωᵢ(t) ────────────────────────────────────────────────────────
// Zero at boundary: W(B,0)=W(0,b)=0  ← biased wallets silenced (Theorem 1a)
// Flash loan proof: lim_{Δt→0} W = 0  (page 3)
// Sybil proof: Σ√(Bⱼbⱼ) ≤ √(ΣBⱼ)(Σbⱼ)  [Cauchy-Schwarz, page 3]
export function calcKarmaWeight({ bullBalance: B, bearBalance: b, lastSubmissionTime }: KarmaWeightInput): number {
  if (B <= 0 || b <= 0) return 0;
  const cobbDouglas = Math.pow(B, ALPHA) * Math.pow(b, 1 - ALPHA);
  const deltaT = Math.max(0, Date.now() / 1000 - lastSubmissionTime);
  return cobbDouglas * Math.exp(-LAMBDA * deltaT);
}

// ── Weighted average price P_agg ─────────────────────────────────────────────
export function calcWeightedAveragePrice(subs: KarmaSubmissionWithWeight[]): number {
  const totalW = subs.reduce((s, x) => s + x.weight, 0);
  if (totalW === 0) return 0;
  return subs.reduce((s, x) => s + x.price * x.weight, 0) / totalW;
}

// ── Utility Uᵢ (single period) ───────────────────────────────────────────────
// Nash: at Bᵢ=bᵢ, trading profit (Bᵢ−bᵢ)=0, utility = reward share only.
// Reward share maximised at p_true → truthful reporting is dominant strategy.
export function calcUtility({ price, pTrue, bullBalance: B, bearBalance: b, weight, totalWeight, rewardPool = MOCK_REWARD_POOL }: UtilityInput): number {
  const tradingProfit = (price - pTrue) * (B - b);
  const rewardShare = totalWeight > 0 ? (weight / totalWeight) * rewardPool : 0;
  return DELTA * (tradingProfit + rewardShare);
}

// ── Balance evolution ─────────────────────────────────────────────────────────
export function evolveBalances({ bullBalance: B, bearBalance: b, pAgg, pTrue }: BalanceEvolutionInput) {
  if (pTrue === 0) return { newBull: B, newBear: b };
  return {
    newBull: Math.max(0, B * (pAgg / pTrue)),
    newBear: Math.max(0, b * ((2 * pTrue - pAgg) / pTrue)),
  };
}

// ── Next-period weight Wᵢ(t+1) ───────────────────────────────────────────────
export function nextPeriodWeight({ bullBalance: B, bearBalance: b, pAgg, pTrue }: BalanceEvolutionInput): number {
  if (pTrue === 0) return 0;
  return (B * b * pAgg * (2 * pTrue - pAgg)) / (pTrue * pTrue);
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

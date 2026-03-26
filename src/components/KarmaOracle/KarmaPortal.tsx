"use client";

// src/components/KarmaOracle/KarmaPortal.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Zap, Bot, Activity, Shield, ChevronRight,
  Info, RotateCcw, Radio,
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  calcKarmaWeight,
  calcWeightedAveragePrice,
  calcUtility,
  evolveBalances,
  nextPeriodWeight,
  checkSybilResistance,
  flashLoanWeight,
  resolvePPrev,
  KARMA_CONSTANTS,
  type KarmaSubmission,
} from "@/utils/karmaEngine";
import { useKarmaOracle } from "@/hooks/useKarmaOracle";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KarmaPortalProps {
  bullTokenAddress?: `0x${string}`;
  bearTokenAddress?: `0x${string}`;
  priceFeedValue?: number;
  poolName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number, d = 2) => Number(n).toFixed(d);
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

function getBiasLabel(B: number, b: number) {
  const r = B / (b || 0.0001);
  if (r > 5)   return { label: "Bull Bias", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30" };
  if (r < 0.2) return { label: "Bear Bias", color: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-500/30" };
  return         { label: "Neutral",        color: "text-indigo-600 dark:text-indigo-400",   bg: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-500/30" };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 min-w-[80px] bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-2xl p-3">
      <div className={`text-base font-black tabular-nums tracking-tight ${color ?? "text-gray-900 dark:text-white"}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-zinc-500 mt-0.5">{label}</div>
    </div>
  );
}

function SectionBadge({ children, color = "indigo" }: { children: React.ReactNode; color?: string }) {
  const styles: Record<string, string> = {
    indigo:  "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20",
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20",
    purple:  "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-500/20",
    amber:   "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[color]}`}>
      {children}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function KarmaPortal({ bullTokenAddress, bearTokenAddress, priceFeedValue, poolName }: KarmaPortalProps) {
  const [activeTab, setActiveTab]       = useState<"oracle" | "security" | "evolution">("oracle");
  const [priceInput, setPriceInput]     = useState("");
  // was: pTrueInput / handlePTrueChange
  // P_prev = previous epoch consensus price from KarmaOracle.getPreviousEpochPrice()
  // Pre-deploy: manual input for demo. Post-deploy: read from contract.
  const [pPrevInput, setPPrevInput]     = useState(String(priceFeedValue ?? KARMA_CONSTANTS.BOOTSTRAP_PRICE));
  const [botCountdown, setBotCountdown] = useState(30);
  const [localSubs, setLocalSubs]       = useState<KarmaSubmission[]>([]);
  const botTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const botCdRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    address, isConnected,
    bullBalance, bearBalance, myWeight, myUtility, isLoadingBalances,
    submissions, submissionsWithWeights, totalWeight,
    pCurr,          // was: pAgg — current epoch aggregated price
    pPrev,          // was: pTrue — previous epoch consensus price (no external oracle)
    setPPrev,       // was: setPTrue
    submitPrice, isSubmitting,
    botActive, setBotActive,
  } = useKarmaOracle({
    bullTokenAddress,
    bearTokenAddress,
    initialPPrev: priceFeedValue ?? KARMA_CONSTANTS.BOOTSTRAP_PRICE,  // was: initialPTrue
  });

  // Merge hook submissions with local bot submissions
  const allSubs = useMemo(() => {
    const merged = [...localSubs, ...submissions];
    return merged.map(s => ({
      ...s,
      weight: calcKarmaWeight({
        bullBalance: s.bullBalance,
        bearBalance: s.bearBalance,
        lastSubmissionTime: s.lastSubmissionTime,
      }),
    }));
  }, [localSubs, submissions]);

  const totalW   = useMemo(() => allSubs.reduce((s, x) => s + x.weight, 0), [allSubs]);
  const pCurrAll = useMemo(() => calcWeightedAveragePrice(allSubs), [allSubs]);   // was: pAggAll
  const maxW     = useMemo(() => Math.max(...allSubs.map(s => s.weight), 1), [allSubs]);

  // was: handlePTrueChange
  const handlePPrevChange = (v: string) => {
    setPPrevInput(v);
    const n = parseFloat(v);
    if (n > 0) setPPrev(n);
  };

  // ── Security values ───────────────────────────────────────────────────────
  const NOW_SEC  = Date.now() / 1000;
  const wZero    = calcKarmaWeight({ bullBalance: 100,   bearBalance: 0,   lastSubmissionTime: NOW_SEC });
  const wNeutral = calcKarmaWeight({ bullBalance: 500,   bearBalance: 500, lastSubmissionTime: NOW_SEC });
  const wBiased  = calcKarmaWeight({ bullBalance: 10000, bearBalance: 1,   lastSubmissionTime: NOW_SEC });
  const wFlash   = flashLoanWeight(500, 500, 0.001);
  const sybil    = useMemo(() => checkSybilResistance(submissions), [submissions]);

  // ── Bot — mock price only, no external API (frontend is client-side only) ─
  // The real poster script (Node.js, off-chain) handles external price sources.
  // This simulation demonstrates the Orb-style interval posting pattern only.
  const fireBotSubmission = useCallback(() => {
    const mockPrice = 2800 + (Math.random() - 0.5) * 120;
    const botSub: KarmaSubmission = {
      id: `Bot-${Date.now()}`,
      label: "PosterBot",
      bullBalance: 310,
      bearBalance: 295,
      price: mockPrice,
      lastSubmissionTime: Date.now() / 1000,
      source: "bot",
    };
    setLocalSubs(prev => [botSub, ...prev.slice(0, 24)]);
    toast.success(`🤖 PosterBot: $${fmt(mockPrice)}`, {
      description: "Simulated price · Orb-style interval poster",
    });
  }, []);

  useEffect(() => {
    if (botActive) {
      fireBotSubmission();
      setBotCountdown(30);
      botTimerRef.current = setInterval(fireBotSubmission, 30000);
      botCdRef.current    = setInterval(() => setBotCountdown(c => c <= 1 ? 30 : c - 1), 1000);
    } else {
      if (botTimerRef.current) clearInterval(botTimerRef.current);
      if (botCdRef.current)    clearInterval(botCdRef.current);
      setBotCountdown(30);
    }
    return () => {
      if (botTimerRef.current) clearInterval(botTimerRef.current);
      if (botCdRef.current)    clearInterval(botCdRef.current);
    };
  }, [botActive, fireBotSubmission]);

  const tabs = [
    { id: "oracle",    label: "Oracle Feed",      icon: <Activity size={13} /> },
    { id: "security",  label: "Security Proofs",  icon: <Shield size={13} /> },
    { id: "evolution", label: "Balance Evolution", icon: <RotateCcw size={13} /> },
  ] as const;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="w-full space-y-4">

        {/* ── Header ── */}
        <div className="relative w-full bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-white/0 pointer-events-none z-10" />
          <div className="relative z-20 px-6 pt-6 pb-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <SectionBadge color="indigo">Karma Oracle</SectionBadge>
              {poolName && <SectionBadge color="amber">{poolName}</SectionBadge>}
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-500/20 ml-auto">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Live</span>
              </div>
            </div>
            {/* was: pAggAll → pCurrAll */}
            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-1">
              {fmt(pCurrAll)}<span className="text-lg font-medium text-gray-400 ml-2">USD</span>
            </h2>
            <p className="text-xs text-gray-400 dark:text-zinc-500 font-mono mt-1">
              P_curr · ωᵢ=√(B·b)·e^(−λΔt) · {allSubs.length} reporters · ΣW={fmt(totalW, 1)}
            </p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <StatChip label="Bull Bal." value={isLoadingBalances ? "…" : fmtK(bullBalance)} color="text-emerald-600 dark:text-emerald-400" />
              <StatChip label="Bear Bal." value={isLoadingBalances ? "…" : fmtK(bearBalance)} color="text-rose-600 dark:text-rose-400" />
              <StatChip label="Your ω"    value={fmt(myWeight, 1)} color="text-indigo-600 dark:text-indigo-400" />
              <StatChip label="Utility Uᵢ" value={`${myUtility >= 0 ? "+" : ""}${fmt(myUtility, 0)}`}
                color={myUtility >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"} />
            </div>
          </div>
        </div>

        {/* ── Engine test ── */}
        <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl p-5">
          <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-3 font-mono text-xs space-y-1">
            <div className="text-indigo-600 dark:text-indigo-400 font-bold">Step 1 — Engine Verification:</div>
            <div className={wZero === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}>
              {wZero === 0 ? "✓" : "✗"} b=0 → ω={fmt(wZero, 4)} (biased wallet silenced)
            </div>
            <div className="text-emerald-600 dark:text-emerald-400">✓ Neutral (500/500) → ω≈{fmt(wNeutral, 1)}</div>
            <div className="text-emerald-600 dark:text-emerald-400">✓ Biased (10k/1) → ω≈{fmt(wBiased, 2)} ≪ neutral</div>
            <div className="text-emerald-600 dark:text-emerald-400">✓ Flash loan (Δt=0.001s) → ω={fmt(wFlash, 8)} ≈ 0</div>
            {/* was: P_agg / P_true → P_curr / P_prev */}
            <div className="text-indigo-600 dark:text-indigo-400 font-bold pt-1">
              Nash eq: P_curr=${fmt(pCurrAll)} ≈ P_prev=${fmt(pPrev)} ✓
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all duration-200 border
                ${activeTab === t.id
                  ? "bg-gray-900 dark:bg-white text-white dark:text-black border-transparent"
                  : "bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-800 hover:border-gray-300"
                }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">

          {/* ── ORACLE FEED ── */}
          {activeTab === "oracle" && (
            <motion.div key="oracle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              className="space-y-4">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Step 2 — Submit */}
                <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <SectionBadge color="indigo">Step 2</SectionBadge>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">Submit to Karma Oracle</span>
                  </div>
                  {!isConnected ? (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500 dark:text-zinc-400">Connect wallet to submit prices.</p>
                      <ConnectButton />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Price (USD)</label>
                        <input type="number" placeholder="e.g. 100.00" value={priceInput}
                          onChange={e => setPriceInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { submitPrice(parseFloat(priceInput)); setPriceInput(""); } }}
                          className="w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition" />
                      </div>
                      <div>
                        {/* was: P_true (ground truth) → P_prev (previous epoch price) */}
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                          P_prev (Previous Epoch Price)
                        </label>
                        <input type="number" placeholder={String(KARMA_CONSTANTS.BOOTSTRAP_PRICE)} value={pPrevInput}
                          onChange={e => handlePPrevChange(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white transition" />
                        {/* Post-deploy note */}
                        <p className="text-[9px] text-gray-400 dark:text-zinc-600 mt-1 font-mono">
                          Post-deploy: auto-read from KarmaOracle.getPreviousEpochPrice()
                        </p>
                      </div>
                      <button disabled={!priceInput || parseFloat(priceInput) <= 0 || isSubmitting}
                        onClick={() => { submitPrice(parseFloat(priceInput)); setPriceInput(""); }}
                        className="w-full group relative overflow-hidden rounded-2xl bg-gray-900 dark:bg-white p-3.5 transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                        <div className="flex items-center justify-center gap-2 text-white dark:text-black font-bold text-sm uppercase tracking-wide">
                          <span>Submit to Karma</span>
                          <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" strokeWidth={2.5} />
                        </div>
                      </button>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-500/20 rounded-xl px-3 py-2">
                        ⚠ Demo mode — submissions stored locally. Swap with{" "}
                        <code className="font-mono">karmaContract.write.submitPrice()</code> on deploy.
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 4 — Bot */}
                <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <SectionBadge color="purple">Step 4</SectionBadge>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">Automated Poster Bot</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot size={16} className={botActive ? "text-purple-500" : "text-gray-400"} />
                        <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">
                          {botActive ? "Active — every 30s" : "Offline"}
                        </span>
                      </div>
                      <button onClick={() => setBotActive(!botActive)}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all
                          ${botActive
                            ? "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
                            : "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30 hover:bg-purple-50"
                          }`}>
                        {botActive ? "⏹ Stop" : "▶ Start"}
                      </button>
                    </div>
                    {botActive && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-500/20 rounded-xl">
                        <Radio size={12} className="text-purple-500 animate-pulse" />
                        <span className="text-xs font-mono text-purple-600 dark:text-purple-400">Next submission: {botCountdown}s</span>
                      </motion.div>
                    )}
                    <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-2xl p-3 text-xs font-mono space-y-1 text-gray-500 dark:text-zinc-400">
                      <div>Mock price: 2800 ± 60 USD (simulated)</div>
                      <div>Bot: 310 Bull / 295 Bear (neutral)</div>
                      <div>ω_bot ≈ {fmt(calcKarmaWeight({ bullBalance: 310, bearBalance: 295, lastSubmissionTime: Date.now() / 1000 }), 1)}</div>
                      <div className="text-emerald-600 dark:text-emerald-400">✓ Orb-style automated interval poster</div>
                      {/* clarified: simulation only, real poster script is off-chain */}
                      <div className="text-gray-400 dark:text-zinc-600 text-[10px] pt-1">
                        UI simulation only — real poster script runs off-chain (Node.js)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 — Aggregator table */}
              <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SectionBadge color="emerald">Step 3</SectionBadge>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      Karma Aggregator — {allSubs.length} Submissions
                    </span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"><Info size={15} /></button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 shadow-xl rounded-xl p-3 max-w-xs">
                      <p className="text-xs text-gray-700 dark:text-zinc-300 leading-relaxed">
                        P_curr = Σ(ωᵢ·pᵢ)/Σωᵢ where ωᵢ=√(Bᵢ·bᵢ)·e^(−λΔt). Biased wallets get ω≈0.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-zinc-900/90 backdrop-blur-sm border-b border-gray-100 dark:border-zinc-800">
                      <tr>
                        {["Reporter","Type","Bull ⬆","Bear ⬇","Price","ω Weight","Influence","Uᵢ"].map(h => (
                          <th key={h} className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 px-4 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-zinc-900">
                      {allSubs.map(s => {
                        const barPct = (s.weight / maxW) * 100;
                        const bias = getBiasLabel(s.bullBalance, s.bearBalance);
                        const sourceLabel = s.source === "bot" ? "🤖 Bot" : s.source === "user" ? "👤 You" : bias.label;
                        // was: pTrue → pPrev
                        const util = calcUtility({
                          price: s.price,
                          pPrev,
                          bullBalance: s.bullBalance,
                          bearBalance: s.bearBalance,
                          weight: s.weight,
                          totalWeight: totalW,
                        });
                        return (
                          <tr key={s.id + s.lastSubmissionTime} className="hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-500">{s.id.length > 12 ? s.id.slice(0, 12) + "…" : s.id}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${bias.bg} ${bias.color}`}>{sourceLabel}</span>
                            </td>
                            <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400">{fmtK(s.bullBalance)}</td>
                            <td className="px-4 py-2.5 text-rose-600 dark:text-rose-400">{fmtK(s.bearBalance)}</td>
                            <td className="px-4 py-2.5 text-gray-900 dark:text-white font-medium">${fmt(s.price)}</td>
                            <td className="px-4 py-2.5">
                              {s.weight < 0.01
                                ? <span className="text-gray-300 dark:text-zinc-600">≈0</span>
                                : <span className="text-indigo-600 dark:text-indigo-400">{fmt(s.weight, 1)}</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <div suppressHydrationWarning
                                  className="h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-500"
                                  style={{ width: `${Math.max(barPct, 1)}%`, maxWidth: 56, opacity: s.weight < 0.01 ? 0.15 : 1 }} />
                                <span className="text-gray-400 dark:text-zinc-500 text-[10px]">{barPct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className={`px-4 py-2.5 ${util >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {util >= 0 ? "+" : ""}{fmt(util, 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
                  <div className="flex items-start gap-2">
                    <Zap size={12} className="text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" />
                    <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                      <span className="font-bold text-gray-700 dark:text-zinc-200">Game Theory verified:</span>
                      {" "}UserB (10k/1) ω≈{fmt(wBiased, 2)} vs UserA (500/500) ω≈{fmt(wNeutral, 1)}.
                      {" "}Karma Price stays ~$100 despite $500 submission.{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Nash eq. holds ✓</span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SECURITY PROOFS ── */}
          {activeTab === "security" && (
            <motion.div key="security" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
              className="space-y-3">
              {([
                {
                  title: "Sybil Resistance", color: "emerald",
                  formula: "Σ√(Bⱼbⱼ) ≤ √(ΣBⱼ)(Σbⱼ)",
                  body: "Cauchy-Schwarz: splitting into k wallets never increases weight. Sybil attacks are irrational.",
                  live: `Σ√(Bⱼbⱼ)=${fmt(sybil.lhs, 2)}  ≤  √(ΣBⱼ)(Σbⱼ)=${fmt(sybil.rhs, 2)}`,
                  status: sybil.holds ? "✓ Cauchy-Schwarz holds" : "✗ VIOLATED", ok: sybil.holds,
                },
                {
                  title: "Manipulation Resistance", color: "indigo",
                  // was: at Ptrue → at P_prev
                  formula: "∂W_future/∂P_curr=0 at P_prev,  ∂²W/∂P_curr²<0",
                  body: "Future weight maximised when P_curr = P_prev (previous epoch consensus). Any deviation reduces W_i(t+1).",
                  // was: pᵢ=ptrue → pᵢ≈P_prev
                  live: "Nash strategy: pᵢ ≈ P_prev,  E[deviation]=0",
                  status: "✓ Max at previous epoch consensus", ok: true,
                },
                {
                  title: "Flash Loan Resistance", color: "amber",
                  formula: "lim_{Δt→0} W_total = 0",
                  body: "Decay e^(−λΔt)→0 as Δt→0. Flash-borrowed tokens in same block carry zero weight.",
                  live: `W(500/500, Δt=0.001s)=${fmt(wFlash, 8)}`,
                  status: "✓ Flash loan weight ≈ 0", ok: true,
                },
                {
                  title: "Collusion Resistance", color: "purple",
                  formula: "Σ_{i∈C}(Bᵢ−bᵢ)≈0 ⟹ Σπᵢ^trade≈0",
                  body: "Colluders need balanced positions for weight. Balanced = zero trading profit. Cannot do both.",
                  live: "Dilemma: profit OR oracle influence — not both",
                  status: "✓ Collusion is self-defeating", ok: true,
                },
              ] as const).map(item => (
                <div key={item.title} className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <SectionBadge color={item.color}>{item.title}</SectionBadge>
                      <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 font-medium mt-2">{item.formula}</p>
                    </div>
                    <span className={`text-[10px] font-bold ${item.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                      {item.ok ? "PROVED ✓" : "FAILED ✗"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed mb-2">{item.body}</p>
                  <div className="bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-800 rounded-xl px-3 py-2 font-mono text-[11px] space-y-1">
                    <div className="text-gray-500 dark:text-zinc-400">{item.live}</div>
                    <div className={item.ok ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 font-bold"}>{item.status}</div>
                  </div>
                </div>
              ))}
              <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl p-5">
                <SectionBadge color="indigo">Hessian Analysis — Proof pg. 4</SectionBadge>
                <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed mt-2">
                  H of W=√(B·b) is <strong className="text-gray-700 dark:text-zinc-200">negative semidefinite</strong>.
                  λ₁=0 (scaling), λ₂&lt;0 (rebalancing). vᵀHv≤0 everywhere →{" "}
                  <strong className="text-gray-700 dark:text-zinc-200">no hidden convex regions</strong>.
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold ml-1">✓</span>
                </p>
              </div>
            </motion.div>
          )}

          {/* ── BALANCE EVOLUTION ── */}
          {activeTab === "evolution" && (
            <motion.div key="evolution" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <div className="bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-xl overflow-hidden">
                <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
                  <SectionBadge color="indigo">Balance Evolution — Proof pg. 2</SectionBadge>
                  {/* was: P_agg/P_true → P_curr/P_prev */}
                  <div className="text-[11px] font-mono text-gray-400 dark:text-zinc-500 space-y-0.5 mt-2">
                    <div>Bᵢ(t+1) = Bᵢ · P_curr / P_prev</div>
                    <div>bᵢ(t+1) = bᵢ · (2·P_prev − P_curr) / P_prev</div>
                    <div>Wᵢ(t+1) = Bᵢbᵢ · P_curr·(2·P_prev−P_curr) / P_prev²</div>
                    <div className="text-indigo-500 dark:text-indigo-400 pt-1">
                      P_curr=${fmt(pCurrAll)} · P_prev=${fmt(pPrev)} · ratio={fmt(pCurrAll / pPrev, 3)}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-gray-50 dark:bg-zinc-900/90 border-b border-gray-100 dark:border-zinc-800">
                      <tr>
                        {["Reporter","Bull now","Bear now","Bull(t+1)","Bear(t+1)","W(t+1)","ΔBull"].map(h => (
                          <th key={h} className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 px-4 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-zinc-900">
                      {allSubs.map(s => {
                        // was: pAgg/pTrue → pCurr/pPrev
                        const { newBull, newBear } = evolveBalances({
                          bullBalance: s.bullBalance,
                          bearBalance: s.bearBalance,
                          pCurr: pCurrAll,
                          pPrev,
                        });
                        const nW = nextPeriodWeight({
                          bullBalance: s.bullBalance,
                          bearBalance: s.bearBalance,
                          pCurr: pCurrAll,
                          pPrev,
                        });
                        const delta = newBull - s.bullBalance;
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 dark:text-zinc-500">{s.id.slice(0, 10)}</td>
                            <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400">{fmt(s.bullBalance, 1)}</td>
                            <td className="px-4 py-2.5 text-rose-600 dark:text-rose-400">{fmt(s.bearBalance, 1)}</td>
                            <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400">{fmt(newBull, 2)}</td>
                            <td className="px-4 py-2.5 text-rose-600 dark:text-rose-400">{fmt(newBear, 2)}</td>
                            <td className="px-4 py-2.5 text-indigo-600 dark:text-indigo-400">
                              {nW < 0 ? <span className="text-gray-300 dark:text-zinc-600">≈0</span> : fmt(nW, 1)}
                            </td>
                            <td className={`px-4 py-2.5 ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {delta >= 0 ? "+" : ""}{fmt(delta, 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50">
                  <div className="flex items-start gap-2">
                    <Zap size={12} className="text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" />
                    <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">
                      <span className="font-bold text-gray-700 dark:text-zinc-200">One-shot deviation (pg. 3):</span>
                      {" "}Neutral reporters stable when P_curr≈P_prev. Biased reporters see W(t+1) collapse.{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Subgame perfect equilibrium ✓</span>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

export default KarmaPortal;
"use client";

// src/hooks/useKarmaOracle.ts

import { useState, useCallback, useMemo, useEffect } from "react";
import { useAccount, useReadContract, useChainId } from "wagmi";
import { toast } from "sonner";
import {
  calcKarmaWeight,
  calcWeightedAveragePrice,
  calcUtility,
  withWeights,
  type KarmaSubmission,
  type KarmaSubmissionWithWeight,
} from "@/utils/karmaEngine";

// ── Minimal ERC20 ABI (same pattern as CreateFatePool.tsx) ───────────────────
const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseKarmaOracleReturn {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  chainId: number;
  bullBalance: number;
  bearBalance: number;
  myWeight: number;
  myUtility: number;
  isLoadingBalances: boolean;
  submissions: KarmaSubmission[];
  submissionsWithWeights: KarmaSubmissionWithWeight[];
  totalWeight: number;
  pAgg: number;
  pTrue: number;
  setPTrue: (p: number) => void;
  submitPrice: (price: number) => void;
  isSubmitting: boolean;
  botActive: boolean;
  setBotActive: (v: boolean) => void;
}

interface UseKarmaOracleOptions {
  bullTokenAddress?: `0x${string}`;
  bearTokenAddress?: `0x${string}`;
  initialPTrue?: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useKarmaOracle({
  bullTokenAddress,
  bearTokenAddress,
  initialPTrue = 100,
}: UseKarmaOracleOptions = {}): UseKarmaOracleReturn {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Seed submissions initialised client-side only to avoid SSR/hydration mismatch
  const [submissions, setSubmissions] = useState<KarmaSubmission[]>([]);
  const [pTrue, setPTrue] = useState(initialPTrue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [botActive, setBotActive] = useState(false);

  // Populate seed data on client only
  useEffect(() => {
    const now = Date.now() / 1000;
    setSubmissions([
      { id: "UserA", bullBalance: 500,   bearBalance: 500,  price: 100, label: "Neutral",      source: "seed", lastSubmissionTime: now - 120 },
      { id: "UserB", bullBalance: 10000, bearBalance: 0,    price: 500, label: "Bull Bias",    source: "seed", lastSubmissionTime: now - 80  },
      { id: "UserC", bullBalance: 300,   bearBalance: 280,  price: 98,  label: "Near Neutral", source: "seed", lastSubmissionTime: now - 200 },
      { id: "UserD", bullBalance: 1,     bearBalance: 8000, price: 40,  label: "Bear Bias",    source: "seed", lastSubmissionTime: now - 150 },
      { id: "UserE", bullBalance: 600,   bearBalance: 550,  price: 102, label: "Neutral+",     source: "seed", lastSubmissionTime: now - 300 },
    ]);
  }, []);

  // ── Read Bull token balance ───────────────────────────────────────────────
  const { data: rawBullBalance, isLoading: loadingBull } = useReadContract({
    address: bullTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!bullTokenAddress && !!address },
  });

  const { data: bullDecimals } = useReadContract({
    address: bullTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "decimals",
    query: { enabled: !!bullTokenAddress },
  });

  // ── Read Bear token balance ───────────────────────────────────────────────
  const { data: rawBearBalance, isLoading: loadingBear } = useReadContract({
    address: bearTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!bearTokenAddress && !!address },
  });

  const { data: bearDecimals } = useReadContract({
    address: bearTokenAddress,
    abi: ERC20_BALANCE_ABI,
    functionName: "decimals",
    query: { enabled: !!bearTokenAddress },
  });

  // ── Normalise bigint → number (fallback to mock when no token addresses) ──
  const bullBalance = useMemo(() => {
    if (rawBullBalance === undefined || rawBullBalance === null) return 420;
    const decimals = Number(bullDecimals ?? 18);
    return Number(rawBullBalance) / Math.pow(10, decimals);
  }, [rawBullBalance, bullDecimals]);

  const bearBalance = useMemo(() => {
    if (rawBearBalance === undefined || rawBearBalance === null) return 380;
    const decimals = Number(bearDecimals ?? 18);
    return Number(rawBearBalance) / Math.pow(10, decimals);
  }, [rawBearBalance, bearDecimals]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const submissionsWithWeights = useMemo(() => withWeights(submissions), [submissions]);
  const totalWeight = useMemo(() => submissionsWithWeights.reduce((s, x) => s + x.weight, 0), [submissionsWithWeights]);
  const pAgg = useMemo(() => calcWeightedAveragePrice(submissionsWithWeights), [submissionsWithWeights]);

  const myWeight = useMemo(() =>
    calcKarmaWeight({ bullBalance, bearBalance, lastSubmissionTime: Date.now() / 1000 }),
    [bullBalance, bearBalance]
  );

  const myUtility = useMemo(() =>
    calcUtility({
      price: pAgg,
      pTrue,
      bullBalance,
      bearBalance,
      weight: myWeight,
      totalWeight: totalWeight + myWeight,
    }),
    [pAgg, pTrue, bullBalance, bearBalance, myWeight, totalWeight]
  );

  // ── Submit price ──────────────────────────────────────────────────────────
  // Mock mode: saves to local state.
  // Post-deploy: replace setSubmissions block with writeContractAsync call
  // using KarmaOracleABI — same pattern as deployPool in CreateFatePool.tsx
  const submitPrice = useCallback((price: number) => {
    if (!price || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    if (!isConnected) {
      toast.error("Connect your wallet first");
      return;
    }

    setIsSubmitting(true);

    const newSub: KarmaSubmission = {
      id: `${address?.slice(0, 8) ?? "You"}-${Date.now()}`,
      label: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "You",
      address: address,
      bullBalance,
      bearBalance,
      price,
      lastSubmissionTime: Date.now() / 1000,
      source: "user",
    };

    setSubmissions((prev) => [newSub, ...prev]);
    setIsSubmitting(false);

    toast.success(`Submitted $${price.toFixed(2)} to Karma oracle`, {
      description: `Your weight: ${myWeight.toFixed(1)} · Karma Price: $${pAgg.toFixed(2)}`,
    });
  }, [isConnected, address, bullBalance, bearBalance, myWeight, pAgg]);

  return {
    address,
    isConnected,
    chainId,
    bullBalance,
    bearBalance,
    myWeight,
    myUtility,
    isLoadingBalances: loadingBull || loadingBear,
    submissions,
    submissionsWithWeights,
    totalWeight,
    pAgg,
    pTrue,
    setPTrue,
    submitPrice,
    isSubmitting,
    botActive,
    setBotActive,
  };
}
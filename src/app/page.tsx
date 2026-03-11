"use client";
import { KarmaPortal } from "@/components/KarmaOracle/KarmaPortal";

export default function KarmaPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <KarmaPortal poolName="ETH/USD" />
    </div>
  );
}
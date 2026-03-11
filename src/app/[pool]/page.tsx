import { Suspense } from "react";
import InteractionClient from "./InteractionClient";
import { KarmaPortal } from "@/components/KarmaOracle/KarmaPortal";

export async function generateStaticParams() {
  return [
    { pool: "pool" }
  ];
}

export default function PoolPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow">
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
          <InteractionClient />
        </Suspense>

        {/* Karma Oracle — integrated below pool interaction */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <KarmaPortal poolName="ETH/USD" />
        </div>

      </main>
    </div>
  );
}
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Intersection observer hook ────────────────────────────────
function useInView(threshold = 0.15): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ── Animated counter ──────────────────────────────────────────
function useCounter(target: number, duration: number = 1400, start: boolean = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return val;
}

// ── Live price ticker ─────────────────────────────────────────
function LivePriceTicker() {
  const [price, setPrice] = useState(100.21);
  useEffect(() => {
    const id = setInterval(() => {
      setPrice(p => +(p + (Math.random() - 0.49) * 0.6).toFixed(2));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const subs = [
    { id: "UserA", B: 500,   b: 500, price: 100, w: 488, pct: 90  },
    { id: "UserB", B: 10000, b: 0,   price: 500, w: 0,   pct: 0   },
    { id: "UserC", B: 300,   b: 280, price: 98,  w: 278, pct: 51  },
  ];

  return (
    <div className="w-full max-w-sm mx-auto bg-white dark:bg-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-2xl shadow-gray-200/60 dark:shadow-black/60 p-5 text-left">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/20 px-2 py-0.5 rounded-lg">Karma Price</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-500/20 px-2 py-0.5 rounded-lg">ETH/USD</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">LIVE</span>
        </div>
      </div>

      <div className="text-4xl font-black text-gray-900 dark:text-white tabular-nums mb-0.5">
        ${price.toFixed(2)}{" "}
        <span className="text-base font-medium text-gray-400">USD</span>
      </div>
      <div className="text-[10px] font-mono text-gray-400 dark:text-zinc-500 mb-4">
        ωᵢ=√(B·b)·e^(−λΔt) · 3 reporters
      </div>

      <div className="space-y-2">
        {subs.map(s => (
          <div key={s.id} className="flex items-center gap-2 text-xs font-mono">
            <span className="text-gray-400 w-10 shrink-0">{s.id}</span>
            <span className="text-emerald-600 dark:text-emerald-400 w-8 shrink-0">{s.B}</span>
            <span className="text-rose-500 dark:text-rose-400 w-6 shrink-0">{s.b}</span>
            <span className="text-gray-700 dark:text-zinc-300 w-12 shrink-0">${s.price}</span>
            <div className="flex-1 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${s.pct}%` }}
              />
            </div>
            {s.w === 0
              ? <span className="text-[10px] font-bold text-rose-500 shrink-0">IGNORED</span>
              : <span className="text-[10px] text-indigo-500 dark:text-indigo-400 shrink-0">ω={s.w}</span>
            }
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        ✓ UserB's $500 pump ignored — Nash equilibrium holds
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────
function Hero({ router }: { router: ReturnType<typeof useRouter> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white dark:bg-zinc-950 pt-16">
      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#000 1px,transparent 1px),linear-gradient(90deg,#000 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Glow blob */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-indigo-400/5 dark:bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 text-center">
        {/* Live badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/20 mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Live on Sepolia Testnet
          </span>
        </div>

        {/* Headline */}
        <h1 className={`text-5xl md:text-7xl lg:text-8xl font-black tracking-tight text-gray-900 dark:text-white leading-none mb-6 transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          Predict Markets.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-500 to-emerald-500">
            Earn Truth.
          </span>
        </h1>

        <p className={`text-lg md:text-xl text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          Fate is a decentralised prediction market secured by the{" "}
          <strong className="text-gray-800 dark:text-zinc-200">Karma Oracle</strong> —
          a manipulation-proof price feed where influence is earned through balance, not capital.
        </p>

        {/* CTAs */}
        <div className={`flex flex-wrap gap-3 justify-center mb-16 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <button
            onClick={() => router.push("/explorePools")}
            className="px-8 py-4 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-base hover:opacity-80 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-xl shadow-gray-900/20 dark:shadow-white/10"
          >
            Explore Markets →
          </button>
          <button
            onClick={() => router.push("/karma")}
            className="px-8 py-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white font-bold text-base hover:bg-gray-50 dark:hover:bg-zinc-800 hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            Karma Oracle
          </button>
        </div>

        {/* Widget */}
        <div className={`transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
          <LivePriceTicker />
        </div>
      </div>
    </section>
  );
}
// ── Karma explainer ───────────────────────────────────────────
function KarmaExplainer({ router }: { router: ReturnType<typeof useRouter> }) {
  const [ref, inView] = useInView();

  return (
    <section ref={ref} className="py-24 bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

          {/* Left — copy */}
          <div className={`transition-all duration-700 ${inView ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">The Karma Oracle</p>
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-4">
              A price oracle you can't buy your way into
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 leading-relaxed mb-6 text-sm">
              Traditional oracles can be manipulated by anyone with enough capital. Karma makes this
              mathematically impossible. Your influence is determined by how{" "}
              <strong className="text-gray-700 dark:text-zinc-200">balanced</strong> your Bull/Bear
              position is — hold equal amounts of both to maximise your weight.
            </p>

            <div className="space-y-2.5 mb-8">
              {[
                { title: "Balance = Power",         desc: "ω = √(B·b) — hold equal Bull and Bear to maximise influence" },
                { title: "Flash Loans = Zero Weight", desc: "e^(−λΔt) → 0 as Δt → 0 — borrowed capital is ignored" },
                { title: "Truth-Telling Pays",       desc: "Nash equilibrium: honest reporters maximise long-run utility" },
                { title: "Sybil-Proof",              desc: "Cauchy-Schwarz: splitting wallets never increases total weight" },
              ].map(item => (
                <div key={item.title} className="flex items-start gap-3 p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">

                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{item.title}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => router.push("/karma")}
              className="px-6 py-3 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-black font-bold text-sm hover:opacity-80 hover:-translate-y-0.5 transition-all shadow-lg"
            >
              Open Karma Oracle → (scroll down post the loading bar)
            </button>
          </div>

          {/* Right — proof cards + terminal */}
          <div className={`space-y-3 transition-all duration-700 delay-200 ${inView ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            {[
              { label: "Sybil Resistance",   method: "Cauchy-Schwarz", formula: "Σ√(Bⱼbⱼ) ≤ √(ΣBⱼ)(Σbⱼ)", color: "emerald" },
              { label: "Manipulation Proof", method: "Concavity",      formula: "∂²W/∂P²_agg < 0",           color: "indigo"  },
              { label: "Flash Loan Proof",   method: "Time Decay",     formula: "lim_{Δt→0} W = 0",          color: "amber"   },
              { label: "Collusion Proof",    method: "Nash Dilemma",   formula: "Σ(Bᵢ−bᵢ)≈0 ⟹ Σπᵢ≈0",   color: "purple"  },
            ].map(p => {
              const cls = {
                emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/20",
                indigo:  "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-500/20",
                amber:   "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/20",
                purple:  "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-500/20",
              }[p.color];
              return (
                <div key={p.label} className="bg-white dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-800 p-3.5 shadow-sm flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 rounded-lg ${cls}`}>{p.label}</span>
                      <span className="text-[10px] text-gray-400">{p.method}</span>
                    </div>
                    <div className="text-xs font-mono text-gray-500 dark:text-zinc-400">{p.formula}</div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">✓ PROVED</span>
                </div>
              );
            })}

            {/* Terminal */}
            <div className="bg-zinc-900 dark:bg-zinc-800 rounded-2xl p-4 font-mono text-xs space-y-1 border border-zinc-700">
              <div className="text-emerald-400 font-bold mb-2">// Live Nash Equilibrium Demo</div>
              <div className="text-zinc-400">UserB: B=10,000  b=0  price=$500</div>
              <div className="text-zinc-500">ω = √(10000 × 0) × e^(−λΔt)</div>
              <div className="text-rose-400 font-bold">ω = 0.00  ← pump attempt silenced</div>
              <div className="text-zinc-400 mt-1.5">UserA: B=500  b=500  price=$100</div>
              <div className="text-emerald-400 font-bold">ω = 500  ← honest reporter wins</div>
              <div className="text-indigo-400 font-bold mt-2">P_agg = $100.21  ✓ truth prevails</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats bar ─────────────────────────────────────────────────
function StatsBar() {
  const [ref, inView] = useInView();
  const c1 = useCounter(4,   1200, inView);
  const c2 = useCounter(100, 1500, inView);
  const c3 = useCounter(0,   800,  inView);

  return (
    <section ref={ref} className="py-14 bg-gray-900 border-y border-gray-800">
      <div className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-3 gap-6 text-center">
          {[
            { val: c1,    suf: " Proofs",   label: "Game-theoretic security proofs", color: "text-emerald-400" },
            { val: c2,    suf: "%",         label: "Manipulation-proof by design",   color: "text-indigo-400"  },
            { val: c3,    suf: " Backend",  label: "Lean — no server, no custodian", color: "text-amber-400"   },
          ].map(s => (
            <div key={s.label} className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
              <div className={`text-4xl md:text-5xl font-black tabular-nums ${s.color}`}>{s.val}{s.suf}</div>
              <div className="text-xs text-zinc-500 mt-1.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Feature grid ──────────────────────────────────────────────
function FeatureGrid({ router }: { router: ReturnType<typeof useRouter> }) {
  const [ref, inView] = useInView();

  const cards = [
    {
      title: "Explore Pools",
      desc: "Browse all active Bull/Bear pools across any supported asset. Filter by chain, asset, or TVL. See live sentiment and pool health at a glance. See live prices, sentiment percentages, and pool sizes. Pick a market and take a position.",
      href: "/explorePools", cta: "Browse Markets",
      gradient: "from-indigo-50 dark:from-indigo-950/20",
    },
    {
      title: "Create a Pool",
      desc: "Deploy your own prediction market on any supported EVM chain. Connect to Chainlink price feeds, name your Bull/Bear tokens, set fees, and go live — no backend needed.",
      href: "/createPool", cta: "Create Market",
      gradient: "from-emerald-50 dark:from-emerald-950/20",
    },
    {
      title: "Karma Oracle",
      desc: "Submit prices as a reporter.Your influence is determined by how balanced your Bull/Bear position is — not how wealthy you are. Honest reporters earn more over time. Your weight ω=√(B·b) means balanced positions dominate. Flash loans, Sybil attacks, and collusion are mathematically blocked.",
      href: "/karma", cta: "Open Oracle",
      gradient: "from-amber-50 dark:from-amber-950/20",
    },
    {
      title: "Your Portfolio",
      desc: "Track every open position, Bull/Bear balance, and transaction across Ethereum, Sepolia, ETC, Polygon, Base, and BSC in one place.",
      href: "/portfolio", cta: "View Portfolio",
      gradient: "from-purple-50 dark:from-purple-950/20",
    },
  ];

  return (
    <section ref={ref} className="py-24 bg-gray-50 dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-12 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-3">Everything in one place</p>
          <h2 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
            The complete protocol
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">No backend. No custodian. No middleman.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c, i) => (
            <button
              key={c.title}
              onClick={() => router.push(c.href)}
              className={`group text-left bg-gradient-to-br ${c.gradient} to-white dark:to-zinc-950 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-lg p-6 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {c.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400 leading-relaxed mb-4">{c.desc}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-zinc-300">
                {c.cta}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
                  className="group-hover:translate-x-0.5 transition-transform">
                  <path d="M2 5h6M5 2l3 3-3 3" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────
function FinalCTA({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <section className="py-28 bg-gray-900 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="mx-auto mb-6 opacity-70">
          <path d="M22 3L41 13.5V30.5L22 41L3 30.5V13.5L22 3Z" stroke="white" strokeWidth="1.5" fill="none" />
          <path d="M22 3L22 41M3 13.5L41 30.5M41 13.5L3 30.5" stroke="white" strokeWidth="0.8" opacity="0.2" />
        </svg>
        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
          Ready to start?
        </h2>
        <p className="text-zinc-400 mb-10 text-base leading-relaxed max-w-xl mx-auto">
          Fate Protocol combines prediction markets with a manipulation-proof oracle — built for the next generation of decentralised finance.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => router.push("/explorePools")}
            className="px-8 py-4 rounded-2xl bg-white text-black font-bold hover:bg-gray-100 hover:-translate-y-0.5 transition-all shadow-xl"
          >
            Explore Markets →
          </button>
          <button
            onClick={() => router.push("/karma")}
            className="px-8 py-4 rounded-2xl border border-zinc-700 text-white font-bold hover:bg-zinc-800 hover:-translate-y-0.5 transition-all"
          >
            Karma Oracle
          </button>
          <button
            onClick={() => router.push("/createPool")}
            className="px-8 py-4 rounded-2xl border border-zinc-700 text-white font-bold hover:bg-zinc-800 hover:-translate-y-0.5 transition-all"
          >
            Create a Pool
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Root export ───────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-zinc-950 text-gray-900 dark:text-white">
      <Hero router={router} />
      {/* <HowItWorks router={router} /> */}
      <KarmaExplainer router={router} />
      <StatsBar />
      <FeatureGrid router={router} />
      <FinalCTA router={router} />
    </div>
  );
};
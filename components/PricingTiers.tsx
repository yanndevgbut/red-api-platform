"use client";

import React from "react";
import { Check, X } from "lucide-react";

export default function PricingTiers() {
  const plans = [
    {
      name: "FREE TIER",
      tag: "STARTER",
      price: "RP 0",
      period: "Selamanya gratis",
      isFeatured: false,
      btnLabel: "CURRENT PLAN",
      btnClass: "border border-surface-border hover:border-zinc-500 text-white",
      features: [
        { text: "100 Request / Hari", available: true },
        { text: "Akses Basic Endpoints", available: true },
        { text: "Shared Rate-limiting", available: true },
        { text: "Akses AI & VIP Scraper", available: false },
        { text: "Dedicated Node Bandwidth", available: false },
      ],
    },
    {
      name: "BASIC PLAN",
      tag: "POPULAR",
      price: "RP 25.000",
      period: "/ Bulan aktif",
      isFeatured: false,
      btnLabel: "UPGRADE BASIC",
      btnClass: "bg-zinc-800 hover:bg-zinc-700 text-white",
      features: [
        { text: "3,000 Request / Hari", available: true },
        { text: "Akses Full Tools & Stalker", available: true },
        { text: "Fast Response Node", available: true },
        { text: "Reset Kuota Tiap 00:00 WIB", available: true },
        { text: "Priority VIP Support", available: false },
      ],
    },
    {
      name: "VIP PLAN",
      tag: "MOST CHOICE",
      price: "RP 50.000",
      period: "/ Bulan aktif",
      isFeatured: true,
      btnLabel: "GET VIP NOW",
      btnClass: "bg-red-600 hover:bg-red-500 text-black font-bebas text-2xl tracking-wider active:scale-95",
      features: [
        { text: "15,000 Request / Hari", available: true },
        { text: "Akses ALL AI Models & Scrapers", available: true },
        { text: "High Concurrency (No 429)", available: true },
        { text: "WhatsApp Bot Ready", available: true },
        { text: "Telegram VIP Lounge", available: true },
      ],
    },
    {
      name: "ENTERPRISE",
      tag: "UNLIMITED",
      price: "RP 150.000",
      period: "/ Bulan aktif",
      isFeatured: false,
      btnLabel: "CONTACT ENTERPRISE",
      btnClass: "border border-red-700 text-red-400 hover:bg-red-950/40",
      features: [
        { text: "UNLIMITED Requests / Hari", available: true },
        { text: "Dedicated Pterodactyl Sub-Node", available: true },
        { text: "Custom Endpoint Request", available: true },
        { text: "99.99% Guaranteed SLA", available: true },
        { text: "1-on-1 Direct Admin Support", available: true },
      ],
    },
  ];

  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <h2 className="font-bebas text-5xl sm:text-6xl text-white tracking-wide">
          SIMPLE, SCALABLE <span className="text-red-600">TIERS</span>
        </h2>
        <p className="text-zinc-400 text-sm">
          Pilih paket sesuai kebutuhan kuota API, traffic bot, atau integrasi aplikasi Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`bg-surface-panel p-6 rounded-lg flex flex-col justify-between space-y-6 relative transition-all ${
              p.isFeatured
                ? "border-2 border-red-600 shadow-[0_0_25px_rgba(220,38,38,0.25)] hover:shadow-[0_0_35px_rgba(220,38,38,0.45)]"
                : "border border-surface-border hover:border-zinc-600"
            }`}
          >
            {p.isFeatured && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-black text-[10px] font-mono-code font-bold px-3 py-0.5 uppercase tracking-wider rounded">
                RECOMMENDED
              </div>
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-center pt-1">
                <span className={`font-bebas text-2xl ${p.isFeatured ? "text-red-500 text-3xl" : "text-zinc-200"}`}>
                  {p.name}
                </span>
                <span
                  className={`text-[10px] font-mono-code px-2 py-0.5 rounded font-bold uppercase ${
                    p.isFeatured ? "bg-red-600 text-black" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {p.tag}
                </span>
              </div>

              <div>
                <div className="font-bebas text-5xl text-white">{p.price}</div>
                <span className="text-xs font-mono-code text-zinc-500">{p.period}</span>
              </div>

              <ul className="text-xs font-mono-code space-y-2.5 text-zinc-300 border-t border-surface-border pt-4">
                {p.features.map((f, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 ${f.available ? "text-zinc-300" : "text-zinc-600"}`}
                  >
                    {f.available ? (
                      <Check className="w-3.5 h-3.5 text-red-500" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-zinc-700" />
                    )}
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => alert(`Redirecting to checkout for ${p.name}...`)}
              className={`w-full py-2.5 rounded font-bebas text-xl tracking-wider uppercase transition-colors ${p.btnClass}`}
            >
              {p.btnLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

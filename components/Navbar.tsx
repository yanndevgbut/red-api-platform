"use client";

import React, { useEffect, useState } from "react";
import { Terminal, Shield, Menu } from "lucide-react";
import { Profile } from "@/types";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openDrawer: () => void;
  user: Profile | null;
}

export default function Navbar({ activeTab, setActiveTab, openDrawer, user }: NavbarProps) {
  const [ping, setPing] = useState<number | null>(null);

  useEffect(() => {
    async function checkPing() {
      const start = Date.now();
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://103.155.224.102:3016";
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setPing(Date.now() - start);
        } else {
          setPing(null);
        }
      } catch {
        setPing(null);
      }
    }

    checkPing();
    const interval = setInterval(checkPing, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-surface-border bg-surface/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab("landing")} className="flex items-center gap-2 group text-left">
            <div className="w-8 h-8 bg-red-600 flex items-center justify-center font-bebas text-2xl text-black font-bold transform -skew-x-6 group-hover:scale-105 transition-transform">
              R
            </div>
            <div className="flex flex-col">
              <span className="font-bebas text-2xl tracking-wider leading-none text-white flex items-center gap-1">
                RED<span className="text-red-600">/API</span>
              </span>
              <span className="text-[9px] font-mono-code text-surface-muted tracking-widest leading-none">V2.4 PRODUCTION</span>
            </div>
          </button>

          {/* System Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 ml-4 px-2.5 py-1 bg-surface-panel border border-surface-border rounded text-[11px] font-mono-code">
            <span className={`w-1.5 h-1.5 rounded-full ${ping !== null ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-zinc-400">PTERO NODE:</span>
            <span className={ping !== null ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              {ping !== null ? `${ping}ms` : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1 text-xs font-mono-code tracking-wider uppercase">
          {[
            { id: "landing", label: "OVERVIEW" },
            { id: "docs", label: "DOCS & TESTER" },
            { id: "pricing", label: "PRICING" },
            { id: "profile", label: "PROFILE & KEY" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1.5 rounded transition-all ${
                activeTab === item.id
                  ? "bg-surface-panel text-white border border-surface-border"
                  : "text-zinc-300 hover:text-white hover:bg-surface-panel"
              }`}
            >
              {item.label}
            </button>
          ))}

          {/* Admin Panel Link */}
          <button
            onClick={() => setActiveTab("admin")}
            className={`px-3 py-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-red-900/50 transition-all flex items-center gap-1.5 ${
              activeTab === "admin" ? "bg-red-950/60 font-bold" : ""
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            ADMIN PANEL
          </button>
        </nav>

        {/* Right Quick Info & Drawer Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab("profile")}
            className="hidden sm:flex items-center gap-2 bg-surface-card border border-surface-border px-3 py-1.5 rounded hover:border-red-600/50 transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-xs font-mono-code font-bold text-zinc-200">
              {user ? user.username : "demo_user"}
            </span>
            <span className="text-[10px] bg-red-950 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase font-mono-code font-bold">
              {user ? user.plan.toUpperCase() : "VIP"}
            </span>
          </button>

          {/* Drawer Trigger */}
          <button
            onClick={openDrawer}
            className="p-2 bg-surface-card border border-surface-border rounded hover:border-red-600 transition-colors text-zinc-300 hover:text-white flex items-center gap-1.5"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs font-mono-code hidden sm:inline">MENU</span>
          </button>
        </div>

      </div>
    </header>
  );
}

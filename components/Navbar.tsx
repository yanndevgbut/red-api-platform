"use client";

import React, { useEffect, useState } from "react";
import { Terminal, Shield, Menu, Lock, LogIn, LogOut, User } from "lucide-react";
import { Profile } from "@/types";
import { API_BASE } from "@/lib/api";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openDrawer: () => void;
  user: Profile | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  openDrawer,
  user,
  onLoginClick,
  onLogoutClick,
}: NavbarProps) {
  const [ping, setPing] = useState<number | null>(null);

  useEffect(() => {
    async function checkPing() {
      const start = Date.now();
      try {
        const baseUrl = API_BASE;
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
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

  const navItems = [
    { id: "landing", label: "OVERVIEW", protected: false },
    { id: "docs", label: "DOCS & TESTER", protected: true },
    { id: "pricing", label: "PRICING", protected: false },
    { id: "profile", label: "PROFILE & KEY", protected: true },
  ];

  return (
    <header className="border-b border-surface-border bg-surface/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 py-2 flex items-center justify-between gap-2">
        
        {/* Logo */}
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab("landing")} className="flex items-center gap-2 group text-left">
            <div className="w-8 h-8 bg-red-600 flex items-center justify-center font-bebas text-2xl text-black font-bold transform -skew-x-6 group-hover:scale-105 transition-transform">
              R
            </div>
            <div className="flex flex-col">
              <span className="font-bebas text-2xl tracking-wider leading-none text-white flex items-center gap-1">
                RED<span className="text-red-600"> API</span>
              </span>
              <span className="text-[9px] font-mono-code text-surface-muted tracking-widest leading-none">V2.4 PRODUCTION</span>
            </div>
          </button>

          {/* System Status Indicator */}
          <div className="hidden md:flex items-center gap-2 ml-2 px-2.5 py-1 bg-surface-panel border border-surface-border rounded text-[11px] font-mono-code">
            <span className={`w-1.5 h-1.5 rounded-full ${ping !== null ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-zinc-400">PTERO NODE:</span>
            <span className={ping !== null ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              {ping !== null ? `${ping}ms` : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden xl:flex items-center gap-1 text-xs font-mono-code tracking-wider uppercase">
          {navItems.map((item) => {
            const isLocked = item.protected && !user;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded transition-all flex items-center gap-1.5 ${
                  activeTab === item.id
                    ? "bg-surface-panel text-white border border-surface-border"
                    : "text-zinc-300 hover:text-white hover:bg-surface-panel"
                }`}
              >
                {isLocked && <Lock className="w-3 h-3 text-red-500" />}
                {item.label}
              </button>
            );
          })}

          {/* Admin Panel Link */}
          <button
            onClick={() => setActiveTab("admin")}
            className={`px-3 py-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-red-900/50 transition-all flex items-center gap-1.5 ${
              activeTab === "admin" ? "bg-red-950/60 font-bold" : ""
            }`}
          >
            {!user ? <Lock className="w-3 h-3 text-red-500" /> : <Shield className="w-3.5 h-3.5" />}
            ADMIN PANEL
          </button>
        </nav>

        {/* Right User State & Drawer Trigger */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("profile")}
                className="hidden md:flex max-w-[12rem] min-w-0 items-center gap-2 bg-surface-card border border-surface-border px-3 py-1.5 rounded hover:border-red-600/50 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="min-w-0 truncate text-xs font-mono-code font-bold text-zinc-200">
                  {user.username}
                </span>
                <span className="text-[10px] bg-red-950 border border-red-800 text-red-300 px-1.5 py-0.5 rounded uppercase font-mono-code font-bold">
                  {user.plan.toUpperCase()}
                </span>
              </button>

              <button
                onClick={onLogoutClick}
                title="Keluar / Logout"
                className="p-2 bg-surface-card border border-surface-border rounded hover:border-red-600 hover:bg-red-950/30 text-zinc-400 hover:text-red-400 transition-colors"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="action-button px-2 sm:px-3.5 py-2 bg-red-500 hover:bg-red-500 text-black font-mono-code text-xs font-bold rounded flex items-center gap-1.5 transition-transform active:scale-95 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>MASUK<span className="hidden min-[370px]:inline"> GOOGLE</span></span>
            </button>
          )}

          {/* Drawer Trigger */}
          <button
            onClick={openDrawer}
            className="p-2 bg-surface-card border border-surface-border rounded hover:border-red-600 transition-colors text-zinc-300 hover:text-white flex items-center gap-1.5"
            aria-label="Buka menu navigasi"
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs font-mono-code hidden sm:inline">MENU</span>
          </button>
        </div>

      </div>
    </header>
  );
}

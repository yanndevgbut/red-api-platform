"use client";

import React, { useEffect, useRef } from "react";
import { X, ArrowRight, Server, Shield, Database, Lock, LogIn, LogOut } from "lucide-react";
import { Profile } from "@/types";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: string) => void;
  user: Profile | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export default function Drawer({
  isOpen,
  onClose,
  setActiveTab,
  user,
  onLoginClick,
  onLogoutClick,
}: DrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isOpen]);

  const handleNav = (tabId: string) => {
    setActiveTab(tabId);
    onClose();
  };

  const navItems = [
    { id: "landing", label: "01. OVERVIEW & TELEMETRY", protected: false },
    { id: "docs", label: "02. DOCS & TESTER (INLINE)", protected: true },
    { id: "pricing", label: "03. PRICING TIERS", protected: false },
    { id: "profile", label: "04. PROFILE & API KEYS", protected: true },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Slide-over Drawer from Right */}
      <aside
        inert={!isOpen}
        aria-hidden={!isOpen}
        aria-label="Menu navigasi"
        onKeyDown={event => { if (event.key === "Escape") onClose(); }}
        className={`fixed inset-y-0 right-0 w-full max-w-[22rem] sm:max-w-sm bg-surface-panel border-l border-surface-border z-50 transform transition-transform duration-300 ease-out shadow-2xl flex flex-col justify-between ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Top Header */}
        <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-card/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-600 rounded-sm" />
            <span className="font-bebas text-2xl text-white tracking-wider">NAVIGATION DRAWER</span>
          </div>
          <button
            ref={closeButton}
            onClick={onClose}
            aria-label="Tutup menu navigasi"
            className="w-8 h-8 shrink-0 rounded border border-surface-border bg-surface hover:bg-red-950/50 hover:border-red-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 font-mono-code text-xs">
          
          {/* User Status Card */}
          {user ? (
            <div className="bg-surface-card border border-surface-border p-3.5 rounded space-y-2">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-zinc-400">ACTIVE ACCOUNT:</span>
                <span className="px-1.5 py-0.2 bg-red-950 border border-red-800 text-red-300 text-[10px] rounded font-bold uppercase">
                  {user.plan} TIER
                </span>
              </div>
              <div className="text-sm font-bold text-white truncate">
                {user.username}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {user.email}
              </div>
              <div className="text-[10px] text-zinc-500 pt-1 border-t border-surface-border">
                Quota: {user.limit_remaining.toLocaleString()} / {user.limit_daily.toLocaleString()} requests
              </div>
              <button
                onClick={() => {
                  onClose();
                  onLogoutClick();
                }}
                className="w-full mt-2 py-1.5 px-3 bg-red-950/40 hover:bg-red-950 border border-red-800 text-red-300 rounded text-[11px] flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                KELUAR DARI AKUN
              </button>
            </div>
          ) : (
            <div className="bg-surface-card border border-red-900/40 p-3.5 rounded space-y-2.5">
              <div className="flex items-center gap-1.5 text-red-400 font-bold text-[11px]">
                <Lock className="w-3.5 h-3.5" />
                STATUS: BELUM LOGIN
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Login akun Google untuk membuka akses Docs, Playground Tester, dan generate API Key.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onLoginClick();
                }}
                className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 text-black font-bold rounded text-xs flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                MASUK DENGAN GOOGLE
              </button>
            </div>
          )}

          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1 pt-2">
            PAGES & VIEWS
          </div>

          <div className="space-y-2">
            {navItems.map((item) => {
              const isLocked = item.protected && !user;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className="w-full text-left py-2.5 px-3 rounded bg-surface-card/40 hover:bg-surface-card border border-transparent hover:border-surface-border flex items-center justify-between group transition-all"
                >
                  <span className="text-zinc-200 group-hover:text-white flex items-center gap-2">
                    {isLocked && <Lock className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                    {item.label}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-red-500 group-hover:translate-x-0.5 transition-transform" />
                </button>
              );
            })}

            <button
              onClick={() => handleNav("admin")}
              className="w-full text-left py-2.5 px-3 rounded bg-red-950/30 hover:bg-red-950/60 border border-red-900/60 flex items-center justify-between group transition-all"
            >
              <span className="text-red-300 font-bold flex items-center gap-2">
                {!user ? (
                  <Lock className="w-3.5 h-3.5 text-red-500" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                05. MASTER ADMIN CONSOLE
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-red-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Quick Info */}
          <div className="pt-4 border-t border-surface-border space-y-2 text-[11px] text-zinc-400">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1">
              SYSTEM STATUS
            </div>
            <div className="flex items-center justify-between py-1 px-1">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                Pterodactyl Node:
              </span>
              <span className="text-emerald-400 font-bold">Lihat status</span>
            </div>
            <div className="flex items-center justify-between py-1 px-1">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-zinc-500" />
                Supabase Engine:
              </span>
              <span className="text-zinc-300">Auth & database</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-surface-border bg-surface/50 text-xs font-mono-code text-zinc-500 flex flex-wrap gap-2 justify-between items-center">
          <span>RED API INFRASTRUCTURE</span>
          <span className="text-red-500 font-bold">2026</span>
        </div>
      </aside>
    </>
  );
}

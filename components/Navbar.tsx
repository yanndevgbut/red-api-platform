"use client";

import { LogIn, Menu, Shield } from "lucide-react";
import { BrandIcon } from "@/components/BrandLogo";
import { portalNavigation } from "@/lib/portal-navigation";
import type { Profile } from "@/types";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openDrawer: () => void;
  drawerOpen: boolean;
  user: Profile | null;
  onLoginClick: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  openDrawer,
  drawerOpen,
  user,
  onLoginClick,
}: NavbarProps) {
  const isAdmin = user?.role === "admin" && user.banned === false;

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <button
          type="button"
          aria-label="Beranda RED API"
          onClick={() => setActiveTab("landing")}
          className="flex shrink-0 items-center gap-2 text-left"
        >
          <BrandIcon decorative className="h-9 w-9" />
          <span className="font-bebas text-2xl leading-none text-white">
            RED <span className="text-red-400">API</span>
          </span>
        </button>
        <nav
          aria-label="Navigasi utama"
          className="hidden items-center gap-1 lg:flex"
        >
          {portalNavigation.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              className={`rounded-lg border border-transparent px-3 py-2 font-mono-code text-xs ${activeTab === id ? "border-red-900/70 bg-red-950/40 text-red-100" : "text-zinc-400 hover:bg-surface-card hover:text-white"}`}
            >
              {label}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              aria-current={activeTab === "admin" ? "page" : undefined}
              onClick={() => setActiveTab("admin")}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-950/50"
            >
              <Shield className="h-4 w-4" aria-hidden="true" /> Panel admin
            </button>
          )}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {!user && (
            <button
              type="button"
              onClick={onLoginClick}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" /> Masuk
            </button>
          )}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Buka menu navigasi"
            aria-controls="portal-navigation"
            aria-expanded={drawerOpen}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-surface-border px-2.5 text-sm text-zinc-200 hover:bg-surface-card"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      </div>
    </header>
  );
}

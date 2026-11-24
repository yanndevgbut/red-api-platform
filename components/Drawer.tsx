"use client";

import { useEffect, useRef } from "react";
import {
  Bug,
  ChevronRight,
  Lock,
  LogIn,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import { portalNavigation } from "@/lib/portal-navigation";
import type { Profile } from "@/types";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: Profile | null;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export default function Drawer({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  user,
  onLoginClick,
  onLogoutClick,
}: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen && !element.open) element.showModal();
    if (!isOpen && element.open) element.close();
  }, [isOpen]);

  function close() {
    dialog.current?.close();
    onClose();
  }

  function go(tab: string) {
    close();
    setActiveTab(tab);
  }

  const rowClass = (id: string) =>
    `flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${activeTab === id ? "bg-surface-card font-semibold text-white" : "text-zinc-300 hover:bg-surface-card hover:text-white"}`;
  return (
    <dialog
      ref={dialog}
      id="portal-navigation"
      aria-labelledby="portal-navigation-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="portal-drawer fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[22rem] border-l border-surface-border bg-surface-panel p-0 text-white backdrop:bg-black/70"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-surface-border p-4">
          <h2 id="portal-navigation-title" className="text-lg font-semibold">
            Menu
          </h2>
          <button
            type="button"
            autoFocus
            onClick={close}
            aria-label="Tutup menu navigasi"
            className="grid h-11 w-11 place-items-center rounded-lg text-zinc-300 hover:bg-surface-card"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
          <nav aria-label="Halaman RED API" className="space-y-1">
            {portalNavigation.map(({ id, label, requiresAccount }) => (
              <button
                key={id}
                type="button"
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => go(id)}
                className={rowClass(id)}
              >
                <span>{label}</span>
                {requiresAccount && !user ? (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight
                    className="h-4 w-4 text-zinc-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
            <button
              type="button"
              aria-current={activeTab === "bug-report" ? "page" : undefined}
              onClick={() => go("bug-report")}
              className={rowClass("bug-report")}
            >
              <span>Laporkan Bug</span>
              <Bug className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            </button>
            {user?.role === "admin" && user.banned === false && (
              <button
                type="button"
                aria-current={activeTab === "admin" ? "page" : undefined}
                onClick={() => go("admin")}
                className={rowClass("admin")}
              >
                <span>Panel admin</span>
                <Shield className="h-4 w-4 text-red-400" aria-hidden="true" />
              </button>
            )}
          </nav>
          <div className="space-y-3 border-t border-surface-border pt-4">
            {user ? (
              <>
                <div className="min-w-0 px-3">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.username}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onLogoutClick();
                  }}
                  className={rowClass("")}
                >
                  <span>Keluar</span>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  close();
                  onLoginClick();
                }}
                className={rowClass("")}
              >
                <span>Masuk dengan Google</span>
                <LogIn className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

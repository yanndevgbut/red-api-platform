"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone, Wallet, ArrowUpRight, List, Menu, Plus, ScrollText, Settings, Tags, Users, X } from "lucide-react";
import { adminSections, type AdminSection } from "@/lib/admin-navigation";

const icons = { announcements: Megaphone, payments: Wallet, registry: List, add: Plus, users: Users, logs: ScrollText, settings: Settings, categories: Tags };

export default function AdminNavigation({ section }: { section: AdminSection }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);

  function closeMenu() {
    setOpen(false);
    timer.current = setTimeout(() => {
      dialog.current?.close();
      trigger.current?.focus();
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250);
  }

  function openMenu() {
    clearTimeout(timer.current);
    dialog.current?.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <button ref={trigger} type="button" onClick={openMenu} aria-label="Buka menu admin" aria-expanded={open} aria-controls="admin-navigation"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-card text-white transition-colors hover:border-red-500 hover:bg-red-950/40">
        <Menu className="h-5 w-5" />
      </button>
      <dialog id="admin-navigation" ref={dialog} data-open={open} aria-labelledby="admin-menu-title"
        onCancel={event => { event.preventDefault(); closeMenu(); }}
        onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}
        className="admin-navigation border-l border-surface-border bg-surface-panel p-0 text-zinc-100 shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-surface-border p-5">
            <div>
              <p className="font-mono-code text-[10px] tracking-widest text-red-400">RED API</p>
              <h2 id="admin-menu-title" className="font-bebas text-3xl">MENU ADMIN</h2>
            </div>
            <button autoFocus type="button" onClick={closeMenu} aria-label="Tutup menu admin" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-border hover:border-red-500">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav aria-label="Halaman admin" className="flex-1 space-y-2 overflow-y-auto p-4">
            {adminSections.map(item => {
              const Icon = icons[item.icon];
              return (
                <Link key={item.id} prefetch={false} href={`/admin/${item.id}`} onClick={closeMenu} aria-current={section === item.id ? "page" : undefined}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${section === item.id ? "border-red-800 bg-red-950/40 text-red-200" : "border-transparent text-zinc-300 hover:border-surface-border hover:bg-surface-card"}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-relaxed text-zinc-400">{item.description}</span></span>
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-surface-border p-4">
            <Link href="/" onClick={closeMenu} className="flex items-center justify-between rounded-lg p-3 text-sm text-zinc-400 hover:bg-surface-card hover:text-white">Kembali ke website <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </dialog>
    </>
  );
}

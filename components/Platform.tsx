"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Drawer from "@/components/Drawer";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import TelemetryWidget from "@/components/TelemetryWidget";
import CodeSnippet from "@/components/CodeSnippet";
import DocsAccordion from "@/components/DocsAccordion";
import PricingTiers from "@/components/PricingTiers";
import UserDashboard from "@/components/UserDashboard";
import AdminConsole from "@/components/AdminConsole";
import AuthModal from "@/components/AuthModal";
import { Profile, ApiKey } from "@/types";
import { ArrowRight, Lock, LogIn } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { AdminSection } from "@/lib/admin-navigation";
import type { Session } from "@supabase/supabase-js";

export default function Platform({ initialTab = "landing", adminSection }: { initialTab?: string; adminSection?: AdminSection }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string>("");
  const [session, setSession] = useState<Session | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ["landing", "docs", "profile", "pricing", "admin"].includes(tab)) setActiveTab(tab);

    try {
      const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      return () => subscription.unsubscribe();
    } catch {
      setAccountError("Layanan akun belum dikonfigurasi.");
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setUser(null);
      setApiKey(null);
      return;
    }
    const controller = new AbortController();
    setAccountError("");
    async function loadAccount(accessToken: string) {
      try {
        const res = await fetch("/api/user", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (controller.signal.aborted) return;
        setUser(data.profile);
        setApiKey(data.apiKey);
        if (!data.profile) setAccountError("Profil belum tersedia. Hubungi administrator.");
      } catch {
        if (!controller.signal.aborted) setAccountError("Gagal memuat akun. Silakan coba lagi.");
      }
    }
    void loadAccount(session.access_token);
    return () => controller.abort();
  }, [session, refresh]);

  const currentUser = session?.user.id === user?.id ? user : null;
  const currentKey = currentUser?.id === apiKey?.user_id ? apiKey : null;
  const canAdmin = currentUser?.role === "admin" && !currentUser.banned;

  useEffect(() => {
    if (activeTab === "admin" && !adminSection) router.replace("/admin/endpoints");
  }, [activeTab, adminSection, router]);

  const handleTabSelect = (tabId: string) => {
    const protectedTabs = ["docs", "profile", "admin"];
    if (protectedTabs.includes(tabId) && !session) {
      const reasons: Record<string, string> = {
        docs: "Halaman dokumentasi & playground interaktif memerlukan login Google untuk menggunakan API Key.",
        profile: "Halaman manajemen profil & API Key membutuhkan autentikasi akun Google.",
        admin: "Halaman admin console hanya dapat diakses setelah login dengan akun admin yang terverifikasi.",
      };
      setAuthReason(reasons[tabId] || "Silakan login dengan Google untuk mengakses halaman ini.");
      setAuthModalOpen(true);
      return;
    }

    if (tabId === "admin") {
      router.push("/admin/endpoints");
      return;
    }
    if (adminSection) {
      router.push(`/?tab=${tabId}`);
      return;
    }
    setActiveTab(tabId);
  };

  const handleLogout = async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      setAccountError("Gagal keluar. Silakan coba lagi.");
      return;
    }
    setSession(null);
    setUser(null);
    setApiKey(null);
    if (["docs", "profile", "admin"].includes(activeTab)) {
      setActiveTab("landing");
      if (adminSection) router.replace("/");
    }
  };

  return (
    <>
      {/* Maintenance alert top */}
      <MaintenanceBanner />

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabSelect}
        openDrawer={() => setDrawerOpen(true)}
        user={currentUser}
        onLoginClick={() => {
          setAuthReason("Masuk dengan Google untuk membuka akses seluruh fitur platform.");
          setAuthModalOpen(true);
        }}
        onLogoutClick={handleLogout}
      />

      {/* Right Slide-over Navigation Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        setActiveTab={handleTabSelect}
        user={currentUser}
        onLoginClick={() => {
          setAuthReason("Masuk dengan Google untuk membuka akses seluruh fitur platform.");
          setAuthModalOpen(true);
        }}
        onLogoutClick={handleLogout}
      />

      {/* Google Sign-in Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        reason={authReason}
      />

      {/* Main Container */}
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {accountError && (
          <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
            <span>{accountError}</span>
            {session && <button className="underline" onClick={() => setRefresh(value => value + 1)}>Coba lagi</button>}
          </div>
        )}

        {/* VIEW 1: LANDING / OVERVIEW (Public) */}
        {activeTab === "landing" && (
          <section className="space-y-12 animate-fade-in">
            {/* Hero Section */}
            <div className="hero-panel relative rounded-2xl border border-surface-border p-4 sm:p-8 lg:p-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="min-w-0 lg:col-span-7 space-y-5 sm:space-y-6">
                  <h1 className="hero-title font-bebas tracking-tight text-white">
                    FAST, RELIABLE <br />
                    <span className="text-red-400">REST API PLATFORM</span> <br />
                    FOR BUILDERS
                  </h1>

                  <p className="text-zinc-400 text-base max-w-xl leading-relaxed">
                    Infrastruktur REST API terdistribusi dengan modul AI, Media Scraping, Tooling, dan WhatsApp Engine. Dioptimalkan untuk performa tinggi dengan latency rendah.
                  </p>

                  <div className="grid grid-cols-1 min-[420px]:flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleTabSelect("docs")}
                      className="action-button justify-center rounded-lg px-4 sm:px-6 py-3 bg-red-500 hover:bg-red-400 text-black font-bebas text-2xl tracking-wider uppercase transition-all active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] flex items-center gap-2"
                    >
                      EXPLORE ENDPOINTS
                      <ArrowRight className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => handleTabSelect("pricing")}
                      className="action-button rounded-lg px-4 sm:px-6 py-3 border border-surface-border hover:border-red-500 text-white font-bebas text-2xl tracking-wider uppercase transition-colors"
                    >
                      UPGRADE TO VIP
                    </button>
                  </div>
                </div>

                {/* Right Code Box */}
                <div className="min-w-0 lg:col-span-5 lg:self-center">
                  <CodeSnippet />
                </div>
              </div>
            </div>

            {/* Live Telemetry Widget */}
            <TelemetryWidget />
          </section>
        )}

        {/* VIEW 2: DOCS & ACCORDION INLINE TESTER (Protected) */}
        {activeTab === "docs" && (
          <section className="animate-fade-in">
            {!currentUser ? (
              <div className="p-4 sm:p-10 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
                <div className="w-12 h-12 bg-red-950/80 border border-red-800 rounded-full flex items-center justify-center mx-auto text-red-500">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="font-bebas text-4xl text-white tracking-wide">
                  DOKUMENTASI & TESTER TERKUNCI
                </h3>
                <p className="text-xs font-mono-code text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Untuk menguji endpoint dan mendapatkan API Key produksi, silakan login menggunakan akun Google Anda terlebih dahulu.
                </p>
                <button
                  onClick={() => {
                    setAuthReason("Login Google untuk mengakses dokumentasi & live tester.");
                    setAuthModalOpen(true);
                  }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-black font-bold font-mono-code text-xs rounded uppercase inline-flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                >
                  <LogIn className="w-4 h-4" />
                  MASUK DENGAN GOOGLE
                </button>
              </div>
            ) : (
              <DocsAccordion defaultKey={currentKey?.key} />
            )}
          </section>
        )}

        {/* VIEW 3: PRICING (Public) */}
        {activeTab === "pricing" && (
          <section className="animate-fade-in">
            <PricingTiers />
          </section>
        )}

        {/* VIEW 4: PROFILE & API KEY (Protected) */}
        {activeTab === "profile" && (
          <section className="animate-fade-in">
            {!currentUser ? (
              <div className="p-4 sm:p-10 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
                <div className="w-12 h-12 bg-red-950/80 border border-red-800 rounded-full flex items-center justify-center mx-auto text-red-500">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="font-bebas text-4xl text-white tracking-wide">
                  PROFILE & API KEY TERKUNCI
                </h3>
                <p className="text-xs font-mono-code text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Login akun Google untuk melihat profil, kuota harian, serta kunci API produksi milik Anda.
                </p>
                <button
                  onClick={() => {
                    setAuthReason("Login Google untuk mengakses profile & kredensial API key Anda.");
                    setAuthModalOpen(true);
                  }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-black font-bold font-mono-code text-xs rounded uppercase inline-flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                >
                  <LogIn className="w-4 h-4" />
                  MASUK DENGAN GOOGLE
                </button>
              </div>
            ) : (
              <UserDashboard user={currentUser} apiKey={currentKey} onRefresh={() => { setApiKey(null); setRefresh(value => value + 1); }} />
            )}
          </section>
        )}

        {/* VIEW 5: ADMIN CONSOLE (Protected) */}
        {activeTab === "admin" && (
          <section className="animate-fade-in">
            {!currentUser ? (
              <div className="p-4 sm:p-10 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
                <div className="w-12 h-12 bg-red-950/80 border border-red-800 rounded-full flex items-center justify-center mx-auto text-red-500">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="font-bebas text-4xl text-white tracking-wide">
                  ADMIN CONSOLE TERKUNCI
                </h3>
                <p className="text-xs font-mono-code text-zinc-400 max-w-md mx-auto leading-relaxed">
                  Otentikasi administrator dibutuhkan untuk mengakses manajemen endpoint dan server settings.
                </p>
                <button
                  onClick={() => {
                    setAuthReason("Login dengan akun Google Admin terverifikasi.");
                    setAuthModalOpen(true);
                  }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-black font-bold font-mono-code text-xs rounded uppercase inline-flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                >
                  <LogIn className="w-4 h-4" />
                  MASUK DENGAN GOOGLE
                </button>
              </div>
            ) : (
              canAdmin ? <AdminConsole section={adminSection ?? "endpoints"} /> : (
                <p role="status" className="rounded-xl border border-red-900 bg-surface-panel p-5 text-red-300">Akses konsol memerlukan akun administrator aktif.</p>
              )
            )}
          </section>
        )}

      </main>

      {/* Global Footer */}
      <footer className="border-t border-surface-border bg-surface-panel py-8 mt-16 text-xs font-mono-code text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bebas text-xl text-white">
              RED<span className="text-red-600"> API</span>
            </span>
            <span>— HIGH PERFORMANCE REST API GATEWAY</span>
          </div>
          <div>
            <span>DEPLOYED ON PTERODACTYL NODE · SUPABASE BACKED</span>
          </div>
        </div>
      </footer>
    </>
  );
}

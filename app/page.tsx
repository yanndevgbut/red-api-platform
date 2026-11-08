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
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [activeTab, setActiveTab] = useState("landing");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authReason, setAuthReason] = useState<string>("");
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Load active user profile & API key
  const loadUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        // Try internal route handler (bypasses RLS)
        try {
          const res = await fetch(`/api/user?userId=${session.user.id}`);
          if (res.ok) {
            const json = await res.json();
            if (json.profile) setUser(json.profile as Profile);
            if (json.apiKey) setApiKey(json.apiKey as ApiKey);
            if (json.profile && json.apiKey) return;
          }
        } catch (apiErr) {
          console.warn("Internal user API fetch failed, falling back to direct Supabase:", apiErr);
        }

        // Load profile from Supabase
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (prof) {
          setUser(prof as Profile);
        } else {
          // If trigger takes a moment or profile not synced yet, fallback to session metadata
          setUser({
            id: session.user.id,
            username: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "user",
            email: session.user.email || "",
            role: "user",
            plan: "free",
            limit_daily: 100,
            limit_remaining: 100,
            banned: false,
            created_at: new Date().toISOString(),
          });
        }

        // Load key
        const { data: k } = await supabase
          .from("api_keys")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (k) setApiKey(k as ApiKey);
      } else {
        setUser(null);
        setApiKey(null);
      }
    } catch (err) {
      console.error("Error loading auth session:", err);
    } finally {
      setIsAuthChecking(false);
    }
  };

  useEffect(() => {
    loadUserData();

    // Listen to real-time auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        await loadUserData();
      } else {
        setUser(null);
        setApiKey(null);
      }
    });

    // Handle URL search params on client (e.g. ?tab=docs after oauth redirect)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam) {
        setActiveTab(tabParam);
      }
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleTabSelect = (tabId: string) => {
    const protectedTabs = ["docs", "profile", "admin"];
    if (protectedTabs.includes(tabId) && !user) {
      const reasons: Record<string, string> = {
        docs: "Halaman dokumentasi & playground interaktif memerlukan login Google untuk menggunakan API Key.",
        profile: "Halaman manajemen profil & API Key membutuhkan autentikasi akun Google.",
        admin: "Halaman admin console hanya dapat diakses setelah login dengan akun admin yang terverifikasi.",
      };
      setAuthReason(reasons[tabId] || "Silakan login dengan Google untuk mengakses halaman ini.");
      setAuthModalOpen(true);
      return;
    }

    setActiveTab(tabId);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApiKey(null);
    if (["docs", "profile", "admin"].includes(activeTab)) {
      setActiveTab("landing");
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
        user={user}
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
        user={user}
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        
        {/* VIEW 1: LANDING / OVERVIEW (Public) */}
        {activeTab === "landing" && (
          <section className="space-y-12 animate-fade-in">
            {/* Hero Section */}
            <div className="pt-6 pb-6 border-b border-surface-border">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-7 space-y-6">
                  <h1 className="font-bebas text-6xl sm:text-7xl lg:text-8xl tracking-tight text-white leading-[0.9]">
                    FAST, RELIABLE <br />
                    <span className="text-red-600">REST API PLATFORM</span> <br />
                    FOR BUILDERS
                  </h1>

                  <p className="text-zinc-400 text-base max-w-xl leading-relaxed">
                    Infrastruktur REST API terdistribusi dengan modul AI, Media Scraping, Tooling, dan WhatsApp Engine. Dioptimalkan untuk performa tinggi dengan latency rendah.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <button
                      onClick={() => handleTabSelect("docs")}
                      className="px-6 py-3 bg-red-600 hover:bg-red-500 text-black font-bebas text-2xl tracking-wider uppercase transition-all active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] flex items-center gap-2"
                    >
                      EXPLORE ENDPOINTS
                      <ArrowRight className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => handleTabSelect("pricing")}
                      className="px-6 py-3 border border-surface-border hover:border-red-600 text-white font-bebas text-2xl tracking-wider uppercase transition-colors"
                    >
                      UPGRADE TO VIP
                    </button>
                  </div>
                </div>

                {/* Right Code Box */}
                <div className="lg:col-span-5">
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
            {!user ? (
              <div className="p-12 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
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
              <DocsAccordion />
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
            {!user ? (
              <div className="p-12 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
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
              <UserDashboard user={user} apiKey={apiKey} onRefresh={loadUserData} />
            )}
          </section>
        )}

        {/* VIEW 5: ADMIN CONSOLE (Protected) */}
        {activeTab === "admin" && (
          <section className="animate-fade-in">
            {!user ? (
              <div className="p-12 text-center bg-surface-panel border-2 border-red-900/60 rounded-xl space-y-4 max-w-xl mx-auto shadow-2xl">
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
              <AdminConsole />
            )}
          </section>
        )}

      </main>

      {/* Global Footer */}
      <footer className="border-t border-surface-border bg-surface-panel py-8 mt-16 text-xs font-mono-code text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bebas text-xl text-white">
              RED<span className="text-red-600">/API</span>
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

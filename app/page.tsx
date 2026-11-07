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
import { Profile, ApiKey } from "@/types";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [activeTab, setActiveTab] = useState("landing");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);

  // Load active user profile & API key
  const loadUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        // Load profile
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (prof) setUser(prof as Profile);

        // Load key
        const { data: k } = await supabase
          .from("api_keys")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("is_active", true)
          .single();
        if (k) setApiKey(k as ApiKey);
      }
    } catch (err) {
      console.error("Error loading auth session:", err);
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  return (
    <>
      {/* Maintenance alert top */}
      <MaintenanceBanner />

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        openDrawer={() => setDrawerOpen(true)}
        user={user}
      />

      {/* Right Slide-over Navigation Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        setActiveTab={setActiveTab}
        user={user}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        
        {/* VIEW 1: LANDING / OVERVIEW */}
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
                      onClick={() => setActiveTab("docs")}
                      className="px-6 py-3 bg-red-600 hover:bg-red-500 text-black font-bebas text-2xl tracking-wider uppercase transition-all active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] flex items-center gap-2"
                    >
                      EXPLORE ENDPOINTS
                      <ArrowRight className="w-5 h-5" />
                    </button>

                    <button
                      onClick={() => setActiveTab("pricing")}
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

        {/* VIEW 2: DOCS & ACCORDION INLINE TESTER */}
        {activeTab === "docs" && (
          <section className="animate-fade-in">
            <DocsAccordion />
          </section>
        )}

        {/* VIEW 3: PRICING */}
        {activeTab === "pricing" && (
          <section className="animate-fade-in">
            <PricingTiers />
          </section>
        )}

        {/* VIEW 4: PROFILE & API KEY */}
        {activeTab === "profile" && (
          <section className="animate-fade-in">
            <UserDashboard user={user} apiKey={apiKey} onRefresh={loadUserData} />
          </section>
        )}

        {/* VIEW 5: ADMIN CONSOLE */}
        {activeTab === "admin" && (
          <section className="animate-fade-in">
            <AdminConsole />
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

"use client";

import React, { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { SystemSettings } from "@/types";

export default function MaintenanceBanner() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await getSupabase()
          .from("system_settings")
          .select("*")
          .eq("id", 1)
          .single();
        if (data) setSettings(data as SystemSettings);
      } catch {
        // Leave the banner hidden if configuration is unavailable.
      }
    }

    loadSettings();
    const interval = setInterval(loadSettings, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!settings || !settings.maintenance_mode) return null;

  return (
    <div className="bg-red-950/95 border-b border-red-700/80 px-4 py-2 text-center text-xs text-red-200 flex flex-wrap items-center justify-center gap-2 font-mono-code relative z-40">
      <span className="inline-block w-2 h-2 shrink-0 rounded-full bg-red-500 animate-ping" />
      <span className="font-bold uppercase tracking-wider text-red-100">[SYSTEM ALERT]:</span>
      <span>{settings.maintenance_message}</span>
    </div>
  );
}

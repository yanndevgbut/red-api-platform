"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SystemSettings } from "@/types";

export default function MaintenanceBanner() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("system_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (data) {
        setSettings(data as SystemSettings);
      }
    }

    loadSettings();
    const interval = setInterval(loadSettings, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!settings || !settings.maintenance_mode) return null;

  return (
    <div className="bg-red-950/95 border-b border-red-700/80 px-4 py-2 text-center text-xs text-red-200 flex items-center justify-center gap-2 font-mono-code sticky top-0 z-50">
      <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
      <span className="font-bold uppercase tracking-wider text-red-100">[SYSTEM ALERT]:</span>
      <span>{settings.maintenance_message}</span>
    </div>
  );
}

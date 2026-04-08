import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Settings = {
  system_name: string;
  primary_color: string;
  background_color: string;
  text_color: string;
  button_color: string;
  logo_url: string;
};

const defaults: Settings = {
  system_name: "CRM Ótica Joonker",
  primary_color: "220 72% 50%",
  background_color: "222 47% 6%",
  text_color: "210 20% 92%",
  button_color: "220 72% 55%",
  logo_url: "",
};

type Ctx = {
  settings: Settings;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SystemSettingsContext = createContext<Ctx>({
  settings: defaults,
  loading: true,
  refresh: async () => {},
});

export function useSystemSettings() {
  return useContext(SystemSettingsContext);
}

function applyCSS(s: Settings) {
  const root = document.documentElement;
  root.style.setProperty("--primary", s.primary_color);
  root.style.setProperty("--ring", s.primary_color);
  root.style.setProperty("--sidebar-primary", s.primary_color);
  root.style.setProperty("--sidebar-ring", s.primary_color);

  // Only apply dark overrides when in dark mode
  if (root.classList.contains("dark")) {
    root.style.setProperty("--background", s.background_color);
    root.style.setProperty("--foreground", s.text_color);
    root.style.setProperty("--card-foreground", s.text_color);
    root.style.setProperty("--popover-foreground", s.text_color);
  }
}

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value");

    if (data) {
      const merged = { ...defaults };
      data.forEach((row: any) => {
        if (row.setting_key in merged) {
          (merged as any)[row.setting_key] = row.setting_value;
        }
      });
      setSettings(merged);
      applyCSS(merged);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Re-apply CSS when theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      applyCSS(settings);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [settings]);

  return (
    <SystemSettingsContext.Provider value={{ settings, loading, refresh: fetchSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

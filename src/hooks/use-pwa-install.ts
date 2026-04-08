import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // If app is running in standalone mode, hide the button
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;

    if (isStandalone) {
      setCanInstall(false);
    }

    // Listen for app being installed — hide button
    const onInstalled = () => {
      setCanInstall(false);
      deferredPrompt = null;
    };
    window.addEventListener("appinstalled", onInstalled);

    // Listen for display-mode changes (uninstall returns to browser)
    const mq = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (!e.matches && deferredPrompt) {
        setCanInstall(true);
      }
    };
    mq.addEventListener("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onDisplayChange);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setCanInstall(false);
    }
    deferredPrompt = null;
  };

  return { canInstall, install };
}

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isSafariOnIOS() {
  if (!isIOS()) return false;

  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua);
  const excludedBrowsers = /CriOS|FxiOS|EdgiOS|OPiOS|OPT|DuckDuckGo|YaBrowser|UCBrowser|MiuiBrowser|SamsungBrowser|Instagram|FBAN|FBAV|Line|MicroMessenger|WhatsApp/i;

  return isSafari && !excludedBrowsers.test(ua);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const isiOSSafari = isSafariOnIOS();

  useEffect(() => {
    // If already in standalone, no install needed
    if (isInStandaloneMode()) return;

    // For iOS: show manual guide
    if (isIOS()) {
      const dismissed = localStorage.getItem("ios-install-dismissed");
      if (!dismissed) {
        setShowIOSGuide(true);
      }
      return;
    }

    // For Android/Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const onInstalled = () => {
      setCanInstall(false);
      deferredPrompt = null;
    };
    window.addEventListener("appinstalled", onInstalled);

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

  const dismissIOSGuide = () => {
    setShowIOSGuide(false);
    localStorage.setItem("ios-install-dismissed", "1");
  };

  return {
    canInstall,
    install,
    showIOSGuide,
    dismissIOSGuide,
    isIOS: isIOS(),
    isIOSSafari: isiOSSafari,
    isIOSExternalBrowser: isIOS() && !isiOSSafari,
  };
}

import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

const canRegisterServiceWorker =
  "serviceWorker" in navigator && !isPreviewHost && !isInIframe;

if (canRegisterServiceWorker) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
    },
  });
} else {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}

createRoot(document.getElementById("root")!).render(<App />);

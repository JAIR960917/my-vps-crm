import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const VAPID_PUBLIC_KEY = "BFNFVTMoiXGaOagrSP94waxHtMwWLWp9JV0456PxtJXaSi2tNGbV4oswaecvVu3TiYm8jguh9Mv_kbjTOGiJrwE";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function hasMatchingApplicationServerKey(
  currentKey: ArrayBuffer | null | undefined,
  expectedKey: Uint8Array,
) {
  if (!currentKey) return false;

  const current = new Uint8Array(currentKey);
  if (current.length !== expectedKey.length) return false;

  return current.every((value, index) => value === expectedKey[index]);
}

export function usePushNotifications() {
  const { user } = useAuth();

  const subscribe = useCallback(async () => {
    if (!user || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    if (isIOSDevice() && !isStandaloneMode()) {
      return false;
    }

    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

      if (permission !== "granted") {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      const expectedServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let subscription = await registration.pushManager.getSubscription();

      if (
        subscription &&
        !hasMatchingApplicationServerKey(subscription.options.applicationServerKey, expectedServerKey)
      ) {
        const staleEndpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", staleEndpoint);
        subscription = null;
      }

      // Already subscribed with correct key — just ensure DB record exists
      if (subscription) {
        const subJson = subscription.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await supabase.from("push_subscriptions").upsert({
            user_id: user.id,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            user_agent: navigator.userAgent,
          }, { onConflict: "user_id,endpoint" });
          return true;
        }
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedServerKey,
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        return false;
      }

      const { error } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: "user_id,endpoint" });

      if (error) {
        throw error;
      }

      return true;
    } catch {
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        if (user) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);
        }
      }
    } catch {
      // no-op
    }
  }, [user]);

  // Re-subscribe on every app load to keep push subscription fresh
  useEffect(() => {
    if (!user) return;
    if (Notification.permission !== "granted") return;
    if (isIOSDevice() && !isStandaloneMode()) return;

    const refreshSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        
        // If no existing subscription, re-subscribe
        if (!existing) {
          console.log("No push subscription found, re-subscribing...");
          await subscribe();
          return;
        }
        
        // Always sync to DB in case it was lost
        const subJson = existing.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await supabase.from("push_subscriptions").upsert({
            user_id: user.id,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            user_agent: navigator.userAgent,
          }, { onConflict: "user_id,endpoint" });
        }
      } catch {
        // Fallback: try full subscribe
        await subscribe();
      }
    };

    void refreshSubscription();
  }, [user, subscribe]);

  return { subscribe, unsubscribe };
}

"use client";

import { useEffect, useState } from "react";
import { syncPendingSales, queuePendingCount } from "@/lib/offline-queue";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPending(queuePendingCount());

    async function handleOnline() {
      setIsOnline(true);
      const result = await syncPendingSales();
      setPending(queuePendingCount());
      return result;
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, pending };
}

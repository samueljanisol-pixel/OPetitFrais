"use client";

import { useEffect, useState } from "react";
import { todayJournalDateIso } from "./production-date";

const POLL_MS = 30_000;

/**
 * Date du jour journal (Casablanca), mise à jour si minuit passe pendant que la page est ouverte.
 */
export function useJournalDateLive(): string {
  const [journalDate, setJournalDate] = useState(() => todayJournalDateIso());

  useEffect(() => {
    const sync = () => {
      const today = todayJournalDateIso();
      setJournalDate((prev) => (prev === today ? prev : today));
    };

    sync();
    const intervalId = window.setInterval(sync, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return journalDate;
}

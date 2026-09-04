"use client";

import { useEffect, useState } from "react";
import styles from "@/app/explorer.module.css";
import { sourceSiteLabel } from "@/lib/types";

type SiteStatus = {
  status: "pending" | "running" | "done" | "error";
  currentMake?: string;
  listingsSoFar: number;
  upserted?: number;
  stale?: number;
  error?: string;
};

type ScrapeStatus = {
  status: "idle" | "running";
  mode: "incremental" | "deep" | null;
  sites: Record<string, SiteStatus>;
};

const POLL_INTERVAL_MS = 4000;

export default function ScrapeMonitor() {
  const [status, setStatus] = useState<ScrapeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/scrape-status");
        const data: ScrapeStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // Transient network hiccup — just try again on the next interval.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!status || status.status !== "running") return null;

  return (
    <div className={styles.scrapeMonitor}>
      <strong>Scraping in progress ({status.mode === "deep" ? "one-off deep crawl" : "routine"})</strong>
      <ul>
        {Object.entries(status.sites).map(([site, s]) => (
          <li key={site}>
            <span className={styles.scrapeMonitorSite}>{sourceSiteLabel(site)}</span>
            {s.status === "running" && (
              <span>
                {" "}
                — {s.currentMake ? `${s.currentMake}, ` : ""}
                {s.listingsSoFar.toLocaleString()} found so far
              </span>
            )}
            {s.status === "done" && (
              <span>
                {" "}
                — done: {s.upserted?.toLocaleString()} upserted
                {s.stale ? `, ${s.stale.toLocaleString()} marked stale` : ""}
              </span>
            )}
            {s.status === "error" && <span> — error: {s.error}</span>}
            {s.status === "pending" && <span> — waiting…</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

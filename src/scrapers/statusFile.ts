import fs from "fs";
import path from "path";
import type { ScrapeMode } from "./types";

const STATUS_PATH = path.join(process.cwd(), "scrape-status.json");

export type SiteStatus = {
  status: "pending" | "running" | "done" | "error";
  currentMake?: string;
  listingsSoFar: number;
  upserted?: number;
  stale?: number;
  error?: string;
};

export type ScrapeStatus = {
  status: "idle" | "running";
  mode: ScrapeMode;
  startedAt: string;
  finishedAt: string | null;
  currentSite: string | null;
  sites: Record<string, SiteStatus>;
};

export function readStatus(): ScrapeStatus | null {
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function writeStatus(status: ScrapeStatus): void {
  try {
    fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
  } catch (err) {
    // Status reporting is a nice-to-have — never let it break the actual scrape.
    console.error("Failed to write scrape status file:", err);
  }
}

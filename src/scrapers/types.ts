export type NormalizedListing = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  make: string;
  model: string;
  year: number;
  priceUsd: number;
  priceRaw?: string;
  priceCurrency?: string;
  mileageKm: number;
  mileageRaw?: string;
  mileageUnit?: string;
  transmission?: string;
  fuelType?: string;
  driveType?: string;
  engineCc?: number;
  color?: string;
  bodyType?: string;
  location?: string;
  imageUrl?: string;
  description?: string;
};

export type ScrapeMode =
  /** Routine run (the 6-hourly cron job): today's bounded pass, plus a small newest-first
   * pass that stops as soon as it catches up to already-known listings. Fast pace. */
  | "incremental"
  /** One-off manual deep backfill: many more pages per make, slower/jittered pace to stay
   * polite under sustained load. Purely additive — never marks anything stale. */
  | "deep";

export type ScrapeProgress = {
  make?: string;
  listingsSoFar: number;
};

export type ScrapeOptions = {
  mode: ScrapeMode;
  /** sourceIds already stored for this site, used by the newest-first pass to know when
   * it has caught up to known inventory and can stop paginating. */
  knownIds: Set<string>;
  /** Called after each make finishes, so a caller (e.g. the status file writer) can show
   * live progress. Optional — adapters should no-op safely if it's not provided. */
  onProgress?: (progress: ScrapeProgress) => void;
};

export type SiteAdapter = {
  /** Stable key stored as `Listing.sourceSite`, e.g. "sbt_japan". */
  siteKey: string;
  /** Human-readable name for logging. */
  displayName: string;
  /** Fetch and normalize listings from the site. Should be polite (rate-limited, real UA). */
  scrape(options: ScrapeOptions): Promise<NormalizedListing[]>;
};

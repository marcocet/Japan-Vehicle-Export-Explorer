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

export type SiteAdapter = {
  /** Stable key stored as `Listing.sourceSite`, e.g. "sbt_japan". */
  siteKey: string;
  /** Human-readable name for logging. */
  displayName: string;
  /** Fetch and normalize listings from the site. Should be polite (rate-limited, real UA). */
  scrape(): Promise<NormalizedListing[]>;
};

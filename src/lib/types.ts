export type ListingDTO = {
  id: string;
  sourceSite: string;
  sourceUrl: string;
  title: string;
  make: string;
  model: string;
  year: number;
  priceUsd: number;
  mileageKm: number;
  transmission: string | null;
  fuelType: string | null;
  driveType: string | null;
  engineCc: number | null;
  color: string | null;
  bodyType: string | null;
  location: string | null;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt: string | null;
};

export type ListingsResponse = {
  listings: ListingDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type FiltersResponse = {
  makes: string[];
  models: string[];
  sourceSites: string[];
  bodyTypes: string[];
  price: { min: number; max: number };
  year: { min: number; max: number };
  mileage: { min: number; max: number };
  lastScrapedAt: string | null;
};

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_SORT = "recently_added";

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "recently_added", label: "Recently added" },
  { value: "recently_checked", label: "Recently checked" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "year_desc", label: "Year: newest first" },
  { value: "year_asc", label: "Year: oldest first" },
  { value: "mileage_asc", label: "Mileage: low to high" },
  { value: "mileage_desc", label: "Mileage: high to low" },
];

export function sourceSiteLabel(site: string): string {
  const labels: Record<string, string> = {
    sbt_japan: "SBT Japan",
    car_junction: "Car Junction",
    car_from_japan: "CarFromJapan",
    cardealpage: "CarDealPage",
    beforward: "BE FORWARD",
    ibc_japan: "IBC Japan",
  };
  return labels[site] ?? site;
}

"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./explorer.module.css";
import FilterSidebar, { EMPTY_FILTERS, FilterState } from "@/components/FilterSidebar";
import ListingGrid from "@/components/ListingGrid";
import Pagination from "@/components/Pagination";
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT, FiltersResponse, ListingsResponse, PAGE_SIZE_OPTIONS } from "@/lib/types";

function filtersFromSearchParams(params: URLSearchParams): FilterState {
  return {
    make: params.get("make") ?? "",
    model: params.get("model") ?? "",
    yearMin: params.get("yearMin") ?? "",
    yearMax: params.get("yearMax") ?? "",
    priceMin: params.get("priceMin") ?? "",
    priceMax: params.get("priceMax") ?? "",
    mileageMin: params.get("mileageMin") ?? "",
    mileageMax: params.get("mileageMax") ?? "",
    transmission: params.get("transmission") ?? "",
    fuelType: params.get("fuelType") ?? "",
    bodyType: params.get("bodyType") ?? "",
    sourceSites: params.getAll("sourceSite"),
    sort: params.get("sort") ?? DEFAULT_SORT,
    includeInactive: params.get("includeInactive") === "true",
  };
}

function buildQueryString(filters: FilterState, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  if (filters.make) params.set("make", filters.make);
  if (filters.model) params.set("model", filters.model);
  if (filters.yearMin) params.set("yearMin", filters.yearMin);
  if (filters.yearMax) params.set("yearMax", filters.yearMax);
  if (filters.priceMin) params.set("priceMin", filters.priceMin);
  if (filters.priceMax) params.set("priceMax", filters.priceMax);
  if (filters.mileageMin) params.set("mileageMin", filters.mileageMin);
  if (filters.mileageMax) params.set("mileageMax", filters.mileageMax);
  if (filters.transmission) params.set("transmission", filters.transmission);
  if (filters.fuelType) params.set("fuelType", filters.fuelType);
  if (filters.bodyType) params.set("bodyType", filters.bodyType);
  for (const site of filters.sourceSites) params.append("sourceSite", site);
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.includeInactive) params.set("includeInactive", "true");
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  return params.toString();
}

function ExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState<number>(() => parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [pageSize, setPageSize] = useState<number>(
    () => parseInt(searchParams.get("pageSize") ?? "", 10) || DEFAULT_PAGE_SIZE
  );
  const [filterOptions, setFilterOptions] = useState<FiltersResponse | null>(null);
  const [result, setResult] = useState<ListingsResponse | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  // Fetch filter options; re-fetch whenever the selected make or includeInactive changes.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.make) params.set("make", filters.make);
    if (filters.includeInactive) params.set("includeInactive", "true");
    fetch(`/api/filters?${params.toString()}`)
      .then((res) => res.json())
      .then((data: FiltersResponse) => setFilterOptions(data))
      .catch(() => setFilterOptions(null));
  }, [filters.make, filters.includeInactive]);

  // Keep the URL in sync with the current filters/page/pageSize so searches are shareable.
  useEffect(() => {
    const qs = buildQueryString(filters, page, pageSize);
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, pageSize]);

  // Fetch listings whenever filters, page, or pageSize change. `loading` is derived by
  // comparing the in-flight query key against the last-loaded one, rather than an extra
  // setState at the top of the effect (which would trigger a redundant render).
  const requestId = useRef(0);
  const currentKey = buildQueryString(filters, page, pageSize);
  useEffect(() => {
    const id = ++requestId.current;
    const qs = buildQueryString(filters, page, pageSize);
    fetch(`/api/listings?${qs}`)
      .then((res) => res.json())
      .then((data: ListingsResponse) => {
        if (id === requestId.current) {
          setResult(data);
          setLoadedKey(qs);
        }
      })
      .catch(() => {
        if (id === requestId.current) setLoadedKey(qs);
      });
  }, [filters, page, pageSize]);
  const loading = loadedKey !== currentKey;

  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(parseInt(e.target.value, 10));
    setPage(1);
  }, []);

  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const listings = useMemo(() => result?.listings ?? [], [result]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Japan Vehicle Export Explorer</h1>
        <p>Search used-vehicle listings aggregated from CarDealPage, CarFromJapan, BE FORWARD, SBT Japan, IBC Japan, and Car Junction.</p>
        {filterOptions?.lastScrapedAt && (
          <p className={styles.refreshedNote}>
            Data last refreshed {new Date(filterOptions.lastScrapedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </header>
      <div className={styles.layout}>
        <FilterSidebar
          filters={filters}
          filterOptions={filterOptions}
          onChange={handleFilterChange}
          onReset={handleReset}
        />
        <div className={styles.content}>
          <div className={styles.resultsBar}>
            <span>{loading ? "Loading…" : `${total.toLocaleString()} listing${total === 1 ? "" : "s"} found`}</span>
            <label>
              Per page{" "}
              <select value={pageSize} onChange={handlePageSizeChange}>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ListingGrid listings={listings} loading={loading} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ExplorerPage />
    </Suspense>
  );
}

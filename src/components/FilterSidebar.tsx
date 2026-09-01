"use client";

import styles from "@/app/explorer.module.css";
import { FiltersResponse, SORT_OPTIONS, sourceSiteLabel } from "@/lib/types";

export type FilterState = {
  make: string;
  model: string;
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  mileageMin: string;
  mileageMax: string;
  transmission: string;
  fuelType: string;
  bodyType: string;
  sourceSites: string[];
  sort: string;
  includeInactive: boolean;
};

export const EMPTY_FILTERS: FilterState = {
  make: "",
  model: "",
  yearMin: "",
  yearMax: "",
  priceMin: "",
  priceMax: "",
  mileageMin: "",
  mileageMax: "",
  transmission: "",
  fuelType: "",
  bodyType: "",
  sourceSites: [],
  sort: "newest",
  includeInactive: false,
};

const TRANSMISSIONS = ["Automatic", "Manual"];
const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid"];

type Props = {
  filters: FilterState;
  filterOptions: FiltersResponse | null;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
};

export default function FilterSidebar({ filters, filterOptions, onChange, onReset }: Props) {
  function toggleSourceSite(site: string) {
    const current = filters.sourceSites;
    const next = current.includes(site) ? current.filter((s) => s !== site) : [...current, site];
    onChange({ sourceSites: next });
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.field}>
        <label htmlFor="make">Make</label>
        <select
          id="make"
          value={filters.make}
          onChange={(e) => onChange({ make: e.target.value, model: "" })}
        >
          <option value="">All makes</option>
          {filterOptions?.makes.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="model">Model</label>
        <select
          id="model"
          value={filters.model}
          onChange={(e) => onChange({ model: e.target.value })}
          disabled={!filterOptions?.models.length}
        >
          <option value="">All models</option>
          {filterOptions?.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label>Year</label>
        <div className={styles.rangeRow}>
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.year.min) : "Min"}
            value={filters.yearMin}
            onChange={(e) => onChange({ yearMin: e.target.value })}
          />
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.year.max) : "Max"}
            value={filters.yearMax}
            onChange={(e) => onChange({ yearMax: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label>Price (USD)</label>
        <div className={styles.rangeRow}>
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.price.min) : "Min"}
            value={filters.priceMin}
            onChange={(e) => onChange({ priceMin: e.target.value })}
          />
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.price.max) : "Max"}
            value={filters.priceMax}
            onChange={(e) => onChange({ priceMax: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label>Mileage (km)</label>
        <div className={styles.rangeRow}>
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.mileage.min) : "Min"}
            value={filters.mileageMin}
            onChange={(e) => onChange({ mileageMin: e.target.value })}
          />
          <input
            type="number"
            placeholder={filterOptions ? String(filterOptions.mileage.max) : "Max"}
            value={filters.mileageMax}
            onChange={(e) => onChange({ mileageMax: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="transmission">Transmission</label>
        <select
          id="transmission"
          value={filters.transmission}
          onChange={(e) => onChange({ transmission: e.target.value })}
        >
          <option value="">Any</option>
          {TRANSMISSIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="fuelType">Fuel type</label>
        <select id="fuelType" value={filters.fuelType} onChange={(e) => onChange({ fuelType: e.target.value })}>
          <option value="">Any</option>
          {FUEL_TYPES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="bodyType">Vehicle type</label>
        <select id="bodyType" value={filters.bodyType} onChange={(e) => onChange({ bodyType: e.target.value })}>
          <option value="">Any</option>
          {filterOptions?.bodyTypes.map((bt) => (
            <option key={bt} value={bt}>
              {bt}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label>Source site</label>
        <div className={styles.checkboxList}>
          {filterOptions?.sourceSites.map((site) => (
            <label key={site} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={filters.sourceSites.includes(site)}
                onChange={() => toggleSourceSite(site)}
              />
              {sourceSiteLabel(site)}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={filters.includeInactive}
            onChange={(e) => onChange({ includeInactive: e.target.checked })}
          />
          Show sold/removed listings
        </label>
      </div>

      <div className={styles.field}>
        <label htmlFor="sort">Sort by</label>
        <select id="sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button type="button" className={styles.resetButton} onClick={onReset}>
        Reset filters
      </button>
    </aside>
  );
}

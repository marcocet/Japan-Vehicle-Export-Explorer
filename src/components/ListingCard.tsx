import styles from "@/app/explorer.module.css";
import { ListingDTO, sourceSiteLabel } from "@/lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ListingCard({ listing }: { listing: ListingDTO }) {
  return (
    <div className={`${styles.card} ${listing.isActive ? "" : styles.cardInactive}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external, unpredictable third-party image hosts */}
      <img
        className={styles.cardImage}
        src={listing.imageUrl ?? "https://placehold.co/640x480?text=No+Image"}
        alt={listing.title}
        loading="lazy"
      />
      <div className={styles.cardBody}>
        <div className={styles.badgeRow}>
          <span className={styles.badge}>{sourceSiteLabel(listing.sourceSite)}</span>
          {!listing.isActive && <span className={styles.badgeSold}>Sold / Removed</span>}
        </div>
        <div className={styles.cardTitle}>{listing.title}</div>
        <div className={styles.cardPrice}>${listing.priceUsd.toLocaleString()}</div>
        <div className={styles.cardMeta}>
          <span>{listing.year}</span>
          <span>{listing.mileageKm.toLocaleString()} km</span>
          {listing.transmission && <span>{listing.transmission}</span>}
          {listing.fuelType && <span>{listing.fuelType}</span>}
        </div>
        <div className={styles.cardDates}>
          <span>Added {formatDate(listing.firstSeenAt)}</span>
          {listing.isActive ? (
            <span>Last checked {formatDate(listing.lastSeenAt)}</span>
          ) : (
            listing.removedAt && <span>Removed {formatDate(listing.removedAt)}</span>
          )}
        </div>
        <a
          className={styles.viewLink}
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on {sourceSiteLabel(listing.sourceSite)}
        </a>
      </div>
    </div>
  );
}

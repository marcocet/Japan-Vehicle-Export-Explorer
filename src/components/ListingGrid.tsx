import styles from "@/app/explorer.module.css";
import { ListingDTO } from "@/lib/types";
import ListingCard from "./ListingCard";

export default function ListingGrid({ listings, loading }: { listings: ListingDTO[]; loading: boolean }) {
  if (!loading && listings.length === 0) {
    return <div className={styles.empty}>No listings match these filters. Try widening your search.</div>;
  }

  return (
    <div className={styles.grid} style={{ opacity: loading ? 0.5 : 1 }}>
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

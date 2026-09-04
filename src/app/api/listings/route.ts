import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const SORT_MAP: Record<string, Prisma.ListingOrderByWithRelationInput> = {
  price_asc: { priceUsd: "asc" },
  price_desc: { priceUsd: "desc" },
  year_asc: { year: "asc" },
  year_desc: { year: "desc" },
  mileage_asc: { mileageKm: "asc" },
  mileage_desc: { mileageKm: "desc" },
  // "Recently added" reflects when a listing was first scraped (genuinely new inventory);
  // "recently checked" reflects the last time any scrape run touched it, which for most
  // listings just means "still there" — the two are deliberately different sorts.
  recently_added: { firstSeenAt: "desc" },
  recently_checked: { scrapedAt: "desc" },
};

function parseIntParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const make = params.get("make") ?? undefined;
  const model = params.get("model") ?? undefined;
  const yearMin = parseIntParam(params.get("yearMin"));
  const yearMax = parseIntParam(params.get("yearMax"));
  const priceMin = parseIntParam(params.get("priceMin"));
  const priceMax = parseIntParam(params.get("priceMax"));
  const mileageMin = parseIntParam(params.get("mileageMin"));
  const mileageMax = parseIntParam(params.get("mileageMax"));
  const transmission = params.get("transmission") ?? undefined;
  const fuelType = params.get("fuelType") ?? undefined;
  const bodyType = params.get("bodyType") ?? undefined;
  const sourceSites = params.getAll("sourceSite");
  const sort = params.get("sort") ?? "recently_added";
  const page = Math.max(1, parseIntParam(params.get("page")) ?? 1);
  const pageSize = Math.min(100, Math.max(1, parseIntParam(params.get("pageSize")) ?? 20));
  const includeInactive = params.get("includeInactive") === "true";

  const where: Prisma.ListingWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(make ? { make } : {}),
    ...(model ? { model } : {}),
    ...(transmission ? { transmission } : {}),
    ...(fuelType ? { fuelType } : {}),
    ...(bodyType ? { bodyType } : {}),
    ...(sourceSites.length > 0 ? { sourceSite: { in: sourceSites } } : {}),
    ...(yearMin !== undefined || yearMax !== undefined
      ? { year: { ...(yearMin !== undefined ? { gte: yearMin } : {}), ...(yearMax !== undefined ? { lte: yearMax } : {}) } }
      : {}),
    ...(priceMin !== undefined || priceMax !== undefined
      ? { priceUsd: { ...(priceMin !== undefined ? { gte: priceMin } : {}), ...(priceMax !== undefined ? { lte: priceMax } : {}) } }
      : {}),
    ...(mileageMin !== undefined || mileageMax !== undefined
      ? { mileageKm: { ...(mileageMin !== undefined ? { gte: mileageMin } : {}), ...(mileageMax !== undefined ? { lte: mileageMax } : {}) } }
      : {}),
  };

  const orderBy = SORT_MAP[sort] ?? SORT_MAP.recently_added;

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.listing.count({ where }),
  ]);

  return NextResponse.json({
    listings,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

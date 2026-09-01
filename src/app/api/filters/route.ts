import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const make = request.nextUrl.searchParams.get("make");
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const activeFilter = includeInactive ? {} : { isActive: true };

  const [makes, models, aggregates, sourceSites, bodyTypes] = await Promise.all([
    prisma.listing.findMany({
      where: { ...activeFilter },
      distinct: ["make"],
      select: { make: true },
      orderBy: { make: "asc" },
    }),
    prisma.listing.findMany({
      where: { ...activeFilter, ...(make ? { make } : {}) },
      distinct: ["model"],
      select: { model: true },
      orderBy: { model: "asc" },
    }),
    prisma.listing.aggregate({
      where: { ...activeFilter },
      _min: { priceUsd: true, year: true, mileageKm: true },
      _max: { priceUsd: true, year: true, mileageKm: true },
    }),
    prisma.listing.findMany({
      where: { ...activeFilter },
      distinct: ["sourceSite"],
      select: { sourceSite: true },
      orderBy: { sourceSite: "asc" },
    }),
    prisma.listing.findMany({
      where: { ...activeFilter, bodyType: { not: null } },
      distinct: ["bodyType"],
      select: { bodyType: true },
      orderBy: { bodyType: "asc" },
    }),
  ]);

  return NextResponse.json({
    makes: makes.map((m) => m.make),
    models: models.map((m) => m.model),
    sourceSites: sourceSites.map((s) => s.sourceSite),
    bodyTypes: bodyTypes.map((b) => b.bodyType).filter((b): b is string => b !== null),
    price: { min: aggregates._min.priceUsd ?? 0, max: aggregates._max.priceUsd ?? 0 },
    year: { min: aggregates._min.year ?? 0, max: aggregates._max.year ?? 0 },
    mileage: { min: aggregates._min.mileageKm ?? 0, max: aggregates._max.mileageKm ?? 0 },
  });
}

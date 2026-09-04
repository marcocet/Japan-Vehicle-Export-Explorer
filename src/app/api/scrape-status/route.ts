import { NextResponse } from "next/server";
import { readStatus } from "@/scrapers/statusFile";

export async function GET() {
  const status = readStatus();
  if (!status) {
    return NextResponse.json({ status: "idle", mode: null, sites: {} });
  }
  return NextResponse.json(status);
}

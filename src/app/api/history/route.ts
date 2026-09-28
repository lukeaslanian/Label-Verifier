import { NextResponse } from "next/server";
import { getAllVerifications } from "@/lib/db";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "History needs a database. Set DATABASE_URL to turn it on (see README)." },
      { status: 503 }
    );
  }

  try {
    return NextResponse.json({ records: await getAllVerifications() });
  } catch (err) {
    console.error("Failed to load verification history", err);
    return NextResponse.json({ error: "Could not load history." }, { status: 502 });
  }
}

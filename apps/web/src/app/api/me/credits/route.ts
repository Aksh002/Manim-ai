import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { getCreditSummary } from "@/lib/server/credits";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const credits = await getCreditSummary(user.id);
    return NextResponse.json({ credits, user });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Credit request failed" },
      { status: 500 }
    );
  }
}

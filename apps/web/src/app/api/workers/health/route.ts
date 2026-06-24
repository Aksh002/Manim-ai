import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { proxyJson } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const result = await proxyJson<Record<string, unknown>>("/workers/health", { method: "GET" }, user);
    return result.response;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Worker health request failed" },
      { status: 500 }
    );
  }
}

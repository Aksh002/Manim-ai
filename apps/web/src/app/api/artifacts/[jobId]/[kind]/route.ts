import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { proxyArtifact } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ jobId: string; kind: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { jobId, kind } = await context.params;
    if (kind !== "video" && kind !== "thumbnail") {
      return NextResponse.json({ detail: "Unsupported artifact kind" }, { status: 400 });
    }
    return proxyArtifact(request, `/artifacts/${jobId}/${kind}`, user);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Artifact request failed" },
      { status: 500 }
    );
  }
}

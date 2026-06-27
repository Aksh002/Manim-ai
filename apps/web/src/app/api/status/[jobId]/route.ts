import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { proxyJson, rewriteBackendUrls } from "@/lib/server/backend-proxy";
import { syncRenderCreditFromStatus } from "@/lib/server/credits";
import { syncSessionRenderFromStatus } from "@/lib/server/chat-store";
import { JobStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { jobId } = await context.params;
    const result = await proxyJson<Record<string, unknown>>(`/status/${jobId}`, { method: "GET" }, user);
    const body = rewriteBackendUrls(result.body);
    if (result.ok && body) {
      await syncRenderCreditFromStatus({
        userId: user.id,
        backendJobId: jobId,
        status: String(body.status),
        stage: typeof body.stage === "string" ? body.stage : null,
        errorType: typeof body.error_type === "string" ? body.error_type : null
      });
      await syncSessionRenderFromStatus(user.id, jobId, body as unknown as JobStatus);
    }
    return NextResponse.json(body, { status: result.response.status });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Status request failed" },
      { status: 500 }
    );
  }
}

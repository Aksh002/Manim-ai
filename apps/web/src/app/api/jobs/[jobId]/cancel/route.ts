import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { proxyJson } from "@/lib/server/backend-proxy";
import { syncRenderCreditFromStatus } from "@/lib/server/credits";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { jobId } = await context.params;
    const result = await proxyJson<Record<string, unknown>>(
      `/jobs/${jobId}/cancel`,
      { method: "POST" },
      user
    );
    if (result.ok && result.body) {
      await syncRenderCreditFromStatus({
        userId: user.id,
        backendJobId: jobId,
        status: String(result.body.status),
        stage: typeof result.body.stage === "string" ? result.body.stage : null,
        errorType: typeof result.body.error_type === "string" ? result.body.error_type : null
      });
    }
    return result.response;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Cancel request failed" },
      { status: 500 }
    );
  }
}

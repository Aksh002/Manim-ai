import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import {
  assertByokDailyRenderLimit,
  attachRenderJob,
  releaseReservedCredit,
  reserveRenderCredit
} from "@/lib/server/credits";
import { proxyJson } from "@/lib/server/backend-proxy";
import { getDecryptedLlmConfig } from "@/lib/server/user-secrets";

export const runtime = "nodejs";

type RenderResponse = {
  job_id: string;
  status: string;
  owner_token?: string | null;
};

export async function POST(request: NextRequest) {
  let ledgerId: string | null = null;
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const llmConfig = await getDecryptedLlmConfig(user.id, body.llm_config_id);
    delete body.llm_config_id;

    if (llmConfig) {
      await assertByokDailyRenderLimit(user.id);
    } else {
      const reservation = await reserveRenderCredit(user.id);
      ledgerId = reservation.ledgerId;
    }

    const { response, body: responseBody, ok } = await proxyJson<RenderResponse>(
      "/render",
      { method: "POST", body: JSON.stringify(body) },
      user,
      llmConfig
    );
    if (!ok) {
      if (ledgerId) {
        await releaseReservedCredit(user.id, ledgerId);
      }
      return response;
    }

    if (responseBody?.job_id) {
      await attachRenderJob({
        userId: user.id,
        backendJobId: responseBody.job_id,
        creditLedgerId: ledgerId,
        status: responseBody.status,
        target: body.target ?? (body.preview_first ? "draft" : "final")
      });
    }
    return response;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Render request failed" },
      { status: error instanceof Error && error.message.includes("No free credits") ? 402 : 500 }
    );
  }
}

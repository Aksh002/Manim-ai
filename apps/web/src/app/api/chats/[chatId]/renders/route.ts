import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import {
  assertByokDailyRenderLimit,
  attachRenderJob,
  releaseReservedCredit,
  reserveRenderCredit
} from "@/lib/server/credits";
import { createChatMessage, createSessionRender, findCodeVersion, getChatWorkspace } from "@/lib/server/chat-store";
import { proxyJson } from "@/lib/server/backend-proxy";
import { getDecryptedLlmConfig } from "@/lib/server/user-secrets";

export const runtime = "nodejs";

type RenderResponse = {
  job_id: string;
  status: string;
  owner_token?: string | null;
};

export async function POST(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  let ledgerId: string | null = null;
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const body = await request.json();
    const codeVersionId = String(body.codeVersionId ?? "");
    const codeVersion = await findCodeVersion(user.id, chatId, codeVersionId);
    if (!codeVersion) {
      return NextResponse.json({ detail: "Code version not found" }, { status: 404 });
    }

    const target = body.target === "draft" ? "draft" : "final";
    const quality = typeof body.quality === "string" ? body.quality : "1080p30";
    const llmConfig = await getDecryptedLlmConfig(user.id, body.llm_config_id);
    if (llmConfig) {
      await assertByokDailyRenderLimit(user.id);
    } else {
      const reservation = await reserveRenderCredit(user.id);
      ledgerId = reservation.ledgerId;
    }

    const backendBody = {
      code: codeVersion.code,
      quality,
      retry_on_error: body.retry_on_error !== false,
      preview_first: target === "draft",
      target
    };
    const { response, body: responseBody, ok } = await proxyJson<RenderResponse>(
      "/render",
      { method: "POST", body: JSON.stringify(backendBody) },
      user,
      llmConfig
    );
    if (!ok || !responseBody?.job_id) {
      if (ledgerId) {
        await releaseReservedCredit(user.id, ledgerId);
      }
      await createChatMessage(user.id, chatId, {
        role: "assistant",
        kind: "error",
        content: "Render could not be queued.",
        metadata: { target, quality, response: responseBody, status: response.status }
      });
      return response;
    }

    const render = await createSessionRender(user.id, chatId, {
      codeVersionId,
      target,
      quality,
      status: responseBody.status,
      backendJobId: responseBody.job_id,
      metadata: { requestedAt: new Date().toISOString(), backendStatus: responseBody.status }
    });
    await attachRenderJob({
      userId: user.id,
      backendJobId: responseBody.job_id,
      creditLedgerId: ledgerId,
      status: responseBody.status,
      target,
      codeHash: codeVersion.codeHash,
      chatSessionId: chatId,
      codeVersionId,
      sessionRenderId: render.id
    });
    await createChatMessage(user.id, chatId, {
      role: "event",
      kind: "render_started",
      content: `${target === "draft" ? "Draft" : "Final"} render queued at ${quality}.`,
      metadata: { renderId: render.id, backendJobId: responseBody.job_id, target, quality, codeHash: codeVersion.codeHash }
    });

    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json({ ...responseBody, renderId: render.id, workspace }, { status: 201 });
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

import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { proxyJson } from "@/lib/server/backend-proxy";
import { findSessionRender, getChatWorkspace } from "@/lib/server/chat-store";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, context: { params: Promise<{ chatId: string; renderId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId, renderId } = await context.params;
    const render = await findSessionRender(user.id, chatId, renderId);
    if (!render?.backendJobId) {
      return NextResponse.json({ detail: "Render has no backend job to cancel" }, { status: 400 });
    }
    const result = await proxyJson(`/jobs/${render.backendJobId}/cancel`, { method: "POST" }, user);
    if (!result.ok) {
      return result.response;
    }
    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json({ status: result.body, workspace });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not cancel render" }, { status: 500 });
  }
}

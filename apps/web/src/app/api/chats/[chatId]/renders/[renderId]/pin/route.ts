import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { findSessionRender, getChatWorkspace, setRenderPinned } from "@/lib/server/chat-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ chatId: string; renderId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId, renderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    await findSessionRender(user.id, chatId, renderId);
    await setRenderPinned(user.id, chatId, renderId, body.pinned !== false);
    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not pin render" }, { status: 500 });
  }
}

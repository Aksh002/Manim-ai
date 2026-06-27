import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { createChatMessage, createCodeVersion, getChatWorkspace } from "@/lib/server/chat-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const body = await request.json();
    if (typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json({ detail: "Code is required" }, { status: 400 });
    }
    const message = await createChatMessage(user.id, chatId, {
      role: "event",
      kind: body.source === "repaired" ? "repair_applied" : "code_saved",
      content: body.source === "repaired" ? "Saved repaired render code." : "Saved a new code version.",
      metadata: {
        source: body.source ?? "edited",
        parentVersionId: body.parentVersionId ?? null,
        instruction: body.instruction ?? null
      }
    });
    await createCodeVersion(user.id, chatId, {
      code: body.code,
      source: typeof body.source === "string" ? body.source : "edited",
      parentVersionId: typeof body.parentVersionId === "string" ? body.parentVersionId : null,
      messageId: message.id,
      metadata: body.metadata ?? null
    });
    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not save code version" }, { status: 500 });
  }
}

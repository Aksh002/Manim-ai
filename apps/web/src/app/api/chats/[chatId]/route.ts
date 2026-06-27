import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { getChatWorkspace, updateChatSession } from "@/lib/server/chat-store";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not load chat" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const body = await request.json();
    const workspace = await updateChatSession(user.id, chatId, {
      title: typeof body.title === "string" ? body.title : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      activeCodeVersionId: body.activeCodeVersionId === null || typeof body.activeCodeVersionId === "string" ? body.activeCodeVersionId : undefined,
      activeRenderId: body.activeRenderId === null || typeof body.activeRenderId === "string" ? body.activeRenderId : undefined
    });
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not update chat" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const workspace = await updateChatSession(user.id, chatId, { archived: true });
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not archive chat" }, { status: 500 });
  }
}

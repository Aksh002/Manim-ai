import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { createChatSession, listChatSessions } from "@/lib/server/chat-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const chats = await listChatSessions(user.id);
    return NextResponse.json({ chats });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not list chats" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const workspace = await createChatSession(user.id, typeof body.title === "string" ? body.title : "Untitled scene");
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not create chat" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { deleteLlmConfig } from "@/lib/server/user-secrets";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    await deleteLlmConfig(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not delete LLM config" },
      { status: 500 }
    );
  }
}

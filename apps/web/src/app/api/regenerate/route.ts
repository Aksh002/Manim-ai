import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { getDecryptedLlmConfig } from "@/lib/server/user-secrets";
import { proxyJson } from "@/lib/server/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const llmConfig = await getDecryptedLlmConfig(user.id, body.llm_config_id);
    delete body.llm_config_id;
    const result = await proxyJson("/regenerate", { method: "POST", body: JSON.stringify(body) }, user, llmConfig);
    return result.response;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Regenerate request failed" },
      { status: 500 }
    );
  }
}

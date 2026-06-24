import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { getCreditSummary } from "@/lib/server/credits";
import { proxyJson } from "@/lib/server/backend-proxy";
import { getDecryptedLlmConfig } from "@/lib/server/user-secrets";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const llmConfig = await getDecryptedLlmConfig(user.id, body.llm_config_id);
    if (!llmConfig) {
      const credits = await getCreditSummary(user.id);
      if (process.env.AUTH_REQUIRED === "true" && credits.available <= 0) {
        return NextResponse.json(
          { detail: "No free credits remaining. Add an OpenAI-compatible API key to continue." },
          { status: 402 }
        );
      }
    }
    delete body.llm_config_id;
    const { response } = await proxyJson("/generate", { method: "POST", body: JSON.stringify(body) }, user, llmConfig);
    return response;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Generate request failed" },
      { status: 500 }
    );
  }
}

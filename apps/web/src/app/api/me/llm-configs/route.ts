import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { createLlmConfig, listLlmConfigs } from "@/lib/server/user-secrets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json({ configs: await listLlmConfigs(user.id) });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "LLM config request failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    if (!body.name || !body.base_url || !body.model || !body.api_key) {
      return NextResponse.json({ detail: "name, base_url, model, and api_key are required" }, { status: 400 });
    }
    const config = await createLlmConfig({
      userId: user.id,
      name: String(body.name),
      baseUrl: String(body.base_url),
      model: String(body.model),
      apiKey: String(body.api_key)
    });
    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not save LLM config" },
      { status: 500 }
    );
  }
}

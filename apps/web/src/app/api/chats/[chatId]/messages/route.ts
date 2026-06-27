import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth-guard";
import { getCreditSummary } from "@/lib/server/credits";
import {
  createChatMessage,
  createCodeVersion,
  defaultChatTitle,
  getChatWorkspace,
  updateChatSession
} from "@/lib/server/chat-store";
import { proxyJson } from "@/lib/server/backend-proxy";
import { getDecryptedLlmConfig } from "@/lib/server/user-secrets";
import { GenerateResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ chatId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await context.params;
    const body = await request.json();
    const payload = body.payload ?? body;
    const prompt = String(payload.topic ?? body.content ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ detail: "Prompt is required" }, { status: 400 });
    }

    const userMessage = await createChatMessage(user.id, chatId, {
      role: "user",
      kind: "user_prompt",
      content: prompt,
      metadata: {
        duration_seconds: payload.duration_seconds,
        style: payload.style,
        level: payload.level,
        additional_instructions: payload.additional_instructions
      }
    });

    const llmConfig = await getDecryptedLlmConfig(user.id, payload.llm_config_id);
    if (!llmConfig) {
      const credits = await getCreditSummary(user.id);
      if (process.env.AUTH_REQUIRED === "true" && credits.available <= 0) {
        return NextResponse.json(
          { detail: "No free credits remaining. Add an OpenAI-compatible API key to continue." },
          { status: 402 }
        );
      }
    }

    const backendPayload = { ...payload };
    delete backendPayload.llm_config_id;
    const result = await proxyJson<GenerateResponse>(
      "/generate",
      { method: "POST", body: JSON.stringify(backendPayload) },
      user,
      llmConfig
    );
    if (!result.ok || !result.body) {
      await createChatMessage(user.id, chatId, {
        role: "assistant",
        kind: "error",
        content: "Generation failed.",
        metadata: { status: result.response.status, body: result.body }
      });
      return result.response;
    }

    const assistantMessage = await createChatMessage(user.id, chatId, {
      role: "assistant",
      kind: result.body.source === "fallback" ? "generation_warning" : "generation",
      content: `Generated Manim code${result.body.pipeline_mode ? ` with ${result.body.pipeline_mode} planning` : ""}.`,
      metadata: {
        source: result.body.source,
        model: result.body.model,
        warnings: result.body.warnings,
        pipeline_mode: result.body.pipeline_mode,
        storyboard: result.body.storyboard,
        scene_plan: result.body.scene_plan,
        skill_provenance: result.body.skill_provenance,
        planning_report: result.body.planning_report,
        generation_attempts: result.body.generation_attempts,
        quality_report: result.body.quality_report
      }
    });

    await createCodeVersion(user.id, chatId, {
      code: result.body.code,
      source: "generated",
      messageId: assistantMessage.id,
      metadata: {
        promptMessageId: userMessage.id,
        source: result.body.source,
        model: result.body.model,
        warnings: result.body.warnings,
        storyboard: result.body.storyboard,
        storyboard_document: result.body.storyboard_document,
        scene_plan: result.body.scene_plan,
        planning_report: result.body.planning_report,
        skill_provenance: result.body.skill_provenance,
        manim_version: result.body.manim_version,
        generation_attempts: result.body.generation_attempts,
        quality_report: result.body.quality_report,
        pipeline_mode: result.body.pipeline_mode
      }
    });

    await updateChatSession(user.id, chatId, { title: defaultChatTitle(prompt) });
    const workspace = await getChatWorkspace(user.id, chatId);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json({ detail: error instanceof Error ? error.message : "Could not generate in chat" }, { status: 500 });
  }
}

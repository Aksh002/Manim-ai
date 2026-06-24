import { NextRequest, NextResponse } from "next/server";
import { CurrentUser } from "@/lib/server/auth-guard";

const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type InternalLlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
} | null;

export async function proxyJson<T>(
  path: string,
  init: RequestInit,
  user: CurrentUser,
  llmConfig?: InternalLlmConfig
): Promise<{ response: NextResponse; body: T | null; ok: boolean }> {
  const headers = internalHeaders(user, llmConfig);
  const response = await fetch(`${INTERNAL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return {
    response: NextResponse.json(body, { status: response.status }),
    body,
    ok: response.ok
  };
}

export async function proxyArtifact(request: NextRequest, backendPath: string, user: CurrentUser) {
  const range = request.headers.get("range");
  const response = await fetch(`${INTERNAL_API_BASE}${backendPath}${request.nextUrl.search}`, {
    headers: {
      ...internalHeaders(user),
      ...(range ? { Range: range } : {})
    },
    cache: "no-store",
    redirect: "manual"
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      return NextResponse.redirect(location);
    }
  }

  const headers = new Headers({
    "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": "private, no-store"
  });
  for (const header of ["accept-ranges", "content-range", "content-length", "content-disposition"]) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers
  });
}

export function rewriteBackendUrls<T extends Record<string, unknown>>(body: T | null): T | null {
  if (!body) {
    return body;
  }
  const clone: Record<string, unknown> = { ...body };
  for (const key of ["video_url", "thumbnail_url"]) {
    const value = clone[key];
    if (typeof value === "string" && value.startsWith("/artifacts/")) {
      clone[key] = `/api${value}`;
    }
  }
  return clone as T;
}

function internalHeaders(user: CurrentUser, llmConfig?: InternalLlmConfig): HeadersInit {
  const token = process.env.INTERNAL_API_TOKEN;
  const requestId = crypto.randomUUID();
  return {
    ...(token ? { "x-manim-internal-token": token } : {}),
    "x-request-id": requestId,
    "x-manim-user-id": user.id,
    "x-manim-user-email": user.email ?? "",
    ...(llmConfig
      ? {
          "x-manim-llm-base-url": llmConfig.baseUrl,
          "x-manim-llm-api-key": llmConfig.apiKey,
          "x-manim-llm-model": llmConfig.model
        }
      : {})
  };
}

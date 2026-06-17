// The frontend calls POST /generate through api-client.ts (line 1).

import {
  GeneratePayload,
  GenerateResponse,
  JobStatus,
  RegeneratePayload,
  RegenerateResponse,
  RenderPayload,
  RenderResponse
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function generateCode(payload: GeneratePayload): Promise<GenerateResponse> {
  return api<GenerateResponse>("/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function renderCode(payload: RenderPayload): Promise<RenderResponse> {
  return api<RenderResponse>("/render", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function regenerateCode(payload: RegeneratePayload): Promise<RegenerateResponse> {
  return api<RegenerateResponse>("/regenerate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getJobStatus(jobId: string, ownerToken: string): Promise<JobStatus> {
  const params = new URLSearchParams({ owner_token: ownerToken });
  return api<JobStatus>(`/status/${jobId}?${params.toString()}`);
}

export function getVideoUrl(jobId: string, ownerToken: string): string {
  const params = new URLSearchParams({ owner_token: ownerToken });
  return `${API_BASE}/video/${jobId}?${params.toString()}`;
}

export function getThumbnailUrl(jobId: string, ownerToken: string): string {
  const params = new URLSearchParams({ owner_token: ownerToken });
  return `${API_BASE}/thumbnail/${jobId}?${params.toString()}`;
}

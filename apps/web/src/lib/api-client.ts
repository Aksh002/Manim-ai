import {
  CreditSummary,
  GeneratePayload,
  GenerateResponse,
  JobStatus,
  LlmConfigMetadata,
  RegeneratePayload,
  RegenerateResponse,
  RenderPayload,
  RenderResponse
} from "@/lib/types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
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
  return api<GenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function renderCode(payload: RenderPayload): Promise<RenderResponse> {
  return api<RenderResponse>("/api/render", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function regenerateCode(payload: RegeneratePayload): Promise<RegenerateResponse> {
  return api<RegenerateResponse>("/api/regenerate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getJobStatus(jobId: string, _ownerToken?: string | null): Promise<JobStatus> {
  return api<JobStatus>(`/api/status/${jobId}`);
}

export function cancelJob(jobId: string, _ownerToken?: string | null): Promise<JobStatus> {
  return api<JobStatus>(`/api/jobs/${jobId}/cancel`, {
    method: "POST"
  });
}

export function getWorkersHealth(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>("/api/workers/health");
}

export function getCreditSummary(): Promise<{ credits: CreditSummary }> {
  return api<{ credits: CreditSummary }>("/api/me/credits");
}

export function listLlmConfigs(): Promise<{ configs: LlmConfigMetadata[] }> {
  return api<{ configs: LlmConfigMetadata[] }>("/api/me/llm-configs");
}

export function createLlmConfig(payload: {
  name: string;
  base_url: string;
  model: string;
  api_key: string;
}): Promise<{ config: LlmConfigMetadata }> {
  return api<{ config: LlmConfigMetadata }>("/api/me/llm-configs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteLlmConfig(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/me/llm-configs/${id}`, {
    method: "DELETE"
  });
}

export function resolveApiUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return url;
}

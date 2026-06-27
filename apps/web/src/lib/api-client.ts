import {
  ChatRenderResponse,
  ChatSessionSummary,
  ChatWorkspace,
  CreditSummary,
  GeneratePayload,
  GenerateResponse,
  JobStatus,
  LlmConfigMetadata,
  RegeneratePayload,
  RegenerateResponse,
  RenderPayload,
  RenderQuality,
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
export function listChats(): Promise<{ chats: ChatSessionSummary[] }> {
  return api<{ chats: ChatSessionSummary[] }>("/api/chats");
}

export function createChat(title?: string): Promise<ChatWorkspace> {
  return api<ChatWorkspace>("/api/chats", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}

export function getChat(chatId: string): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}`);
}

export function updateChat(
  chatId: string,
  payload: { title?: string; archived?: boolean; activeCodeVersionId?: string | null; activeRenderId?: string | null }
): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function archiveChat(chatId: string): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}`, {
    method: "DELETE"
  });
}

export function sendChatPrompt(chatId: string, payload: GeneratePayload): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ payload })
  });
}

export function saveCodeVersion(
  chatId: string,
  payload: {
    code: string;
    source: string;
    parentVersionId?: string | null;
    instruction?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}/code-versions`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function startChatRender(
  chatId: string,
  payload: {
    codeVersionId: string;
    quality: RenderQuality;
    retry_on_error: boolean;
    target: "draft" | "final";
    llm_config_id?: string | null;
  }
): Promise<ChatRenderResponse> {
  return api<ChatRenderResponse>(`/api/chats/${chatId}/renders`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function pinChatRender(chatId: string, renderId: string, pinned: boolean): Promise<ChatWorkspace> {
  return api<ChatWorkspace>(`/api/chats/${chatId}/renders/${renderId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned })
  });
}

export function cancelChatRender(chatId: string, renderId: string): Promise<{ status: unknown; workspace: ChatWorkspace }> {
  return api<{ status: unknown; workspace: ChatWorkspace }>(`/api/chats/${chatId}/renders/${renderId}/cancel`, {
    method: "POST"
  });
}


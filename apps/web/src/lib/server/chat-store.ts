import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/server/prisma";
import { JobStatus } from "@/lib/types";

const STARTER_CODE = "from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n";

export type ChatMessageInput = {
  role: string;
  kind: string;
  content: string;
  metadata?: Record<string, unknown> | null;
};

export type CodeVersionInput = {
  code: string;
  source: string;
  messageId?: string | null;
  parentVersionId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SessionRenderInput = {
  codeVersionId: string;
  target: "draft" | "final";
  quality: string;
  status: string;
  backendJobId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const devState = {
  sessions: new Map<string, any>(),
  messages: new Map<string, any>(),
  codeVersions: new Map<string, any>(),
  renders: new Map<string, any>()
};

function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function defaultChatTitle(prompt?: string) {
  const value = (prompt ?? "Untitled scene").trim().replace(/\s+/g, " ");
  if (!value) {
    return "Untitled scene";
  }
  return value.length > 52 ? `${value.slice(0, 49)}...` : value;
}

export async function listChatSessions(userId: string) {
  if (!hasDb()) {
    return Array.from(devState.sessions.values())
      .filter((session) => session.userId === userId && !session.archived)
      .sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt))
      .map(serializeSessionSummary);
  }

  const sessions = await prisma.chatSession.findMany({
    where: { userId, archived: false },
    orderBy: { lastActivityAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      renders: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
  return sessions.map(serializeSessionSummary);
}

export async function createChatSession(userId: string, title = "Untitled scene") {
  if (!hasDb()) {
    const now = new Date().toISOString();
    const session = {
      id: randomUUID(),
      userId,
      title,
      archived: false,
      activeCodeVersionId: null,
      activeRenderId: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    };
    devState.sessions.set(session.id, session);
    return getChatWorkspace(userId, session.id);
  }

  const session = await prisma.chatSession.create({
    data: { userId, title }
  });
  return getChatWorkspace(userId, session.id);
}

export async function getChatWorkspace(userId: string, chatId: string) {
  if (!hasDb()) {
    const session = assertDevSession(userId, chatId);
    return serializeWorkspace(
      session,
      Array.from(devState.messages.values()).filter((message) => message.chatSessionId === chatId),
      Array.from(devState.codeVersions.values()).filter((version) => version.chatSessionId === chatId),
      Array.from(devState.renders.values()).filter((render) => render.chatSessionId === chatId)
    );
  }

  const session = await prisma.chatSession.findFirst({
    where: { id: chatId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      codeVersions: { orderBy: { createdAt: "asc" } },
      renders: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!session) {
    throw new Response(JSON.stringify({ detail: "Chat not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  return serializeWorkspace(session, session.messages, session.codeVersions, session.renders);
}

export async function updateChatSession(
  userId: string,
  chatId: string,
  data: { title?: string; archived?: boolean; activeCodeVersionId?: string | null; activeRenderId?: string | null }
) {
  if (!hasDb()) {
    const session = assertDevSession(userId, chatId);
    Object.assign(session, data, { updatedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() });
    return getChatWorkspace(userId, chatId);
  }

  await prisma.chatSession.updateMany({
    where: { id: chatId, userId },
    data: { ...data, lastActivityAt: new Date() }
  });
  return getChatWorkspace(userId, chatId);
}

export async function createChatMessage(userId: string, chatId: string, input: ChatMessageInput) {
  if (!hasDb()) {
    assertDevSession(userId, chatId);
    const now = new Date().toISOString();
    const message = { id: randomUUID(), userId, chatSessionId: chatId, createdAt: now, ...input };
    devState.messages.set(message.id, message);
    touchDevSession(chatId);
    return serializeMessage(message);
  }

  const message = await prisma.chatMessage.create({
    data: {
      userId,
      chatSessionId: chatId,
      role: input.role,
      kind: input.kind,
      content: input.content,
      metadata: (input.metadata ?? undefined) as any
    }
  });
  await prisma.chatSession.update({ where: { id: chatId }, data: { lastActivityAt: new Date() } });
  return serializeMessage(message);
}

export async function createCodeVersion(userId: string, chatId: string, input: CodeVersionInput) {
  const codeHash = hashCode(input.code);
  if (!hasDb()) {
    assertDevSession(userId, chatId);
    const now = new Date().toISOString();
    const version = {
      id: randomUUID(),
      userId,
      chatSessionId: chatId,
      codeHash,
      createdAt: now,
      ...input,
      messageId: input.messageId ?? null,
      parentVersionId: input.parentVersionId ?? null,
      metadata: input.metadata ?? null
    };
    devState.codeVersions.set(version.id, version);
    const session = assertDevSession(userId, chatId);
    session.activeCodeVersionId = version.id;
    session.activeRenderId = null;
    touchDevSession(chatId);
    return serializeCodeVersion(version);
  }

  const version = await prisma.codeVersion.create({
    data: {
      userId,
      chatSessionId: chatId,
      code: input.code,
      codeHash,
      source: input.source,
      messageId: input.messageId ?? null,
      parentVersionId: input.parentVersionId ?? null,
      metadata: (input.metadata ?? undefined) as any
    }
  });
  await prisma.chatSession.update({
    where: { id: chatId },
    data: { activeCodeVersionId: version.id, activeRenderId: null, lastActivityAt: new Date() }
  });
  return serializeCodeVersion(version);
}

export async function createSessionRender(userId: string, chatId: string, input: SessionRenderInput) {
  const codeVersion = await findCodeVersion(userId, chatId, input.codeVersionId);
  if (!codeVersion) {
    throw new Response(JSON.stringify({ detail: "Code version not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!hasDb()) {
    const now = new Date().toISOString();
    const render = {
      id: randomUUID(),
      userId,
      chatSessionId: chatId,
      codeVersionId: input.codeVersionId,
      target: input.target,
      quality: input.quality,
      status: input.status,
      backendJobId: input.backendJobId ?? null,
      codeHash: codeVersion.codeHash,
      videoUrl: null,
      thumbnailUrl: null,
      artifactExpiresAt: null,
      pinned: false,
      artifactAvailable: false,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now
    };
    devState.renders.set(render.id, render);
    const session = assertDevSession(userId, chatId);
    session.activeRenderId = render.id;
    touchDevSession(chatId);
    return serializeRender(render);
  }

  const render = await prisma.sessionRender.create({
    data: {
      userId,
      chatSessionId: chatId,
      codeVersionId: input.codeVersionId,
      target: input.target,
      quality: input.quality,
      status: input.status,
      backendJobId: input.backendJobId ?? null,
      codeHash: codeVersion.codeHash,
      metadata: (input.metadata ?? undefined) as any
    }
  });
  await prisma.chatSession.update({
    where: { id: chatId },
    data: { activeRenderId: render.id, lastActivityAt: new Date() }
  });
  return serializeRender(render);
}

export async function updateSessionRenderBackendJob(
  userId: string,
  renderId: string,
  backendJobId: string,
  status: string
) {
  if (!hasDb()) {
    const render = devState.renders.get(renderId);
    if (render?.userId === userId) {
      render.backendJobId = backendJobId;
      render.status = status;
      render.updatedAt = new Date().toISOString();
    }
    return;
  }

  await prisma.sessionRender.updateMany({
    where: { id: renderId, userId },
    data: { backendJobId, status }
  });
}

export async function syncSessionRenderFromStatus(userId: string, backendJobId: string, status: JobStatus) {
  const data = {
    status: status.status,
    codeHash: status.code_hash,
    videoUrl: status.video_url,
    thumbnailUrl: status.thumbnail_url,
    artifactExpiresAt: status.artifact_expires_at ? new Date(status.artifact_expires_at) : null,
    artifactAvailable: status.status === "done" && Boolean(status.video_url),
    metadata: {
      artifact_metadata: status.artifact_metadata,
      quality_report: status.quality_report,
      attempts: status.attempts,
      error_type: status.error_type,
      error_summary: status.error_summary,
      final_code: status.final_code,
      input_code: status.input_code,
      repair_attempts: status.repair_attempts,
      stage: status.stage,
      progress: status.progress
    }
  };

  if (!hasDb()) {
    for (const render of devState.renders.values()) {
      if (render.userId === userId && render.backendJobId === backendJobId) {
        Object.assign(render, {
          ...data,
          artifactExpiresAt: status.artifact_expires_at,
          updatedAt: new Date().toISOString()
        });
      }
    }
    return;
  }

  await prisma.sessionRender.updateMany({
    where: { userId, backendJobId },
    data: data as any
  });
}

export async function setRenderPinned(userId: string, chatId: string, renderId: string, pinned: boolean) {
  if (!hasDb()) {
    const render = devState.renders.get(renderId);
    if (!render || render.userId !== userId || render.chatSessionId !== chatId) {
      throwNotFound("Render not found");
    }
    render.pinned = pinned;
    render.updatedAt = new Date().toISOString();
    return serializeRender(render);
  }

  await prisma.sessionRender.updateMany({
    where: { id: renderId, userId, chatSessionId: chatId },
    data: { pinned }
  });
  const render = await prisma.sessionRender.findFirst({ where: { id: renderId, userId, chatSessionId: chatId } });
  if (!render) {
    throwNotFound("Render not found");
  }
  return serializeRender(render);
}

export async function findCodeVersion(userId: string, chatId: string, codeVersionId: string) {
  if (!hasDb()) {
    const version = devState.codeVersions.get(codeVersionId);
    return version?.userId === userId && version.chatSessionId === chatId ? version : null;
  }
  return prisma.codeVersion.findFirst({ where: { id: codeVersionId, userId, chatSessionId: chatId } });
}

export async function findSessionRender(userId: string, chatId: string, renderId: string) {
  if (!hasDb()) {
    const render = devState.renders.get(renderId);
    return render?.userId === userId && render.chatSessionId === chatId ? render : null;
  }
  return prisma.sessionRender.findFirst({ where: { id: renderId, userId, chatSessionId: chatId } });
}

export function serializeWorkspace(session: any, messages: any[], codeVersions: any[], renders: any[]) {
  return {
    session: serializeSession(session),
    messages: messages.sort(byCreatedAtAsc).map(serializeMessage),
    codeVersions: codeVersions.sort(byCreatedAtAsc).map(serializeCodeVersion),
    renders: renders.sort(byCreatedAtDesc).map(serializeRender)
  };
}

function serializeSessionSummary(session: any) {
  return {
    id: session.id,
    title: session.title,
    archived: session.archived,
    activeCodeVersionId: session.activeCodeVersionId,
    activeRenderId: session.activeRenderId,
    createdAt: toIso(session.createdAt),
    updatedAt: toIso(session.updatedAt),
    lastActivityAt: toIso(session.lastActivityAt),
    latestMessage: Array.isArray(session.messages) ? session.messages[0]?.content ?? null : null,
    latestRenderStatus: Array.isArray(session.renders) ? session.renders[0]?.status ?? null : null
  };
}

function serializeSession(session: any) {
  return {
    id: session.id,
    title: session.title,
    archived: session.archived,
    activeCodeVersionId: session.activeCodeVersionId,
    activeRenderId: session.activeRenderId,
    metadata: session.metadata ?? null,
    createdAt: toIso(session.createdAt),
    updatedAt: toIso(session.updatedAt),
    lastActivityAt: toIso(session.lastActivityAt)
  };
}

function serializeMessage(message: any) {
  return {
    id: message.id,
    role: message.role,
    kind: message.kind,
    content: message.content,
    metadata: message.metadata ?? null,
    createdAt: toIso(message.createdAt)
  };
}

function serializeCodeVersion(version: any) {
  return {
    id: version.id,
    source: version.source,
    code: version.code,
    codeHash: version.codeHash,
    messageId: version.messageId ?? null,
    parentVersionId: version.parentVersionId ?? null,
    metadata: version.metadata ?? null,
    createdAt: toIso(version.createdAt)
  };
}

function serializeRender(render: any) {
  return {
    id: render.id,
    codeVersionId: render.codeVersionId,
    backendJobId: render.backendJobId ?? null,
    target: render.target,
    quality: render.quality,
    status: render.status,
    codeHash: render.codeHash ?? null,
    videoUrl: render.videoUrl ?? null,
    thumbnailUrl: render.thumbnailUrl ?? null,
    artifactExpiresAt: render.artifactExpiresAt ? toIso(render.artifactExpiresAt) : null,
    pinned: render.pinned,
    artifactAvailable: render.artifactAvailable,
    metadata: render.metadata ?? null,
    createdAt: toIso(render.createdAt),
    updatedAt: toIso(render.updatedAt)
  };
}

function assertDevSession(userId: string, chatId: string) {
  const session = devState.sessions.get(chatId);
  if (!session || session.userId !== userId) {
    throwNotFound("Chat not found");
  }
  return session;
}

function touchDevSession(chatId: string) {
  const session = devState.sessions.get(chatId);
  if (session) {
    const now = new Date().toISOString();
    session.updatedAt = now;
    session.lastActivityAt = now;
  }
}

function throwNotFound(detail: string): never {
  throw new Response(JSON.stringify({ detail }), {
    status: 404,
    headers: { "Content-Type": "application/json" }
  });
}

function byCreatedAtAsc(a: any, b: any) {
  return +new Date(a.createdAt) - +new Date(b.createdAt);
}

function byCreatedAtDesc(a: any, b: any) {
  return +new Date(b.createdAt) - +new Date(a.createdAt);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export { STARTER_CODE };



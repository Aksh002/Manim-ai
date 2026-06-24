import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/server/prisma";

type LlmConfigInput = {
  userId: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type LlmConfigMetadata = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyPreview: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error("Base URL must start with http:// or https://");
  }
  return trimmed;
}

export async function listLlmConfigs(userId: string): Promise<LlmConfigMetadata[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }
  const rows = await prisma.llmConfig.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" }
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    keyPreview: maskEncryptedSecret(row.encryptedApiKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }));
}

export async function createLlmConfig(input: LlmConfigInput): Promise<LlmConfigMetadata> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to store user LLM keys");
  }
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(input.baseUrl);
  const row = await prisma.llmConfig.create({
    data: {
      userId: input.userId,
      name: input.name.trim() || "OpenAI-compatible key",
      baseUrl,
      model: input.model.trim(),
      encryptedApiKey: encryptSecret(input.apiKey.trim())
    }
  });
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    keyPreview: maskApiKey(input.apiKey),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function deleteLlmConfig(userId: string, id: string): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  await prisma.llmConfig.updateMany({
    where: { id, userId },
    data: { deletedAt: new Date() }
  });
}

export async function getDecryptedLlmConfig(userId: string, id: string | null | undefined) {
  if (!process.env.DATABASE_URL || !id) {
    return null;
  }
  const row = await prisma.llmConfig.findFirst({
    where: { id, userId, deletedAt: null }
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: decryptSecret(row.encryptedApiKey)
  };
}

function encryptSecret(value: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptSecret(value: string): string {
  const [_version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function encryptionKey(): Buffer {
  const secret = process.env.USER_SECRET_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new Error("USER_SECRET_ENCRYPTION_KEY must be set to a long random value");
  }
  return createHash("sha256").update(secret).digest();
}

function maskEncryptedSecret(_encrypted: string): string {
  return "stored securely";
}

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

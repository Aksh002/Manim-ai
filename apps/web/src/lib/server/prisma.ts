import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: normalizedDatabaseUrl()
      ? {
          db: {
            url: normalizedDatabaseUrl()
          }
        }
      : undefined,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function normalizedDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (url.hostname.endsWith(".pooler.supabase.com")) {
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", url.searchParams.get("connection_limit") ?? "1");
  }

  return url.toString();
}

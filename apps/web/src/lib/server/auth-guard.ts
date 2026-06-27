import { auth } from "@/auth";
import { ensureCreditBalance } from "@/lib/server/credits";
import { prisma } from "@/lib/server/prisma";

const DEV_USER_ID = "dev-user";
const DEV_USER_EMAIL = "dev@manim-ai.local";

export type CurrentUser = {
  id: string;
  email: string | null;
  isDevFallback: boolean;
};

export async function requireCurrentUser(): Promise<CurrentUser> {
  const session = await auth();
  const id = session?.user?.id;
  if (id) {
    await ensureCreditBalance(id);
    return {
      id,
      email: session.user?.email ?? null,
      isDevFallback: false
    };
  }

  if (process.env.AUTH_REQUIRED !== "true") {
    await ensureDevFallbackUser();
    await ensureCreditBalance(DEV_USER_ID);
    return {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      isDevFallback: true
    };
  }

  throw new Response(JSON.stringify({ detail: "Authentication required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
}

async function ensureDevFallbackUser() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await prisma.user.upsert({
    where: { id: DEV_USER_ID },
    update: {
      email: DEV_USER_EMAIL,
      name: "Local Dev User"
    },
    create: {
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: "Local Dev User"
    }
  });
}

import { auth } from "@/auth";
import { ensureCreditBalance } from "@/lib/server/credits";

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
    return {
      id: "dev-user",
      email: "dev@manim-ai.local",
      isDevFallback: true
    };
  }

  throw new Response(JSON.stringify({ detail: "Authentication required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
}

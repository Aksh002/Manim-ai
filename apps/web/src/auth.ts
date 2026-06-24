import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/server/prisma";
import { ensureCreditBalance } from "@/lib/server/credits";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  );
}

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: process.env.DATABASE_URL ? PrismaAdapter(prisma) : undefined,
  providers,
  session: {
    strategy: process.env.DATABASE_URL ? "database" : "jwt"
  },
  callbacks: {
    async session({ session, user, token }) {
      const id = user?.id ?? token?.sub;
      if (session.user && id) {
        session.user.id = id;
      }
      return session;
    }
  },
  events: {
    async createUser({ user }) {
      if (user.id) {
        await ensureCreditBalance(user.id);
      }
    }
  },
  trustHost: true
});

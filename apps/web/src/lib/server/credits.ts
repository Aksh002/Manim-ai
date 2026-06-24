import { prisma } from "@/lib/server/prisma";

export type CreditSummary = {
  available: number;
  reserved: number;
  spent: number;
  refunded: number;
  expired: number;
  freeCreditsOnSignup: number;
};

const FREE_CREDITS = Number(process.env.FREE_CREDITS_ON_SIGNUP ?? 5);
const BYOK_DAILY_RENDER_LIMIT = Number(process.env.BYOK_DAILY_RENDER_LIMIT ?? 20);

export async function ensureCreditBalance(userId: string): Promise<CreditSummary> {
  if (!process.env.DATABASE_URL) {
    return devCreditSummary();
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.creditBalance.findUnique({ where: { userId } });
    if (existing) {
      return { ...existing, freeCreditsOnSignup: FREE_CREDITS };
    }

    const created = await tx.creditBalance.create({
      data: {
        userId,
        available: FREE_CREDITS
      }
    });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: FREE_CREDITS,
        state: "available",
        reason: "signup_grant"
      }
    });
    return { ...created, freeCreditsOnSignup: FREE_CREDITS };
  });
}

export async function getCreditSummary(userId: string): Promise<CreditSummary> {
  if (!process.env.DATABASE_URL) {
    return devCreditSummary();
  }
  const balance = await ensureCreditBalance(userId);
  return {
    available: balance.available,
    reserved: balance.reserved,
    spent: balance.spent,
    refunded: balance.refunded,
    expired: balance.expired,
    freeCreditsOnSignup: FREE_CREDITS
  };
}

export async function reserveRenderCredit(userId: string, reason = "render_reservation") {
  if (!process.env.DATABASE_URL) {
    return { ledgerId: "dev-credit-ledger", balance: devCreditSummary() };
  }

  return prisma.$transaction(async (tx) => {
    const balance = await tx.creditBalance.upsert({
      where: { userId },
      update: {},
      create: { userId, available: FREE_CREDITS }
    });
    if (balance.available < 1) {
      throw new Error("No free credits remaining. Add an OpenAI-compatible API key to continue.");
    }

    const updated = await tx.creditBalance.update({
      where: { userId },
      data: {
        available: { decrement: 1 },
        reserved: { increment: 1 }
      }
    });
    const ledger = await tx.creditLedger.create({
      data: {
        userId,
        amount: -1,
        state: "reserved",
        reason
      }
    });
    return { ledgerId: ledger.id, balance: { ...updated, freeCreditsOnSignup: FREE_CREDITS } };
  });
}

export async function assertByokDailyRenderLimit(userId: string) {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const count = await prisma.renderJob.count({
    where: {
      userId,
      creditLedgerId: null,
      createdAt: { gte: since }
    }
  });
  if (count >= BYOK_DAILY_RENDER_LIMIT) {
    throw new Error(`Daily BYOK render limit reached (${BYOK_DAILY_RENDER_LIMIT}). Try again tomorrow.`);
  }
}

export async function attachRenderJob(input: {
  userId: string;
  backendJobId: string;
  creditLedgerId?: string | null;
  status: string;
  target?: string | null;
  codeHash?: string | null;
}) {
  if (!process.env.DATABASE_URL) {
    return;
  }
  await prisma.renderJob.upsert({
    where: { backendJobId: input.backendJobId },
    update: {
      status: input.status,
      target: input.target,
      codeHash: input.codeHash,
      creditLedgerId: input.creditLedgerId
    },
    create: input
  });
}

export async function releaseReservedCredit(userId: string, ledgerId: string, reason = "enqueue_failed") {
  if (!process.env.DATABASE_URL || ledgerId === "dev-credit-ledger") {
    return;
  }
  await refundReservedCredit(userId, ledgerId, null, reason);
}

export async function syncRenderCreditFromStatus(input: {
  userId: string;
  backendJobId: string;
  status: string;
  stage?: string | null;
  errorType?: string | null;
}) {
  if (!process.env.DATABASE_URL) {
    return;
  }
  const job = await prisma.renderJob.findFirst({
    where: { backendJobId: input.backendJobId, userId: input.userId }
  });
  if (!job || !job.creditLedgerId) {
    return;
  }
  if (job.status === input.status || ["done", "failed_spent", "refunded", "cancelled_refunded"].includes(job.status)) {
    return;
  }

  if (input.status === "done") {
    await spendReservedCredit(input.userId, job.creditLedgerId, input.backendJobId);
    await prisma.renderJob.update({
      where: { backendJobId: input.backendJobId },
      data: { status: "done" }
    });
    return;
  }

  if (input.status === "cancelled" || input.status === "timeout" || input.errorType === "sandbox") {
    await refundReservedCredit(input.userId, job.creditLedgerId, input.backendJobId, input.status);
    await prisma.renderJob.update({
      where: { backendJobId: input.backendJobId },
      data: { status: `${input.status}_refunded` }
    });
    return;
  }

  if (input.status === "failed") {
    await spendReservedCredit(input.userId, job.creditLedgerId, input.backendJobId, "failed_generation_or_render");
    await prisma.renderJob.update({
      where: { backendJobId: input.backendJobId },
      data: { status: "failed_spent" }
    });
  }
}

async function spendReservedCredit(userId: string, ledgerId: string, jobId: string, reason = "render_success") {
  await prisma.$transaction([
    prisma.creditBalance.update({
      where: { userId },
      data: {
        reserved: { decrement: 1 },
        spent: { increment: 1 }
      }
    }),
    prisma.creditLedger.update({
      where: { id: ledgerId },
      data: { jobId, state: "spent", reason }
    })
  ]);
}

async function refundReservedCredit(userId: string, ledgerId: string, jobId: string | null, reason: string) {
  await prisma.$transaction([
    prisma.creditBalance.update({
      where: { userId },
      data: {
        reserved: { decrement: 1 },
        refunded: { increment: 1 },
        available: { increment: 1 }
      }
    }),
    prisma.creditLedger.update({
      where: { id: ledgerId },
      data: { jobId, state: "refunded", reason }
    })
  ]);
}

function devCreditSummary(): CreditSummary {
  return {
    available: FREE_CREDITS,
    reserved: 0,
    spent: 0,
    refunded: 0,
    expired: 0,
    freeCreditsOnSignup: FREE_CREDITS
  };
}

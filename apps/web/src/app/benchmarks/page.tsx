import Link from "next/link";
import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export default async function BenchmarksPage() {
  const runs = process.env.DATABASE_URL
    ? await prisma.benchmarkRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 50
      })
    : [];

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Golden Prompt Benchmarks</h1>
          <p>Render quality, success rate, repairs, and runtime for tracked prompts.</p>
        </div>
        <Link className="button-link secondary" href="/">
          Workspace
        </Link>
      </header>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Recent Runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No benchmark runs recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prompt</th>
                  <th>Success</th>
                  <th>Quality</th>
                  <th>Repairs</th>
                  <th>Render seconds</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.prompt}</td>
                    <td>{run.success ? "yes" : "no"}</td>
                    <td>{run.qualityScore ?? "-"}</td>
                    <td>{run.repairAttempts ?? "-"}</td>
                    <td>{run.renderSeconds ?? "-"}</td>
                    <td>{run.createdAt.toISOString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

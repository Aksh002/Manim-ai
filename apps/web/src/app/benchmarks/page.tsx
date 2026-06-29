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
  const summary = summarizeRuns(runs);

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

      <section className="benchmark-summary" aria-label="Benchmark summary">
        <div>
          <span>Runs</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Success</span>
          <strong>{summary.successRate}</strong>
        </div>
        <div>
          <span>Avg quality</span>
          <strong>{summary.averageQuality}</strong>
        </div>
        <div>
          <span>Avg seconds</span>
          <strong>{summary.averageSeconds}</strong>
        </div>
      </section>

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

function summarizeRuns(
  runs: {
    success: boolean;
    qualityScore: number | null;
    renderSeconds: number | null;
  }[]
) {
  if (runs.length === 0) {
    return {
      total: 0,
      successRate: "-",
      averageQuality: "-",
      averageSeconds: "-"
    };
  }
  const qualityScores = runs.flatMap((run) => (run.qualityScore === null ? [] : [run.qualityScore]));
  const renderSeconds = runs.flatMap((run) => (run.renderSeconds === null ? [] : [run.renderSeconds]));
  const successRate = (runs.filter((run) => run.success).length / runs.length) * 100;
  return {
    total: runs.length,
    successRate: `${successRate.toFixed(0)}%`,
    averageQuality: average(qualityScores),
    averageSeconds: average(renderSeconds)
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return "-";
  }
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

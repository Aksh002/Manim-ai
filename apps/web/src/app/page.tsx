"use client";
// The UI in page.tsx (line 1) collects a topic, duration, style, level, and extra instructions through PromptForm.tsx (line 1). 
// It sends these inputs to the backend via the generateCode API (line 1 in api-client.ts) to get the generated Manim code, which is then displayed in CodeEditor.tsx (line 1). The user can edit the code if needed and click "Render Video" to send the code to the backend via the renderCode API (line 1 in api-client.ts). 
// The backend processes the code, renders the video, and updates the job status. The frontend polls for job status updates using getJobStatus API (line 1 in api-client.ts) and displays the video in VideoPlayer.tsx (line 1) once rendering is complete. If there are any errors during generation or rendering, they are displayed to the user.
import { useEffect, useMemo, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import JobStatusBadge from "@/components/JobStatusBadge";
import PromptForm from "@/components/PromptForm";
import VideoPlayer from "@/components/VideoPlayer";
import { generateCode, getJobStatus, getVideoUrl, regenerateCode, renderCode } from "@/lib/api-client";
import { GeneratePayload, JobStatus, RenderQuality } from "@/lib/types";

export default function HomePage() {
  const [code, setCode] = useState("from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n");
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingRender, setLoadingRender] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [quality, setQuality] = useState<RenderQuality>("1080p30");
  const [regenerateInstruction, setRegenerateInstruction] = useState("Make it shorter and more colorful.");
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);

  const videoUrl = useMemo(() => (jobId && jobStatus?.status === "done" ? getVideoUrl(jobId) : null), [jobId, jobStatus]);

  async function handleGenerate(payload: GeneratePayload) {
    setError(null);
    setWarnings([]);
    setLoadingGenerate(true);
    try {
      const result = await generateCode(payload);
      setCode(result.code);
      setWarnings(result.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handleRender() {
    setError(null);
    setLoadingRender(true);
    try {
      const result = await renderCode({ code, quality, retry_on_error: true });
      setJobId(result.job_id);
      const status = await getJobStatus(result.job_id);
      setJobStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render request failed");
    } finally {
      setLoadingRender(false);
    }
  }

  async function handleRegenerate() {
    setError(null);
    setLoadingRegenerate(true);
    try {
      const result = await regenerateCode({ code, instruction: regenerateInstruction });
      setCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate request failed");
    } finally {
      setLoadingRegenerate(false);
    }
  }

  useEffect(() => {
    if (!jobId) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        setJobStatus(status);
        if (["done", "failed", "timeout"].includes(status.status)) {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <main>
      <h1>AI-Powered Manim Video Generation</h1>
      <p>Prompt -> code -> secure render -> preview -> download</p>

      <div className="grid" style={{ marginTop: 16 }}>
        <PromptForm loading={loadingGenerate} onSubmit={handleGenerate} />

        <div className="card">
          <h2>Render Controls</h2>
          <label htmlFor="quality">Quality</label>
          <select id="quality" value={quality} onChange={(e) => setQuality(e.target.value as RenderQuality)}>
            <option value="1080p30">1080p30</option>
            <option value="720p30">720p30</option>
            <option value="480p15">480p15</option>
          </select>

          <div className="actions">
            <button onClick={handleRender} disabled={loadingRender || !code}>
              {loadingRender ? "Submitting Render..." : "Render Video"}
            </button>
          </div>

          <label htmlFor="regen" style={{ marginTop: 12 }}>
            Regenerate Instruction
          </label>
          <input
            id="regen"
            value={regenerateInstruction}
            onChange={(e) => setRegenerateInstruction(e.target.value)}
          />
          <div className="actions">
            <button
              className="secondary"
              onClick={handleRegenerate}
              disabled={loadingRegenerate || !code || !regenerateInstruction}
            >
              {loadingRegenerate ? "Regenerating..." : "Regenerate Code"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <JobStatusBadge
              status={jobStatus?.status ?? null}
              progress={jobStatus?.progress ?? 0}
              stage={jobStatus?.stage ?? "idle"}
            />
          </div>

          {error ? (
            <p style={{ color: "#8c1f1f", marginTop: 8, whiteSpace: "pre-wrap" }}>
              {error}
            </p>
          ) : null}
          {jobStatus?.error ? (
            <p style={{ color: "#8c1f1f", marginTop: 8, whiteSpace: "pre-wrap" }}>
              Render error: {jobStatus.error}
            </p>
          ) : null}
          {warnings.length > 0 ? (
            <p style={{ color: "#7a5a00", marginTop: 8, whiteSpace: "pre-wrap" }}>
              {warnings.join("\n")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <CodeEditor code={code} onChange={setCode} />
        <VideoPlayer videoUrl={videoUrl} jobId={jobId} />
      </div>
    </main>
  );
}

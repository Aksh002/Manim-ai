"use client";
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
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [quality, setQuality] = useState<RenderQuality>("1080p30");
  const [regenerateInstruction, setRegenerateInstruction] = useState("Make it shorter and more colorful.");
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);

  const videoUrl = useMemo(
    () => (jobId && ownerToken && jobStatus?.status === "done" ? getVideoUrl(jobId, ownerToken) : null),
    [jobId, ownerToken, jobStatus]
  );
  const hasRepairedCode =
    Boolean(jobStatus?.final_code) && jobStatus?.final_code !== code && (jobStatus?.repair_attempts ?? 0) > 0;

  function clearRenderState() {
    setJobStatus(null);
    setJobId(null);
    setOwnerToken(null);
    setPollingError(null);
  }

  function updateCode(nextCode: string) {
    setCode(nextCode);
    clearRenderState();
  }

  async function handleGenerate(payload: GeneratePayload) {
    setError(null);
    setWarnings([]);
    clearRenderState();
    setLoadingGenerate(true);
    try {
      const result = await generateCode(payload);
      setCode(result.code);
      setWarnings([...(result.source === "fallback" ? ["Generated from fallback template"] : []), ...(result.warnings ?? [])]);
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
      setOwnerToken(result.owner_token);
      if (!result.owner_token) {
        throw new Error("Render response did not include a job token");
      }
      const status = await getJobStatus(result.job_id, result.owner_token);
      setJobStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render request failed");
    } finally {
      setLoadingRender(false);
    }
  }

  async function handleRegenerate() {
    setError(null);
    clearRenderState();
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
    if (!jobId || !ownerToken) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId, ownerToken);
        setJobStatus(status);
        if (["done", "failed", "timeout"].includes(status.status)) {
          clearInterval(interval);
        }
      } catch (err) {
        setPollingError(err instanceof Error ? err.message : "Lost connection while polling render status");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, ownerToken]);

  return (
    <main>
      <h1>AI-Powered Manim Video Generation</h1>
      <p>{"Prompt -> code -> secure render -> preview -> download"}</p>

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
          {pollingError ? (
            <p style={{ color: "#8c1f1f", marginTop: 8, whiteSpace: "pre-wrap" }}>
              Status polling error: {pollingError}
            </p>
          ) : null}
          {hasRepairedCode ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "#25521f", marginTop: 0 }}>
                Render succeeded after {jobStatus?.repair_attempts} repair attempt(s).
              </p>
              <button className="secondary" onClick={() => updateCode(jobStatus?.final_code ?? code)}>
                Use Repaired Code
              </button>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <p style={{ color: "#7a5a00", marginTop: 8, whiteSpace: "pre-wrap" }}>
              {warnings.join("\n")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <CodeEditor code={code} onChange={updateCode} />
        <VideoPlayer videoUrl={videoUrl} jobId={jobId} />
      </div>
    </main>
  );
}

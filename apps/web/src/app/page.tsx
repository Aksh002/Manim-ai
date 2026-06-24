"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import JobStatusBadge from "@/components/JobStatusBadge";
import PromptForm from "@/components/PromptForm";
import VideoPlayer from "@/components/VideoPlayer";
import {
  cancelJob,
  createLlmConfig,
  deleteLlmConfig,
  generateCode,
  getCreditSummary,
  getJobStatus,
  getWorkersHealth,
  listLlmConfigs,
  regenerateCode,
  renderCode,
  resolveApiUrl
} from "@/lib/api-client";
import { CreditSummary, GeneratePayload, JobStatus, LlmConfigMetadata, RenderQuality } from "@/lib/types";

type RenderHistoryItem = {
  jobId: string;
  status: string;
  target: "draft" | "final";
  codeHash: string | null;
  createdAt: string;
};

export default function HomePage() {
  const [code, setCode] = useState("from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n");
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingRender, setLoadingRender] = useState(false);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [quality, setQuality] = useState<RenderQuality>("1080p30");
  const [regenerateInstruction, setRegenerateInstruction] = useState("Make it shorter and more colorful.");
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryItem[]>([]);
  const [workerHealth, setWorkerHealth] = useState<Record<string, unknown> | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<LlmConfigMetadata[]>([]);
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    name: "My OpenAI-compatible key",
    base_url: "",
    model: "",
    api_key: ""
  });

  const videoUrl = useMemo(
    () => (jobStatus?.status === "done" ? resolveApiUrl(jobStatus.video_url) : null),
    [jobStatus]
  );
  const thumbnailUrl = useMemo(
    () => (jobStatus?.status === "done" ? resolveApiUrl(jobStatus.thumbnail_url) : null),
    [jobStatus]
  );
  const hasRepairHistory = (jobStatus?.attempts?.length ?? 0) > 0;
  const artifactMetadata = jobStatus?.artifact_metadata ?? null;
  const qualityReport = jobStatus?.quality_report ?? null;
  const usingByok = Boolean(selectedLlmConfigId);

  function clearRenderState() {
    setJobStatus(null);
    setJobId(null);
    setPollingError(null);
  }

  function updateCode(nextCode: string) {
    setCode(nextCode);
    clearRenderState();
  }

  const refreshAccountState = useCallback(async () => {
    const [creditResult, configResult] = await Promise.all([
      getCreditSummary(),
      listLlmConfigs().catch(() => ({ configs: [] }))
    ]);
    setCredits(creditResult.credits);
    setLlmConfigs(configResult.configs);
    if (!selectedLlmConfigId && configResult.configs.length > 0) {
      setSelectedLlmConfigId(configResult.configs[0].id);
    }
  }, [selectedLlmConfigId]);

  async function handleGenerate(payload: GeneratePayload) {
    setError(null);
    setWarnings([]);
    clearRenderState();
    setLoadingGenerate(true);
    try {
      const result = await generateCode({ ...payload, llm_config_id: selectedLlmConfigId || null });
      setCode(result.code);
      setWarnings([
        ...(result.source === "fallback" ? ["Generated from fallback template"] : []),
        ...(result.pipeline_mode ? [`Pipeline: ${result.pipeline_mode}`] : []),
        ...(result.warnings ?? [])
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handleRender(target: "draft" | "final") {
    setError(null);
    setLoadingRender(true);
    try {
      const result = await renderCode({
        code,
        quality,
        retry_on_error: true,
        preview_first: target === "draft",
        target,
        llm_config_id: selectedLlmConfigId || null
      });
      setJobId(result.job_id);
      const status = await getJobStatus(result.job_id);
      setJobStatus(status);
      setRenderHistory((items) => [
        {
          jobId: status.job_id,
          status: status.status,
          target,
          codeHash: status.code_hash,
          createdAt: status.created_at
        },
        ...items
      ].slice(0, 8));
      await refreshAccountState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render request failed");
    } finally {
      setLoadingRender(false);
    }
  }

  async function handleCancel() {
    if (!jobId) {
      return;
    }
    setError(null);
    try {
      const status = await cancelJob(jobId);
      setJobStatus(status);
      await refreshAccountState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel request failed");
    }
  }

  async function handleRegenerate() {
    setError(null);
    clearRenderState();
    setLoadingRegenerate(true);
    try {
      const result = await regenerateCode({
        code,
        instruction: regenerateInstruction,
        llm_config_id: selectedLlmConfigId || null
      });
      setCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate request failed");
    } finally {
      setLoadingRegenerate(false);
    }
  }

  async function handleSaveProvider(event: FormEvent) {
    event.preventDefault();
    setSavingProvider(true);
    setError(null);
    try {
      const result = await createLlmConfig(providerForm);
      setLlmConfigs((items) => [result.config, ...items]);
      setSelectedLlmConfigId(result.config.id);
      setProviderForm({ name: "My OpenAI-compatible key", base_url: "", model: "", api_key: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save provider");
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleDeleteProvider(id: string) {
    await deleteLlmConfig(id);
    setLlmConfigs((items) => items.filter((item) => item.id !== id));
    if (selectedLlmConfigId === id) {
      setSelectedLlmConfigId("");
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
        if (status.status === "done" && status.final_code && status.final_code !== code && status.repair_attempts > 0) {
          setCode(status.final_code);
        }
        if (["done", "failed", "timeout", "cancelled"].includes(status.status)) {
          clearInterval(interval);
          await refreshAccountState();
        }
      } catch (err) {
        setPollingError(err instanceof Error ? err.message : "Lost connection while polling render status");
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [code, jobId, refreshAccountState]);

  useEffect(() => {
    refreshAccountState().catch(() => null);
    getWorkersHealth()
      .then(setWorkerHealth)
      .catch(() => setWorkerHealth(null));
  }, [refreshAccountState]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>AI-Powered Manim Video Generation</h1>
          <p>{"Prompt -> code -> secure render -> preview -> download"}</p>
        </div>
        <div className="auth-actions">
          <Link className="button-link secondary" href="/api/auth/signin">
            Sign in
          </Link>
          <Link className="button-link" href="/api/auth/signout">
            Sign out
          </Link>
        </div>
      </header>

      <div className="grid" style={{ marginTop: 16 }}>
        <PromptForm loading={loadingGenerate} onSubmit={handleGenerate} />
        <section className="card">
          <h2>Account & Provider</h2>
          <div className="metric-row">
            <span>Credits</span>
            <strong>{credits ? `${credits.available} available` : "loading"}</strong>
          </div>
          <div className="metric-row">
            <span>Reserved / spent</span>
            <strong>{credits ? `${credits.reserved} / ${credits.spent}` : "-"}</strong>
          </div>

          <label htmlFor="llm-provider" style={{ marginTop: 12 }}>
            LLM Provider
          </label>
          <select id="llm-provider" value={selectedLlmConfigId} onChange={(e) => setSelectedLlmConfigId(e.target.value)}>
            <option value="">Platform Lightning/Qwen credits</option>
            {llmConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name} · {config.model}
              </option>
            ))}
          </select>
          <p className="muted">
            {usingByok
              ? "Using your encrypted OpenAI-compatible key for generation and repair."
              : "Using platform credits. Save a key to continue after free credits."}
          </p>

          <details style={{ marginTop: 10 }}>
            <summary>Saved provider keys</summary>
            {llmConfigs.length === 0 ? <p className="muted">No saved keys.</p> : null}
            <ul>
              {llmConfigs.map((config) => (
                <li key={config.id}>
                  {config.name} · {config.baseUrl} · {config.model}
                  <button className="inline-danger" type="button" onClick={() => handleDeleteProvider(config.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <form onSubmit={handleSaveProvider} style={{ marginTop: 12 }}>
            <label htmlFor="provider-name">Provider name</label>
            <input
              id="provider-name"
              value={providerForm.name}
              onChange={(e) => setProviderForm((value) => ({ ...value, name: e.target.value }))}
            />
            <label htmlFor="provider-base">Base URL</label>
            <input
              id="provider-base"
              placeholder="https://api.openai.com/v1"
              value={providerForm.base_url}
              onChange={(e) => setProviderForm((value) => ({ ...value, base_url: e.target.value }))}
            />
            <label htmlFor="provider-model">Model</label>
            <input
              id="provider-model"
              placeholder="gpt-4.1-mini or qwen3-coder"
              value={providerForm.model}
              onChange={(e) => setProviderForm((value) => ({ ...value, model: e.target.value }))}
            />
            <label htmlFor="provider-key">API key</label>
            <input
              id="provider-key"
              type="password"
              value={providerForm.api_key}
              onChange={(e) => setProviderForm((value) => ({ ...value, api_key: e.target.value }))}
            />
            <div className="actions">
              <button type="submit" disabled={savingProvider || !providerForm.base_url || !providerForm.model || !providerForm.api_key}>
                {savingProvider ? "Saving..." : "Save encrypted key"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Render Controls</h2>
          <label htmlFor="quality">Quality</label>
          <select id="quality" value={quality} onChange={(e) => setQuality(e.target.value as RenderQuality)}>
            <option value="1080p30">1080p30</option>
            <option value="720p30">720p30</option>
            <option value="480p15">480p15</option>
          </select>

          <div className="actions">
            <button onClick={() => handleRender("draft")} disabled={loadingRender || !code}>
              {loadingRender ? "Submitting..." : "Render Draft"}
            </button>
            <button className="secondary" onClick={() => handleRender("final")} disabled={loadingRender || !code}>
              Render Final
            </button>
            {jobStatus?.cancellable ? (
              <button className="secondary" onClick={handleCancel}>
                Cancel
              </button>
            ) : null}
          </div>

          <label htmlFor="regen" style={{ marginTop: 12 }}>
            Regenerate Instruction
          </label>
          <input id="regen" value={regenerateInstruction} onChange={(e) => setRegenerateInstruction(e.target.value)} />
          <div className="actions">
            <button className="secondary" onClick={handleRegenerate} disabled={loadingRegenerate || !code || !regenerateInstruction}>
              {loadingRegenerate ? "Regenerating..." : "Regenerate Code"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <JobStatusBadge status={jobStatus?.status ?? null} progress={jobStatus?.progress ?? 0} stage={jobStatus?.stage ?? "idle"} />
          </div>
          {jobStatus ? (
            <p className="muted">
              {jobStatus.queue_position ? `Queue position: ${jobStatus.queue_position}. ` : ""}
              {typeof jobStatus.queued_count === "number" ? `Queued: ${jobStatus.queued_count}. ` : ""}
              {jobStatus.code_hash ? `Code hash: ${jobStatus.code_hash.slice(0, 12)}.` : ""}
            </p>
          ) : workerHealth ? (
            <p className="muted">Worker health loaded. Queue: {String(workerHealth.queued_count ?? "unknown")}.</p>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
          {jobStatus?.error ? (
            <p className="error-text">
              Render error{jobStatus.error_type ? ` (${jobStatus.error_type})` : ""}: {jobStatus.error_summary ?? jobStatus.error}
            </p>
          ) : null}
          {pollingError ? <p className="error-text">Status polling error: {pollingError}</p> : null}
          {jobStatus?.status === "done" && (jobStatus?.repair_attempts ?? 0) > 0 ? (
            <p className="success-text">
              Render succeeded after {jobStatus?.repair_attempts} repair step(s). The editor now shows the final rendered code.
            </p>
          ) : null}
          {warnings.length > 0 ? <p className="warning-text">{warnings.join("\n")}</p> : null}

          {hasRepairHistory ? (
            <details style={{ marginTop: 10 }}>
              <summary>Repair timeline</summary>
              <ul>
                {jobStatus?.attempts.map((attempt) => (
                  <li key={`${attempt.attempt_number}-${attempt.phase}`}>
                    Attempt {attempt.attempt_number}: {attempt.phase}
                    {attempt.error_type ? ` (${attempt.error_type})` : ""}
                    {attempt.error_summary ? ` - ${attempt.error_summary}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {artifactMetadata ? (
            <details style={{ marginTop: 10 }}>
              <summary>Render metadata</summary>
              <pre>{JSON.stringify(artifactMetadata, null, 2)}</pre>
            </details>
          ) : null}
          {qualityReport ? (
            <details style={{ marginTop: 10 }}>
              <summary>Quality report</summary>
              <pre>{JSON.stringify(qualityReport, null, 2)}</pre>
            </details>
          ) : null}
          {renderHistory.length > 0 ? (
            <details style={{ marginTop: 10 }}>
              <summary>Session render history</summary>
              <ul>
                {renderHistory.map((item) => (
                  <li key={item.jobId}>
                    {item.target} · {item.status} · {item.codeHash ? item.codeHash.slice(0, 12) : "pending hash"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <VideoPlayer videoUrl={videoUrl} thumbnailUrl={thumbnailUrl} jobId={jobId} />
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        <CodeEditor code={code} onChange={updateCode} />
        {jobStatus?.input_code && jobStatus.final_code && jobStatus.input_code !== jobStatus.final_code ? (
          <section className="card">
            <h2>Original vs repaired</h2>
            <pre>{jobStatus.input_code}</pre>
            <pre>{jobStatus.final_code}</pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}

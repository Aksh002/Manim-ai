"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import JobStatusBadge from "@/components/JobStatusBadge";
import {
  archiveChat,
  cancelChatRender,
  createChat,
  createLlmConfig,
  deleteLlmConfig,
  getChat,
  getCreditSummary,
  getJobStatus,
  getWorkersHealth,
  listChats,
  listLlmConfigs,
  pinChatRender,
  regenerateCode,
  resolveApiUrl,
  saveCodeVersion,
  sendChatPrompt,
  startChatRender,
  updateChat
} from "@/lib/api-client";
import {
  ChatMessage,
  ChatSessionSummary,
  ChatWorkspace,
  CodeVersion,
  CreditSummary,
  DifficultyLevel,
  JobAttempt,
  JobStatus,
  LlmConfigMetadata,
  RenderQuality,
  SessionRender,
  StylePreset
} from "@/lib/types";

const STARTER_CODE = "from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n";
const TERMINAL_STATUSES = new Set(["done", "failed", "timeout", "cancelled"]);

type WorkbenchTab = "preview" | "code" | "attempts" | "storyboard" | "settings";

type PromptState = {
  topic: string;
  duration_seconds: number;
  style: StylePreset;
  level: DifficultyLevel;
  additional_instructions: string;
};

export default function HomePage() {
  const [chats, setChats] = useState<ChatSessionSummary[]>([]);
  const [workspace, setWorkspace] = useState<ChatWorkspace | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingRender, setLoadingRender] = useState(false);
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [code, setCode] = useState(STARTER_CODE);
  const [codeDirty, setCodeDirty] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("1080p30");
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("preview");
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [workerHealth, setWorkerHealth] = useState<Record<string, unknown> | null>(null);
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [llmConfigs, setLlmConfigs] = useState<LlmConfigMetadata[]>([]);
  const [selectedLlmConfigId, setSelectedLlmConfigId] = useState("");
  const [regenerateInstruction, setRegenerateInstruction] = useState("Make it shorter and more colorful.");
  const [savedRepairJobs, setSavedRepairJobs] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState<PromptState>({
    topic: "Explain the Pythagorean theorem visually",
    duration_seconds: 60,
    style: "geometric-heavy",
    level: "school",
    additional_instructions: "Use area transformations."
  });
  const [providerForm, setProviderForm] = useState({
    name: "My OpenAI-compatible key",
    base_url: "",
    model: "",
    api_key: ""
  });

  const activeChatId = workspace?.session.id ?? null;
  const activeCodeVersion = useMemo(() => selectActiveCodeVersion(workspace), [workspace]);
  const activeCodeVersionId = activeCodeVersion?.id ?? null;
  const activeCodeVersionCode = activeCodeVersion?.code ?? STARTER_CODE;
  const activeRender = useMemo(
    () => selectActiveRender(workspace, selectedRenderId),
    [workspace, selectedRenderId]
  );
  const activeRenderMetadata = (activeRender?.metadata ?? {}) as Record<string, unknown>;
  const metadataAttempts = Array.isArray(activeRenderMetadata.attempts) ? (activeRenderMetadata.attempts as JobAttempt[]) : [];
  const attempts = jobStatus?.attempts?.length ? jobStatus.attempts : metadataAttempts;
  const qualityReport = jobStatus?.quality_report ?? (activeRenderMetadata.quality_report as Record<string, unknown> | null) ?? null;
  const artifactMetadata = jobStatus?.artifact_metadata ?? (activeRenderMetadata.artifact_metadata as Record<string, unknown> | null) ?? null;
  const videoUrl = resolveApiUrl(jobStatus?.video_url ?? activeRender?.videoUrl);
  const thumbnailUrl = resolveApiUrl(jobStatus?.thumbnail_url ?? activeRender?.thumbnailUrl);
  const codeMetadata = (activeCodeVersion?.metadata ?? {}) as Record<string, unknown>;
  const storyboard = Array.isArray(codeMetadata.storyboard) ? codeMetadata.storyboard : [];
  const scenePlan = codeMetadata.scene_plan as Record<string, unknown> | null;
  const skillProvenance = codeMetadata.skill_provenance as Record<string, unknown> | null;
  const usingByok = Boolean(selectedLlmConfigId);

  const refreshAccountState = useCallback(async () => {
    const [creditResult, configResult] = await Promise.all([
      getCreditSummary(),
      listLlmConfigs().catch(() => ({ configs: [] }))
    ]);
    setCredits(creditResult.credits);
    setLlmConfigs(configResult.configs);
    setSelectedLlmConfigId((current) => current || configResult.configs[0]?.id || "");
  }, []);

  const refreshChats = useCallback(async () => {
    const result = await listChats();
    setChats(result.chats);
    return result.chats;
  }, []);

  const loadWorkspace = useCallback(async (chatId: string) => {
    const result = await getChat(chatId);
    setWorkspace(result);
    setSelectedRenderId(result.session.activeRenderId ?? result.renders[0]?.id ?? null);
    return result;
  }, []);

  const bootWorkspace = useCallback(async () => {
    setLoadingChats(true);
    setError(null);
    try {
      const existing = await refreshChats();
      if (existing[0]) {
        await loadWorkspace(existing[0].id);
      } else {
        const created = await createChat("Untitled scene");
        setWorkspace(created);
        await refreshChats();
      }
      await refreshAccountState();
      getWorkersHealth().then(setWorkerHealth).catch(() => setWorkerHealth(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load workspace");
    } finally {
      setLoadingChats(false);
    }
  }, [loadWorkspace, refreshAccountState, refreshChats]);

  useEffect(() => {
    bootWorkspace().catch(() => null);
  }, [bootWorkspace]);

  useEffect(() => {
    if (!activeCodeVersionId) {
      setCode(STARTER_CODE);
      setCodeDirty(false);
      return;
    }
    setCode(activeCodeVersionCode);
    setCodeDirty(false);
  }, [activeCodeVersionCode, activeCodeVersionId]);

  useEffect(() => {
    const jobId = activeRender?.backendJobId;
    if (!activeChatId || !jobId || TERMINAL_STATUSES.has(activeRender.status)) {
      return;
    }

    let stopped = false;
    const poll = async () => {
      try {
        const status = await getJobStatus(jobId);
        if (stopped) {
          return;
        }
        setJobStatus(status);
        setPollingError(null);
        const latest = await getChat(activeChatId);
        if (!stopped) {
          setWorkspace(latest);
          await refreshChats();
        }
        if (
          status.status === "done" &&
          status.final_code &&
          activeCodeVersion &&
          status.final_code !== activeCodeVersion.code &&
          status.repair_attempts > 0 &&
          !savedRepairJobs[jobId]
        ) {
          setSavedRepairJobs((value) => ({ ...value, [jobId]: true }));
          const repaired = await saveCodeVersion(activeChatId, {
            code: status.final_code,
            source: "repaired",
            parentVersionId: activeCodeVersion.id,
            metadata: { backendJobId: jobId, attempts: status.attempts, error_type: status.error_type }
          });
          if (!stopped) {
            setWorkspace(repaired);
            setCode(status.final_code);
            setCodeDirty(false);
          }
        }
        if (TERMINAL_STATUSES.has(status.status)) {
          await refreshAccountState();
          stopped = true;
        }
      } catch (err) {
        if (!stopped) {
          setPollingError(err instanceof Error ? err.message : "Lost connection while polling render status");
          stopped = true;
        }
      }
    };

    poll().catch(() => null);
    const interval = setInterval(() => {
      if (!stopped) {
        poll().catch(() => null);
      }
    }, 2200);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [activeChatId, activeCodeVersion, activeRender?.backendJobId, activeRender?.status, refreshAccountState, refreshChats, savedRepairJobs]);

  async function handleNewChat() {
    setError(null);
    const created = await createChat("Untitled scene");
    setWorkspace(created);
    setJobStatus(null);
    setSelectedRenderId(null);
    await refreshChats();
  }

  async function handleSelectChat(chatId: string) {
    setError(null);
    setJobStatus(null);
    await loadWorkspace(chatId);
  }

  async function handleArchiveChat(chatId: string) {
    await archiveChat(chatId);
    const remaining = await refreshChats();
    if (workspace?.session.id === chatId) {
      if (remaining[0]) {
        await loadWorkspace(remaining[0].id);
      } else {
        const created = await createChat("Untitled scene");
        setWorkspace(created);
        await refreshChats();
      }
    }
  }

  async function handleRenameChat() {
    if (!activeChatId || !workspace) {
      return;
    }
    const nextTitle = window.prompt("Rename chat", workspace.session.title)?.trim();
    if (!nextTitle) {
      return;
    }
    const updated = await updateChat(activeChatId, { title: nextTitle });
    setWorkspace(updated);
    await refreshChats();
  }

  async function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!activeChatId) {
      return;
    }
    setError(null);
    setPollingError(null);
    setLoadingGenerate(true);
    try {
      const updated = await sendChatPrompt(activeChatId, {
        ...prompt,
        llm_config_id: selectedLlmConfigId || null
      });
      setWorkspace(updated);
      setActiveTab("code");
      await refreshChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function persistCode(source = "edited", instruction?: string | null) {
    if (!activeChatId) {
      throw new Error("No active chat");
    }
    const saved = await saveCodeVersion(activeChatId, {
      code,
      source,
      parentVersionId: activeCodeVersion?.id ?? null,
      instruction,
      metadata: instruction ? { instruction } : null
    });
    setWorkspace(saved);
    setCodeDirty(false);
    await refreshChats();
    return selectActiveCodeVersion(saved);
  }

  async function handleSaveCode() {
    setError(null);
    try {
      await persistCode("edited");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save code version");
    }
  }

  async function handleRender(target: "draft" | "final") {
    if (!activeChatId) {
      return;
    }
    setError(null);
    setPollingError(null);
    setLoadingRender(true);
    try {
      const codeVersion = codeDirty || !activeCodeVersion ? await persistCode("edited") : activeCodeVersion;
      if (!codeVersion) {
        throw new Error("Save code before rendering");
      }
      const result = await startChatRender(activeChatId, {
        codeVersionId: codeVersion.id,
        quality,
        retry_on_error: true,
        target,
        llm_config_id: selectedLlmConfigId || null
      });
      setWorkspace(result.workspace);
      setSelectedRenderId(result.renderId);
      setActiveTab("preview");
      await refreshAccountState();
      await refreshChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render request failed");
    } finally {
      setLoadingRender(false);
    }
  }

  async function handleCancelRender() {
    if (!activeChatId || !activeRender) {
      return;
    }
    setError(null);
    try {
      const result = await cancelChatRender(activeChatId, activeRender.id);
      setWorkspace(result.workspace);
      await refreshAccountState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel request failed");
    }
  }

  async function handlePinRender(render: SessionRender) {
    if (!activeChatId) {
      return;
    }
    const updated = await pinChatRender(activeChatId, render.id, !render.pinned);
    setWorkspace(updated);
  }

  async function handleRegenerate() {
    if (!activeChatId) {
      return;
    }
    setError(null);
    setLoadingRegenerate(true);
    try {
      const result = await regenerateCode({
        code,
        instruction: regenerateInstruction,
        llm_config_id: selectedLlmConfigId || null
      });
      setCode(result.code);
      const updated = await saveCodeVersion(activeChatId, {
        code: result.code,
        source: "regenerated",
        parentVersionId: activeCodeVersion?.id ?? null,
        instruction: regenerateInstruction,
        metadata: { instruction: regenerateInstruction }
      });
      setWorkspace(updated);
      setCodeDirty(false);
      setActiveTab("code");
      await refreshChats();
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

  const renderStatus = jobStatus?.status ?? activeRender?.status ?? null;
  const renderProgress = jobStatus?.progress ?? Number(activeRenderMetadata.progress ?? 0);
  const renderStage = jobStatus?.stage ?? String(activeRenderMetadata.stage ?? "idle");

  return (
    <main className="workspace-shell">
      <aside className="session-rail">
        <div className="rail-brand">
          <span className="brand-mark">M</span>
          <div>
            <strong>Manim Studio</strong>
            <span>Prompt to scene</span>
          </div>
        </div>
        <button className="primary-action" type="button" onClick={handleNewChat} disabled={loadingChats}>
          + New chat
        </button>
        <div className="rail-meta">
          <span>{credits ? `${credits.available} credits` : "credits"}</span>
          <span>{workerHealth ? `queue ${String(workerHealth.queued_count ?? "-")}` : "queue -"}</span>
        </div>
        <div className="session-list">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={`session-item ${chat.id === activeChatId ? "active" : ""}`}
              onClick={() => handleSelectChat(chat.id)}
            >
              <span>{chat.title}</span>
              <small>{chat.latestRenderStatus ? `render ${chat.latestRenderStatus}` : chat.latestMessage ?? "empty chat"}</small>
            </button>
          ))}
          {chats.length === 0 ? <p className="muted compact">No chats yet.</p> : null}
        </div>
        <div className="rail-footer">
          <Link href="/benchmarks">Benchmarks</Link>
          <Link href="/api/auth/signin">Sign in</Link>
          <Link href="/api/auth/signout">Sign out</Link>
        </div>
      </aside>

      <section className="conversation-panel">
        <header className="conversation-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{workspace?.session.title ?? "Loading studio"}</h1>
          </div>
          <div className="header-actions">
            <button className="ghost-button" type="button" onClick={handleRenameChat} disabled={!workspace}>
              Rename
            </button>
            <button className="ghost-button danger" type="button" onClick={() => activeChatId && handleArchiveChat(activeChatId)} disabled={!workspace}>
              Archive
            </button>
          </div>
        </header>

        <div className="timeline">
          {workspace?.messages.length ? (
            workspace.messages.map((message) => <TimelineMessage key={message.id} message={message} />)
          ) : (
            <div className="empty-state">
              <h2>Start an educational animation thread</h2>
              <p>Each prompt, code version, render attempt, repair, and preview will stay attached to this chat.</p>
            </div>
          )}
          {error ? <div className="timeline-alert error-text">{error}</div> : null}
          {pollingError ? <div className="timeline-alert error-text">Status polling error: {pollingError}</div> : null}
        </div>

        <form className="composer" onSubmit={handleGenerate}>
          <textarea
            value={prompt.topic}
            onChange={(event) => setPrompt((value) => ({ ...value, topic: event.target.value }))}
            placeholder="Ask for an educational Manim scene"
            required
          />
          <div className="composer-controls">
            <input
              aria-label="Duration seconds"
              type="number"
              min={15}
              max={180}
              value={prompt.duration_seconds}
              onChange={(event) => setPrompt((value) => ({ ...value, duration_seconds: Number(event.target.value) }))}
            />
            <select
              aria-label="Style"
              value={prompt.style}
              onChange={(event) => setPrompt((value) => ({ ...value, style: event.target.value as StylePreset }))}
            >
              <option value="minimal">Minimal</option>
              <option value="colorful">Colorful</option>
              <option value="geometric-heavy">Geometric</option>
            </select>
            <select
              aria-label="Level"
              value={prompt.level}
              onChange={(event) => setPrompt((value) => ({ ...value, level: event.target.value as DifficultyLevel }))}
            >
              <option value="school">School</option>
              <option value="undergraduate">Undergrad</option>
              <option value="advanced">Advanced</option>
            </select>
            <input
              aria-label="Additional instructions"
              value={prompt.additional_instructions}
              onChange={(event) => setPrompt((value) => ({ ...value, additional_instructions: event.target.value }))}
              placeholder="Additional instruction"
            />
            <button type="submit" disabled={loadingGenerate || !activeChatId}>
              {loadingGenerate ? "Generating" : "Send"}
            </button>
          </div>
        </form>
      </section>

      <aside className="workbench">
        <div className="workbench-tabs">
          {(["preview", "code", "attempts", "storyboard", "settings"] as WorkbenchTab[]).map((tab) => (
            <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "preview" ? (
          <section className="workbench-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>{activeRender ? `${activeRender.target} render` : "No render selected"}</h2>
              </div>
              {activeRender ? (
                <button className="ghost-button" type="button" onClick={() => handlePinRender(activeRender)}>
                  {activeRender.pinned ? "Unpin" : "Pin"}
                </button>
              ) : null}
            </div>
            {videoUrl ? (
              <>
                <video className="preview-video" src={videoUrl} poster={thumbnailUrl ?? undefined} controls preload="metadata" />
                <a className="download-link" href={videoUrl} download={`${activeRender?.backendJobId ?? "render"}.mp4`}>
                  Download MP4
                </a>
              </>
            ) : (
              <div className="preview-empty">No video artifact for this code version.</div>
            )}
            <div className="status-strip">
              <JobStatusBadge status={renderStatus} progress={renderProgress} stage={renderStage} />
              {activeRender?.codeHash ? <span>{activeRender.codeHash.slice(0, 12)}</span> : null}
              {activeRender?.artifactExpiresAt ? <span>expires {formatDate(activeRender.artifactExpiresAt)}</span> : null}
            </div>
            <div className="render-controls">
              <select value={quality} onChange={(event) => setQuality(event.target.value as RenderQuality)}>
                <option value="1080p30">1080p30</option>
                <option value="720p30">720p30</option>
                <option value="480p15">480p15</option>
              </select>
              <button type="button" onClick={() => handleRender("draft")} disabled={loadingRender || !activeChatId}>
                {loadingRender ? "Submitting" : "Render Draft"}
              </button>
              <button className="secondary-action" type="button" onClick={() => handleRender("final")} disabled={loadingRender || !activeChatId}>
                Render Final
              </button>
              {jobStatus?.cancellable || ["queued", "rendering", "retrying", "validating"].includes(activeRender?.status ?? "") ? (
                <button className="secondary-action" type="button" onClick={handleCancelRender}>
                  Cancel
                </button>
              ) : null}
            </div>
            {workspace?.renders.length ? (
              <div className="render-history">
                {workspace.renders.map((render) => (
                  <button
                    key={render.id}
                    type="button"
                    className={render.id === activeRender?.id ? "active" : ""}
                    onClick={() => setSelectedRenderId(render.id)}
                  >
                    <span>{render.target} · {render.status}</span>
                    <small>{render.codeHash ? render.codeHash.slice(0, 12) : "pending"}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "code" ? (
          <section className="workbench-pane code-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Code</p>
                <h2>{activeCodeVersion ? `${activeCodeVersion.source} version` : "Scratch version"}</h2>
              </div>
              <span className={codeDirty ? "dirty-pill" : "clean-pill"}>{codeDirty ? "Unsaved" : "Saved"}</span>
            </div>
            <CodeEditor code={code} onChange={(value) => { setCode(value); setCodeDirty(true); }} />
            <div className="code-actions">
              <button type="button" onClick={handleSaveCode} disabled={!codeDirty}>
                Save Version
              </button>
              <input value={regenerateInstruction} onChange={(event) => setRegenerateInstruction(event.target.value)} />
              <button className="secondary-action" type="button" onClick={handleRegenerate} disabled={loadingRegenerate || !code}>
                {loadingRegenerate ? "Regenerating" : "Regenerate"}
              </button>
            </div>
          </section>
        ) : null}

        {activeTab === "attempts" ? (
          <section className="workbench-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Attempts</p>
                <h2>{attempts.length ? `${attempts.length} recorded` : "No attempts"}</h2>
              </div>
            </div>
            {jobStatus?.error || activeRenderMetadata.error_summary ? (
              <p className="error-text">{jobStatus?.error_summary ?? String(activeRenderMetadata.error_summary)}</p>
            ) : null}
            <div className="attempt-list">
              {attempts.map((attempt) => (
                <div key={`${attempt.attempt_number}-${attempt.phase}`} className="attempt-item">
                  <strong>Attempt {attempt.attempt_number}: {attempt.phase}</strong>
                  <span>{attempt.error_type ?? "runtime"}</span>
                  <p>{attempt.error_summary ?? "No summary recorded."}</p>
                </div>
              ))}
            </div>
            {artifactMetadata ? <JsonBlock title="Artifact metadata" value={artifactMetadata} /> : null}
            {qualityReport ? <JsonBlock title="Quality report" value={qualityReport} /> : null}
          </section>
        ) : null}

        {activeTab === "storyboard" ? (
          <section className="workbench-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Plan</p>
                <h2>Storyboard and scene plan</h2>
              </div>
            </div>
            {storyboard.length ? (
              <ol className="storyboard-list">
                {storyboard.map((item, index) => <li key={`${item}-${index}`}>{String(item)}</li>)}
              </ol>
            ) : (
              <p className="muted">No storyboard metadata for this version.</p>
            )}
            {scenePlan ? <JsonBlock title="Scene plan" value={scenePlan} /> : null}
            {skillProvenance ? <JsonBlock title="Skill provenance" value={skillProvenance} /> : null}
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="workbench-pane settings-pane">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Account and provider</h2>
              </div>
            </div>
            <div className="metric-grid">
              <div><span>Available</span><strong>{credits?.available ?? "-"}</strong></div>
              <div><span>Reserved</span><strong>{credits?.reserved ?? "-"}</strong></div>
              <div><span>Spent</span><strong>{credits?.spent ?? "-"}</strong></div>
            </div>
            <label htmlFor="llm-provider">LLM provider</label>
            <select id="llm-provider" value={selectedLlmConfigId} onChange={(event) => setSelectedLlmConfigId(event.target.value)}>
              <option value="">Platform Lightning/Qwen credits</option>
              {llmConfigs.map((config) => (
                <option key={config.id} value={config.id}>{config.name} · {config.model}</option>
              ))}
            </select>
            <p className="muted compact">
              {usingByok ? "Using your encrypted OpenAI-compatible key." : "Using platform credits until BYOK is selected."}
            </p>
            <div className="provider-list">
              {llmConfigs.map((config) => (
                <div key={config.id}>
                  <span>{config.name} · {config.keyPreview}</span>
                  <button className="inline-danger" type="button" onClick={() => handleDeleteProvider(config.id)}>Delete</button>
                </div>
              ))}
            </div>
            <form className="provider-form" onSubmit={handleSaveProvider}>
              <input value={providerForm.name} onChange={(event) => setProviderForm((value) => ({ ...value, name: event.target.value }))} />
              <input placeholder="https://api.openai.com/v1" value={providerForm.base_url} onChange={(event) => setProviderForm((value) => ({ ...value, base_url: event.target.value }))} />
              <input placeholder="model" value={providerForm.model} onChange={(event) => setProviderForm((value) => ({ ...value, model: event.target.value }))} />
              <input type="password" placeholder="API key" value={providerForm.api_key} onChange={(event) => setProviderForm((value) => ({ ...value, api_key: event.target.value }))} />
              <button type="submit" disabled={savingProvider || !providerForm.base_url || !providerForm.model || !providerForm.api_key}>
                {savingProvider ? "Saving" : "Save key"}
              </button>
            </form>
          </section>
        ) : null}
      </aside>
    </main>
  );
}

function TimelineMessage({ message }: { message: ChatMessage }) {
  const metadata = message.metadata ?? {};
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];
  return (
    <article className={`timeline-message ${message.role}`}>
      <div className="message-marker">{message.role === "user" ? "You" : message.kind.replace(/_/g, " ")}</div>
      <div>
        <p>{message.content}</p>
        {warnings.length ? <small>{warnings.map(String).join(" | ")}</small> : null}
        <time>{formatDate(message.createdAt)}</time>
      </div>
    </article>
  );
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <details className="json-block">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function selectActiveCodeVersion(workspace: ChatWorkspace | null): CodeVersion | null {
  if (!workspace) {
    return null;
  }
  return (
    workspace.codeVersions.find((version) => version.id === workspace.session.activeCodeVersionId) ??
    workspace.codeVersions[workspace.codeVersions.length - 1] ??
    null
  );
}

function selectActiveRender(workspace: ChatWorkspace | null, selectedRenderId: string | null): SessionRender | null {
  if (!workspace) {
    return null;
  }
  return (
    workspace.renders.find((render) => render.id === selectedRenderId) ??
    workspace.renders.find((render) => render.id === workspace.session.activeRenderId) ??
    workspace.renders[0] ??
    null
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}



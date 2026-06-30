"use client";

import Link from "next/link";
import Hls from "hls.js";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import JobStatusBadge from "@/components/JobStatusBadge";
import { cn } from "@/lib/utils";
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
const CHAT_BACKGROUND_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064209_0cb7d815-ff61-4caa-a6d5-bbff145ab272.mp4";
const CHAT_INTRO_VIDEO = "/media/saigon-chat-bg.mp4";
const SAIGON_LOOP_CROSSFADE_MS = 900;
const SAIGON_LOOP_CROSSFADE_LEAD = 1.1;
const WORKBENCH_MIN_WIDTH = 360;
const WORKBENCH_MAX_WIDTH = 640;

type WorkbenchTab = "preview" | "code" | "attempts" | "storyboard" | "settings" | "queue";
type RenderFilter = "all" | "draft" | "final" | "pinned" | "failed";

type PromptState = {
  topic: string;
  duration_seconds: number;
  style: StylePreset;
  level: DifficultyLevel;
  additional_instructions: string;
};

const chatShellClass =
  "relative isolate grid h-screen overflow-hidden bg-[#070806] text-[#e4dfda] [font-family:var(--font-editorial)]";
const drawerPanelClass =
  "relative z-[1] min-h-0 opacity-100 translate-y-0 transition-[opacity,transform] duration-[850ms] ease-[cubic-bezier(0.76,0,0.24,1)]";
const mutedTelemetryClass = "[font-family:var(--font-telemetry)] text-xs font-normal text-[#e4dfda8a]";
const pillButtonClass =
  "min-h-[34px] rounded-[75px] border border-[#e4dfda29] bg-[#12130f38] px-[13px] py-[7px] text-xs font-normal text-[#e4dfda] [font-family:var(--font-telemetry)]";
const drawerIconButtonClass =
  "grid place-items-center border border-[#e4dfda29] bg-[#e4dfda0f] text-[#f1ece5e6] backdrop-blur-xl";
const studioCardClass =
  "border border-[#e4dfda1a] bg-[#12130f2e] shadow-none backdrop-blur-[3px]";

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
  const [railOpen, setRailOpen] = useState(true);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchWidth, setWorkbenchWidth] = useState(430);
  const [renderFilter, setRenderFilter] = useState<RenderFilter>("all");
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
  const [introPhase, setIntroPhase] = useState<"opening" | "settling" | "done">("opening");
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
  const filteredRenders = useMemo(
    () => filterRenders(workspace?.renders ?? [], renderFilter),
    [workspace?.renders, renderFilter]
  );
  const parentCodeVersion = useMemo(() => {
    if (!workspace || !activeCodeVersion?.parentVersionId) {
      return null;
    }
    return workspace.codeVersions.find((version) => version.id === activeCodeVersion.parentVersionId) ?? null;
  }, [activeCodeVersion, workspace]);
  const activeRenderMetadata = (activeRender?.metadata ?? {}) as Record<string, unknown>;
  const metadataAttempts = Array.isArray(activeRenderMetadata.attempts) ? (activeRenderMetadata.attempts as JobAttempt[]) : [];
  const attempts = jobStatus?.attempts?.length ? jobStatus.attempts : metadataAttempts;
  const qualityReport = jobStatus?.quality_report ?? (activeRenderMetadata.quality_report as Record<string, unknown> | null) ?? null;
  const artifactMetadata = jobStatus?.artifact_metadata ?? (activeRenderMetadata.artifact_metadata as Record<string, unknown> | null) ?? null;
  const videoUrl = resolveApiUrl(jobStatus?.video_url ?? activeRender?.videoUrl);
  const thumbnailUrl = resolveApiUrl(jobStatus?.thumbnail_url ?? activeRender?.thumbnailUrl);
  const artifactExpired = isExpired(jobStatus?.artifact_expires_at ?? activeRender?.artifactExpiresAt);
  const artifactVisible = Boolean(videoUrl) && !artifactExpired;
  const repairedInputCode = typeof activeRenderMetadata.input_code === "string" ? activeRenderMetadata.input_code : null;
  const repairedFinalCode = typeof activeRenderMetadata.final_code === "string" ? activeRenderMetadata.final_code : null;
  const comparisonBaseCode = parentCodeVersion?.code ?? repairedInputCode;
  const comparisonNextCode = activeCodeVersion?.code ?? repairedFinalCode;
  const codeDiff = useMemo(
    () => buildLineDiff(comparisonBaseCode, comparisonNextCode),
    [comparisonBaseCode, comparisonNextCode]
  );
  const codeMetadata = (activeCodeVersion?.metadata ?? {}) as Record<string, unknown>;
  const storyboard = Array.isArray(codeMetadata.storyboard) ? codeMetadata.storyboard : [];
  const scenePlan = codeMetadata.scene_plan as Record<string, unknown> | null;
  const skillProvenance = codeMetadata.skill_provenance as Record<string, unknown> | null;
  const activeLlmConfig = useMemo(
    () => llmConfigs.find((config) => config.id === selectedLlmConfigId) ?? null,
    [llmConfigs, selectedLlmConfigId]
  );
  const activeModelName = activeLlmConfig?.model || "qwen3-coder";
  const usingByok = Boolean(activeLlmConfig);
  const workspaceStyle = { "--workbench-width": `${workbenchWidth}px` } as CSSProperties;

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
    const settleTimer = window.setTimeout(() => setIntroPhase("settling"), 1550);
    const doneTimer = window.setTimeout(() => setIntroPhase("done"), 2750);
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

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

  function handleWorkbenchResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workbenchOpen) {
      return;
    }

    event.preventDefault();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const getMaxWidth = () => {
      const railWidth = railOpen ? 294 : 56;
      const available = window.innerWidth - railWidth - 430;
      return Math.max(WORKBENCH_MIN_WIDTH, Math.min(WORKBENCH_MAX_WIDTH, available));
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = window.innerWidth - moveEvent.clientX;
      const maxWidth = getMaxWidth();
      setWorkbenchWidth(Math.min(maxWidth, Math.max(WORKBENCH_MIN_WIDTH, nextWidth)));
    };

    const stopResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("workbench-resizing");
    };

    document.body.classList.add("workbench-resizing");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  const renderStatus = jobStatus?.status ?? activeRender?.status ?? null;
  const renderProgress = jobStatus?.progress ?? Number(activeRenderMetadata.progress ?? 0);
  const renderStage = jobStatus?.stage ?? String(activeRenderMetadata.stage ?? "idle");
  const showRenderWaiting = Boolean(activeRender && !artifactExpired && !(artifactVisible && videoUrl));

  return (
    <main
      className={cn(
        "workspace-shell",
        chatShellClass,
        `intro-${introPhase}`,
        railOpen ? "rail-open" : "rail-collapsed",
        workbenchOpen ? "workbench-open" : "workbench-closed",
        workspace?.messages.length ? "has-chat-content" : "is-empty-workspace"
      )}
      style={workspaceStyle}
    >
      <ChatAmbientBackground />
      <RenderIntroOverlay phase={introPhase} />
      <aside
        className={cn(
          "session-rail",
          drawerPanelClass,
          "flex flex-col gap-3.5 overflow-hidden border-r border-[#e4dfda1a] p-3.5 shadow-[18px_0_48px_rgba(0,0,0,0.22)] backdrop-blur-[18px]"
        )}
      >
        <div className="rail-topbar flex min-h-11 items-center justify-between gap-2.5">
          <Link className="rail-brand flex min-w-0 flex-1 items-center justify-start gap-2.5 text-[#f1ece5] no-underline" href="/" aria-label="Manim Studio home">
            <span className="brand-mark chat-logo liquid-glass grid h-[42px] w-[42px] place-items-center rounded-full">
              <i aria-hidden="true">m</i>
            </span>
            <div>
              <strong className="block text-2xl font-normal leading-none text-[#f1ece5]">Manim Studio</strong>
              <span className="block text-xs text-[#f1ece585]">Prompt to scene</span>
            </div>
          </Link>
          <button
            className={cn("drawer-toggle h-[34px] w-[34px] flex-none rounded-lg text-xl leading-none", drawerIconButtonClass)}
            type="button"
            aria-label={railOpen ? "Close chat drawer" : "Open chat drawer"}
            aria-expanded={railOpen}
            onClick={() => setRailOpen((value) => !value)}
          >
            {railOpen ? "‹" : "›"}
          </button>
        </div>
        <button
          className="primary-action flex min-h-[42px] w-full items-center justify-start gap-2.5 rounded-lg px-3 text-left text-sm"
          type="button"
          onClick={handleNewChat}
          disabled={loadingChats}
        >
          <span className="action-icon grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-[#12130f24] text-lg leading-none">+</span>
          <span>New chat</span>
        </button>
        <div className="rail-nav grid gap-1 py-1" aria-label="Chat navigation">
          <button type="button" className="rail-nav-item active flex min-h-9 items-center gap-3 rounded-lg border-0 bg-transparent px-2 text-left text-[#f1ece5]">
            <span className="w-6 text-center text-[#e8bd7b]">○</span>
            <span>Chats</span>
          </button>
          <Link className="rail-nav-item flex min-h-9 items-center gap-3 rounded-lg px-2 text-left text-[#f1ece5b8] no-underline" href="/benchmarks">
            <span className="w-6 text-center text-[#e8bd7b]">▣</span>
            <span>Benchmarks</span>
          </Link>
        </div>
        <div className="rail-meta grid grid-cols-2 gap-2">
          <span className="rounded-lg border border-white/10 bg-[#e4dfda0e] p-2 text-xs text-[#d7dfdb]">{credits ? `${credits.available} credits` : "credits"}</span>
          <span className="rounded-lg border border-white/10 bg-[#e4dfda0e] p-2 text-xs text-[#d7dfdb]">{workerHealth ? `queue ${String(workerHealth.queued_count ?? "-")}` : "queue -"}</span>
        </div>
        <div className={cn("rail-section-title mt-2 flex items-center justify-between", mutedTelemetryClass)}>
          <span>Recents</span>
          <small className="text-[11px] text-[#f1ece561]">{chats.length}</small>
        </div>
        <div className="session-list flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto pr-0.5">
          {chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              className={cn(
                "session-item min-h-12 w-full rounded-lg border-0 px-2.5 py-[9px] text-left text-inherit",
                chat.id === activeChatId && "active"
              )}
              onClick={() => handleSelectChat(chat.id)}
              title={chat.title}
            >
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#f1ece5eb]">{chat.title}</span>
              <small className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#f1ece56b]">{chat.latestRenderStatus ? `render ${chat.latestRenderStatus}` : chat.latestMessage ?? "empty chat"}</small>
            </button>
          ))}
          {chats.length === 0 ? <p className="muted compact">No chats yet.</p> : null}
        </div>
        <div className="rail-footer flex min-h-[58px] items-center justify-between gap-2 border-t border-[#e4dfda1a] pt-3">
          <div>
            <strong className="block text-lg font-normal text-[#f1ece5]">{credits ? `${credits.available}` : "-"}</strong>
            <span className="block text-xs text-[#f1ece585]">credits left</span>
          </div>
          <Link className="text-xs text-[#f1ece59e] no-underline" href="/api/auth/signin">Sign in</Link>
          <Link className="text-xs text-[#f1ece59e] no-underline" href="/api/auth/signout">Sign out</Link>
        </div>
      </aside>

      <section className={cn("conversation-panel relative flex min-w-0 min-h-0 flex-col overflow-hidden border-r-0 bg-[linear-gradient(90deg,rgba(4,5,4,0.1),rgba(4,5,4,0.04)_62%,rgba(4,5,4,0.18))]", drawerPanelClass)}>
        <header className="conversation-header flex items-center justify-between gap-3 border-b-0 bg-transparent px-6 pb-2.5 pt-[18px]">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1 className="max-w-[46vw] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-normal text-[#e4dfdae0]">{workspace?.session.title ?? "Loading studio"}</h1>
          </div>
          <div className="header-actions flex items-center gap-1.5">
            <button className={cn("ghost-button", pillButtonClass)} type="button" onClick={handleRenameChat} disabled={!workspace}>
              Rename
            </button>
            <button className={cn("ghost-button danger", pillButtonClass)} type="button" onClick={() => activeChatId && handleArchiveChat(activeChatId)} disabled={!workspace}>
              Archive
            </button>
          </div>
        </header>

        <div className="timeline relative z-[1] mx-auto flex min-h-0 w-[min(880px,100%)] flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-[220px] pt-[58px] [scrollbar-width:none]">
          {loadingGenerate ? (
            <div className={cn("chat-loader relative flex items-center gap-3 overflow-hidden px-4 py-3.5", studioCardClass)}>
              <span />
              <div>
                <strong>Drafting Manim code</strong>
                <p>Planning the scene, choosing primitives, and preparing an editable version.</p>
              </div>
            </div>
          ) : null}
          {workspace?.messages.length ? (
            workspace.messages.map((message) => <TimelineMessage key={message.id} message={message} />)
          ) : (
            <div className="empty-state chat-empty-state">
              <div className="assistant-glyph chat-logo liquid-glass" aria-hidden="true">
                <i>m</i>
              </div>
              <h2>Good to see you. What should we animate?</h2>
              <p>Start with a concept, audience, and motion idea. Settings can stay tucked away until you need them.</p>
            </div>
          )}
          {activeCodeVersion ? (
            <article className={cn("artifact-card code-artifact p-4", studioCardClass, activeRender ? "locked" : "")}>
              <div className="artifact-heading">
                <div>
                  <p className="eyebrow">Code artifact</p>
                  <h2>{activeCodeVersion.source} version</h2>
                </div>
                <span className={codeDirty ? "dirty-pill" : "clean-pill"}>{codeDirty ? "Unsaved" : activeRender ? "Locked" : "Editable"}</span>
              </div>
              <CodeEditor
                code={code}
                readOnly={Boolean(activeRender)}
                onChange={(value) => {
                  setCode(value);
                  setCodeDirty(true);
                }}
              />
              <div className="artifact-actions">
                <button type="button" onClick={handleSaveCode} disabled={!codeDirty || Boolean(activeRender)}>
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("code");
                    setWorkbenchOpen(true);
                  }}
                >
                  Open code details
                </button>
              </div>
            </article>
          ) : null}
          {activeRender ? (
            <article className={cn("artifact-card render-artifact p-4", studioCardClass)}>
              <div className="artifact-heading">
                <div>
                  <p className="eyebrow">Render artifact</p>
                  <h2>{activeRender.target} render</h2>
                </div>
                <JobStatusBadge status={renderStatus} progress={renderProgress} stage={renderStage} />
              </div>
              {artifactVisible && videoUrl ? (
                <video className="preview-video" src={videoUrl} poster={thumbnailUrl ?? undefined} controls preload="metadata" />
              ) : (
                <div className={`preview-empty ${artifactExpired ? "expired" : ""} ${showRenderWaiting ? "rendering-preview" : ""}`}>
                  {showRenderWaiting ? <RenderWaitAnimation /> : null}
                  <span>
                    {artifactExpired ? "Artifact expired. Re-render this version to restore the preview." : "Preview will appear here when the render is ready."}
                  </span>
                </div>
              )}
              <QueueMiniMap status={renderStatus} stage={renderStage} progress={renderProgress} />
            </article>
          ) : null}
          {error ? <div className="timeline-alert error-text">{error}</div> : null}
          {pollingError ? <div className="timeline-alert error-text">Status polling error: {pollingError}</div> : null}
        </div>

        <form
          className="composer absolute bottom-[18px] left-6 right-6 z-[4] mx-auto w-[min(760px,calc(100%_-_48px))] rounded-2xl border border-[#f1ece533] p-2 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
          onSubmit={handleGenerate}
        >
          {activeCodeVersion ? (
            <div className="composer-action-bar">
              <button type="button" onClick={() => handleRender("draft")} disabled={loadingRender || !activeChatId}>
                {loadingRender ? "Submitting" : "Render draft"}
              </button>
              <button type="button" onClick={() => handleRender("final")} disabled={loadingRender || !activeChatId}>
                Render final
              </button>
              <select value={quality} onChange={(event) => setQuality(event.target.value as RenderQuality)}>
                <option value="1080p30">1080p30</option>
                <option value="720p30">720p30</option>
                <option value="480p15">480p15</option>
              </select>
            </div>
          ) : null}
          <textarea
            value={prompt.topic}
            onChange={(event) => setPrompt((value) => ({ ...value, topic: event.target.value }))}
            placeholder={activeCodeVersion ? "Write the next instruction or ask for a new scene" : "Ask for an educational Manim scene"}
            required
          />
          <details className="composer-settings">
            <summary>Parameters</summary>
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
            <select aria-label="LLM provider" value={selectedLlmConfigId} onChange={(event) => setSelectedLlmConfigId(event.target.value)}>
              <option value="">Platform credits</option>
              {llmConfigs.map((config) => (
                <option key={config.id} value={config.id}>{config.name} - {config.model}</option>
              ))}
            </select>
            </div>
          </details>
          <div className="composer-submit-row">
            <div className="composer-model-chip" title={usingByok ? activeLlmConfig?.name : "Platform credits"}>
              <span>Model</span>
              <strong>{activeModelName}</strong>
            </div>
            {activeCodeVersion ? (
              <>
                <input
                  aria-label="Regeneration instruction"
                  value={regenerateInstruction}
                  onChange={(event) => setRegenerateInstruction(event.target.value)}
                  placeholder="Regenerate with an extra instruction"
                />
                <button type="button" onClick={handleRegenerate} disabled={loadingRegenerate || !code}>
                  {loadingRegenerate ? "Regenerating" : "Regenerate"}
                </button>
              </>
            ) : null}
            <button type="submit" disabled={loadingGenerate || !activeChatId}>
              {loadingGenerate ? "Generating" : "Send"}
            </button>
          </div>
        </form>
      </section>

      <aside
        className={cn(
          "workbench",
          drawerPanelClass,
          "flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[#e4dfda1a] shadow-[-18px_0_48px_rgba(0,0,0,0.22)]"
        )}
      >
        <div
          className="workbench-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize workbench drawer"
          onPointerDown={handleWorkbenchResizeStart}
        />
        <button
          className={cn("workbench-toggle absolute left-2.5 top-3.5 z-[5] h-9 w-9 rounded-lg", drawerIconButtonClass)}
          type="button"
          aria-label={workbenchOpen ? "Close workbench drawer" : "Open workbench drawer"}
          aria-expanded={workbenchOpen}
          onClick={() => setWorkbenchOpen((value) => !value)}
        >
          <span>{workbenchOpen ? "›" : "‹"}</span>
          <strong>Workbench</strong>
        </button>
        <div className="workbench-tabs flex flex-row flex-wrap gap-1.5 border-b border-[#e4dfda14] px-3.5 pb-3 pt-[60px]">
          {(["preview", "code", "attempts", "storyboard", "settings", "queue"] as WorkbenchTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={cn(
                "min-h-8 rounded-lg border border-[#e4dfda1a] bg-transparent px-2.5 text-[10px] font-normal uppercase text-[#e4dfda7a] [font-family:var(--font-telemetry)]",
                activeTab === tab && "active border-[#e4dfda4d] bg-[#e4dfdaef] text-[#12130f]"
              )}
              onClick={() => {
                setActiveTab(tab);
                setWorkbenchOpen(true);
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "preview" ? (
          <section className="workbench-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
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
            {artifactVisible && videoUrl ? (
              <>
                <video className="preview-video" src={videoUrl} poster={thumbnailUrl ?? undefined} controls preload="metadata" />
                <a className="download-link" href={videoUrl} download={`${activeRender?.backendJobId ?? "render"}.mp4`}>
                  Download MP4
                </a>
              </>
            ) : (
              <div className={`preview-empty ${artifactExpired ? "expired" : ""} ${showRenderWaiting ? "rendering-preview" : ""}`}>
                {showRenderWaiting ? <RenderWaitAnimation /> : null}
                <span>
                  {artifactExpired ? "Artifact expired. Re-render this code version to restore preview/download." : "No video artifact for this code version."}
                </span>
              </div>
            )}
            <div className="status-strip">
              <JobStatusBadge status={renderStatus} progress={renderProgress} stage={renderStage} />
              {activeRender?.codeHash ? <span>{activeRender.codeHash.slice(0, 12)}</span> : null}
              {activeRender?.artifactExpiresAt ? <span className={artifactExpired ? "expired-text" : ""}>{artifactExpired ? "expired" : "expires"} {formatDate(activeRender.artifactExpiresAt)}</span> : null}
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
              <>
                <div className="render-filter" aria-label="Render history filters">
                  {(["all", "draft", "final", "pinned", "failed"] as RenderFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={renderFilter === filter ? "active" : ""}
                      onClick={() => setRenderFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <div className="render-history">
                {filteredRenders.map((render) => (
                  <button
                    key={render.id}
                    type="button"
                    className={render.id === activeRender?.id ? "active" : ""}
                    onClick={() => setSelectedRenderId(render.id)}
                  >
                    <span>
                      {render.target} · {render.status}
                      {render.pinned ? <b> pinned</b> : null}
                    </span>
                    <small>
                      {render.codeHash ? render.codeHash.slice(0, 12) : "pending"}
                      {isExpired(render.artifactExpiresAt) ? " · expired" : ""}
                    </small>
                  </button>
                ))}
                {filteredRenders.length === 0 ? <p className="muted compact">No renders match this filter.</p> : null}
              </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTab === "code" ? (
          <section className="workbench-pane code-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
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
            {codeDiff.length ? (
              <details className="diff-panel">
                <summary>Compare with parent repair source</summary>
                <div className="diff-grid" aria-label="Code difference">
                  {codeDiff.map((line) => (
                    <div key={line.key} className={`diff-line ${line.kind}`}>
                      <span>{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span>
                      <code>{line.text || " "}</code>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        ) : null}

        {activeTab === "attempts" ? (
          <section className="workbench-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
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
          <section className="workbench-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
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
          <section className="workbench-pane settings-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
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

        {activeTab === "queue" ? (
          <section className="workbench-pane queue-pane min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none]">
            <div className="pane-heading">
              <div>
                <p className="eyebrow">Queue</p>
                <h2>{renderStatus ? `${renderStatus} render` : "No active render"}</h2>
              </div>
              {jobStatus?.cancellable || ["queued", "rendering", "retrying", "validating"].includes(activeRender?.status ?? "") ? (
                <button className="ghost-button" type="button" onClick={handleCancelRender}>
                  Cancel
                </button>
              ) : null}
            </div>
            <QueueMiniMap status={renderStatus} stage={renderStage} progress={renderProgress} />
            <div className="queue-facts">
              <div><span>Stage</span><strong>{renderStage}</strong></div>
              <div><span>Progress</span><strong>{Math.round(renderProgress)}%</strong></div>
              <div><span>Position</span><strong>{jobStatus?.queue_position ?? "-"}</strong></div>
              <div><span>Queued</span><strong>{jobStatus?.queued_count ?? String(workerHealth?.queued_count ?? "-")}</strong></div>
            </div>
            <details className="json-block queue-log-disclosure">
              <summary>Queue logs and raw metadata</summary>
              <pre>{JSON.stringify({ jobStatus, workerHealth, renderMetadata: activeRenderMetadata }, null, 2)}</pre>
            </details>
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

function QueueMiniMap({
  status,
  stage,
  progress
}: {
  status: string | null;
  stage: string;
  progress: number;
}) {
  const steps = ["queued", "validating", "rendering", "uploading", "ready"];
  const normalizedStatus = status === "done" ? "ready" : status ?? "queued";
  const activeIndex = Math.max(0, steps.findIndex((step) => step === normalizedStatus || step === stage));

  return (
    <div className="queue-mini-map" aria-label="Render queue progress">
      <div className="queue-rail">
        <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
      <div className="queue-steps">
        {steps.map((step, index) => (
          <span key={step} className={index <= activeIndex || normalizedStatus === "ready" ? "active" : ""}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChatAmbientBackground() {
  return (
    <div className="chat-ambient-background" aria-hidden="true">
      <SeamlessAmbientVideo className="chat-ambient-video" src={CHAT_BACKGROUND_VIDEO} />
    </div>
  );
}

function SeamlessAmbientVideo({
  className,
  src,
  crossfadeLead = SAIGON_LOOP_CROSSFADE_LEAD,
  crossfadeMs = SAIGON_LOOP_CROSSFADE_MS
}: {
  className: string;
  src: string;
  crossfadeLead?: number;
  crossfadeMs?: number;
}) {
  const primaryRef = useRef<HTMLVideoElement | null>(null);
  const secondaryRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const crossingRef = useRef(false);

  useEffect(() => {
    const videos = [primaryRef.current, secondaryRef.current].filter(Boolean) as HTMLVideoElement[];
    if (videos.length !== 2) {
      return;
    }

    const cancelFade = () => {
      if (fadeRafRef.current !== null) {
        window.cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
    };

    const attachSource = (video: HTMLVideoElement, hlsInstances: Hls[]) => {
      const isHlsStream = src.includes(".m3u8");

      if (isHlsStream && Hls.isSupported()) {
        const hls = new Hls({
          backBufferLength: 18,
          capLevelToPlayerSize: false,
          enableWorker: true,
          maxBufferLength: 28,
          startLevel: -1
        });

        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const highestLevel = hls.levels.length - 1;

          if (highestLevel >= 0) {
            hls.startLevel = highestLevel;
            hls.currentLevel = highestLevel;
            hls.loadLevel = highestLevel;
          }
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) {
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
        hlsInstances.push(hls);
        return;
      }

      video.src = src;
    };

    const fadePair = (fromVideo: HTMLVideoElement, toVideo: HTMLVideoElement, duration: number, onDone?: () => void) => {
      cancelFade();
      const fromStart = Number.parseFloat(fromVideo.style.opacity || "1") || 0;
      const toStart = Number.parseFloat(toVideo.style.opacity || "0") || 0;
      const startedAt = performance.now();

      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        fromVideo.style.opacity = String(fromStart + (0 - fromStart) * eased);
        toVideo.style.opacity = String(toStart + (1 - toStart) * eased);

        if (progress < 1) {
          fadeRafRef.current = window.requestAnimationFrame(step);
          return;
        }

        onDone?.();
      };

      fadeRafRef.current = window.requestAnimationFrame(step);
    };

    const prepareVideo = (video: HTMLVideoElement, opacity: number) => {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.preload = "auto";
      video.playbackRate = 1;
      video.style.opacity = String(opacity);
    };

    const seekToLoopStart = (video: HTMLVideoElement) => {
      try {
        video.currentTime = 0;
      } catch {
        // Metadata can arrive a beat late in some browsers; the next handoff will retry.
      }
    };

    const startCrossfade = () => {
      if (crossingRef.current) {
        return;
      }

      const fromIndex = activeIndexRef.current;
      const toIndex = fromIndex === 0 ? 1 : 0;
      const fromVideo = videos[fromIndex];
      const toVideo = videos[toIndex];

      if (!fromVideo || !toVideo || toVideo.readyState < 2) {
        return;
      }

      crossingRef.current = true;
      seekToLoopStart(toVideo);
      toVideo.style.opacity = "0";
      toVideo.play().catch(() => null);
      fadePair(fromVideo, toVideo, crossfadeMs, () => {
        fromVideo.pause();
        seekToLoopStart(fromVideo);
        activeIndexRef.current = toIndex;
        crossingRef.current = false;
      });
    };

    const tick = () => {
      const activeVideo = videos[activeIndexRef.current];

      if (activeVideo && Number.isFinite(activeVideo.duration) && activeVideo.duration > 0) {
        const remaining = activeVideo.duration - activeVideo.currentTime;
        if (remaining <= crossfadeLead && remaining > 0) {
          startCrossfade();
        }
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    const handlePrimaryLoaded = () => {
      activeIndexRef.current = 0;
      videos[0].play().catch(() => null);
      fadePair(videos[1], videos[0], Math.min(420, crossfadeMs));
    };

    const handleSecondaryMetadata = () => seekToLoopStart(videos[1]);
    const hlsInstances: Hls[] = [];

    videos.forEach((video) => prepareVideo(video, 0));
    videos[0].addEventListener("loadeddata", handlePrimaryLoaded);
    videos[0].addEventListener("ended", startCrossfade);
    videos[1].addEventListener("loadedmetadata", handleSecondaryMetadata);
    videos[1].addEventListener("ended", startCrossfade);
    videos.forEach((video) => attachSource(video, hlsInstances));

    if (videos[0].readyState >= 2) {
      handlePrimaryLoaded();
    }

    tick();

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cancelFade();
      videos[0].removeEventListener("loadeddata", handlePrimaryLoaded);
      videos[0].removeEventListener("ended", startCrossfade);
      videos[1].removeEventListener("loadedmetadata", handleSecondaryMetadata);
      videos[1].removeEventListener("ended", startCrossfade);
      videos.forEach((video) => video.pause());
      hlsInstances.forEach((hls) => hls.destroy());
    };
  }, [crossfadeLead, crossfadeMs, src]);

  return (
    <span className={`seamless-video-shell ${className}`} aria-hidden="true">
      <video
        ref={primaryRef}
        className="seamless-video-layer"
        autoPlay
        muted
        playsInline
        preload="auto"
      />
      <video
        ref={secondaryRef}
        className="seamless-video-layer"
        muted
        playsInline
        preload="auto"
      />
    </span>
  );
}

function AmbientVideo({ className, src, nativeLoop = true }: { className: string; src: string; nativeLoop?: boolean }) {
  return (
    <video
      className={className}
      src={src}
      autoPlay
      muted
      loop={nativeLoop}
      playsInline
      preload="metadata"
    />
  );
}

function RenderIntroOverlay({ phase }: { phase: "opening" | "settling" | "done" }) {
  if (phase === "done") {
    return null;
  }

  return (
    <div
      className={`render-intro-overlay ${phase === "opening" ? "active" : ""} ${
        phase === "settling" ? "settling" : ""
      }`}
      aria-hidden="true"
    >
      <AmbientVideo className="render-intro-video" src={CHAT_INTRO_VIDEO} nativeLoop={false} />
      <div className="render-intro-blur primary" />
      <div className="render-intro-blur secondary" />
      <p>hello saigon</p>
    </div>
  );
}

function RenderWaitAnimation() {
  return (
    <div className="render-wait-animation" aria-hidden="true">
      <SeamlessAmbientVideo className="render-wait-video" src={CHAT_BACKGROUND_VIDEO} crossfadeMs={650} />
      <div className="render-wait-type">
        <strong>rendering</strong>
        <small>manim scene in flight</small>
      </div>
    </div>
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

function filterRenders(renders: SessionRender[], filter: RenderFilter) {
  if (filter === "all") {
    return renders;
  }
  if (filter === "pinned") {
    return renders.filter((render) => render.pinned);
  }
  if (filter === "failed") {
    return renders.filter((render) => ["failed", "timeout", "cancelled"].includes(render.status));
  }
  return renders.filter((render) => render.target === filter);
}

function isExpired(value: string | null | undefined) {
  return Boolean(value && +new Date(value) <= Date.now());
}

function buildLineDiff(before: string | null | undefined, after: string | null | undefined) {
  if (!before || !after || before === after) {
    return [];
  }
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const max = Math.max(beforeLines.length, afterLines.length);
  const lines: { key: string; kind: "same" | "added" | "removed"; text: string }[] = [];
  for (let index = 0; index < max; index += 1) {
    const oldLine = beforeLines[index];
    const newLine = afterLines[index];
    if (oldLine === newLine) {
      lines.push({ key: `same-${index}`, kind: "same", text: oldLine ?? "" });
    } else {
      if (oldLine !== undefined) {
        lines.push({ key: `removed-${index}`, kind: "removed", text: oldLine });
      }
      if (newLine !== undefined) {
        lines.push({ key: `added-${index}`, kind: "added", text: newLine });
      }
    }
  }
  return lines.slice(0, 240);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}



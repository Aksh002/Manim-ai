export type StylePreset = "minimal" | "colorful" | "geometric-heavy";
export type DifficultyLevel = "school" | "undergraduate" | "advanced";
export type RenderQuality = "1080p30" | "720p30" | "480p15";

export type GeneratePayload = {
  topic: string;
  duration_seconds: number;
  style: StylePreset;
  level: DifficultyLevel;
  additional_instructions: string;
  llm_config_id?: string | null;
};

export type GenerateResponse = {
  code: string;
  model: string;
  source: "llm" | "fallback" | "cache";
  warnings: string[];
  storyboard?: string[] | null;
  storyboard_document?: Record<string, unknown> | null;
  scene_plan?: Record<string, unknown> | null;
  planning_report?: Record<string, unknown> | null;
  skill_provenance?: Record<string, unknown> | null;
  manim_version?: string | null;
  generation_attempts?: Record<string, unknown>[];
  quality_report?: Record<string, unknown> | null;
  pipeline_mode?: string;
};

export type RenderPayload = {
  code: string;
  quality: RenderQuality;
  retry_on_error: boolean;
  preview_first: boolean;
  target?: "draft" | "final";
  llm_config_id?: string | null;
};

export type RenderResponse = {
  job_id: string;
  status: string;
  owner_token: string | null;
};

export type RegeneratePayload = {
  code: string;
  instruction: string;
  llm_config_id?: string | null;
};

export type RegenerateResponse = {
  code: string;
};

export type JobStatus = {
  job_id: string;
  status:
    | "queued"
    | "validating"
    | "rendering"
    | "retrying"
    | "cancel_requested"
    | "cancelled"
    | "done"
    | "failed"
    | "timeout";
  progress: number;
  stage: string;
  error: string | null;
  error_type: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  input_code: string | null;
  final_code: string | null;
  repair_attempts: number;
  attempts: JobAttempt[];
  code_hash: string | null;
  artifact_metadata: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  artifact_expires_at: string | null;
  quality_report: Record<string, unknown> | null;
  render_hash: string | null;
  queue_position: number | null;
  queued_count: number | null;
  worker_id: string | null;
  cancellable: boolean;
  cancel_requested_at: string | null;
  generation_pipeline: Record<string, unknown> | null;
};

export type JobAttempt = {
  attempt_number: number;
  phase: string;
  error_type: string | null;
  error_summary: string | null;
  input_code: string | null;
  output_code: string | null;
  render_log_ref: string | null;
  deterministic_repairs: string[];
};

export type CreditSummary = {
  available: number;
  reserved: number;
  spent: number;
  refunded: number;
  expired: number;
  freeCreditsOnSignup: number;
};

export type LlmConfigMetadata = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  keyPreview: string;
  createdAt: string;
  updatedAt: string;
};
export type ChatSessionSummary = {
  id: string;
  title: string;
  archived: boolean;
  activeCodeVersionId: string | null;
  activeRenderId: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  latestMessage: string | null;
  latestRenderStatus: string | null;
};

export type ChatSession = {
  id: string;
  title: string;
  archived: boolean;
  activeCodeVersionId: string | null;
  activeRenderId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "event" | "system" | string;
  kind: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CodeVersion = {
  id: string;
  source: string;
  code: string;
  codeHash: string;
  messageId: string | null;
  parentVersionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type SessionRender = {
  id: string;
  codeVersionId: string;
  backendJobId: string | null;
  target: "draft" | "final" | string;
  quality: string;
  status: string;
  codeHash: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  artifactExpiresAt: string | null;
  pinned: boolean;
  artifactAvailable: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatWorkspace = {
  session: ChatSession;
  messages: ChatMessage[];
  codeVersions: CodeVersion[];
  renders: SessionRender[];
};

export type ChatRenderResponse = RenderResponse & {
  renderId: string;
  workspace: ChatWorkspace;
};

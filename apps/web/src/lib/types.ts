export type StylePreset = "minimal" | "colorful" | "geometric-heavy";
export type DifficultyLevel = "school" | "undergraduate" | "advanced";
export type RenderQuality = "1080p30" | "720p30" | "480p15";

export type GeneratePayload = {
  topic: string;
  duration_seconds: number;
  style: StylePreset;
  level: DifficultyLevel;
  additional_instructions: string;
};

export type GenerateResponse = {
  code: string;
  model: string;
  source: "llm" | "fallback" | "cache";
  warnings: string[];
};

export type RenderPayload = {
  code: string;
  quality: RenderQuality;
  retry_on_error: boolean;
  preview_first: boolean;
};

export type RenderResponse = {
  job_id: string;
  status: string;
  owner_token: string | null;
};

export type RegeneratePayload = {
  code: string;
  instruction: string;
};

export type RegenerateResponse = {
  code: string;
};

export type JobStatus = {
  job_id: string;
  status: "queued" | "validating" | "rendering" | "retrying" | "done" | "failed" | "timeout";
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
  render_hash: string | null;
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

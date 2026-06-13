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
  created_at: string;
  updated_at: string;
  input_code: string | null;
  final_code: string | null;
  repair_attempts: number;
  render_hash: string | null;
};

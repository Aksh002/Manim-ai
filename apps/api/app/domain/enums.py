from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    VALIDATING = "validating"
    RENDERING = "rendering"
    RETRYING = "retrying"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    DONE = "done"
    FAILED = "failed"
    TIMEOUT = "timeout"

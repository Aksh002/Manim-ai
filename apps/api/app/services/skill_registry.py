from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SkillFragment:
    id: str
    content: str
    stages: tuple[str, ...]
    tags: tuple[str, ...]
    priority: int
    sha256: str


class SkillRegistry:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(__file__).resolve().parents[1] / "knowledge" / "manim"
        manifest_path = self.root / "manifest.json"
        self.manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.fragments = self._load_fragments()
        self.policy_hash = self._compute_policy_hash()

    @property
    def policy_version(self) -> str:
        return str(self.manifest.get("policy_version", "unknown"))

    @property
    def target_runtime(self) -> str:
        return str(self.manifest.get("target_runtime", "unknown"))

    def context_for(
        self,
        stage: str,
        tags: list[str] | None = None,
        max_chars: int = 6000,
    ) -> tuple[str, list[dict[str, str]]]:
        requested_tags = {tag.lower() for tag in tags or []}
        candidates = [
            fragment
            for fragment in self.fragments
            if stage in fragment.stages
            and (not requested_tags or requested_tags.intersection(fragment.tags))
        ]
        if not candidates:
            candidates = [fragment for fragment in self.fragments if stage in fragment.stages]

        selected: list[SkillFragment] = []
        remaining = max_chars
        for fragment in sorted(candidates, key=lambda item: item.priority, reverse=True):
            block = self._format_fragment(fragment)
            if selected and len(block) > remaining:
                continue
            selected.append(fragment)
            remaining -= len(block)
            if remaining <= 0:
                break

        context = "\n\n".join(self._format_fragment(fragment) for fragment in selected)
        provenance = [
            {"id": fragment.id, "sha256": fragment.sha256, "stage": stage}
            for fragment in selected
        ]
        return context, provenance

    def provenance_summary(self) -> dict[str, Any]:
        return {
            "policy_version": self.policy_version,
            "policy_hash": self.policy_hash,
            "target_runtime": self.target_runtime,
            "sources": self.manifest.get("sources", []),
        }

    def _load_fragments(self) -> list[SkillFragment]:
        fragments: list[SkillFragment] = []
        for item in self.manifest.get("fragments", []):
            path = self.root / str(item["file"])
            content = path.read_text(encoding="utf-8").strip()
            digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
            fragments.append(
                SkillFragment(
                    id=str(item["id"]),
                    content=content,
                    stages=tuple(str(stage) for stage in item.get("stages", [])),
                    tags=tuple(str(tag).lower() for tag in item.get("tags", [])),
                    priority=int(item.get("priority", 0)),
                    sha256=digest,
                )
            )
        return fragments

    def _compute_policy_hash(self) -> str:
        payload = {
            "policy_version": self.policy_version,
            "target_runtime": self.target_runtime,
            "fragments": [
                {"id": fragment.id, "sha256": fragment.sha256}
                for fragment in sorted(self.fragments, key=lambda item: item.id)
            ],
        }
        encoded = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def _format_fragment(self, fragment: SkillFragment) -> str:
        return f"[{fragment.id}]\n{fragment.content}"


@lru_cache
def get_skill_registry() -> SkillRegistry:
    return SkillRegistry()

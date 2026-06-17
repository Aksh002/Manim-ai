from __future__ import annotations

import json
from pathlib import Path

import httpx


def main() -> None:
    prompts_path = Path(__file__).resolve().parents[5] / "docs" / "golden-prompts.json"
    prompts = json.loads(prompts_path.read_text(encoding="utf-8"))

    successes = 0
    results = []
    with httpx.Client(base_url="http://localhost:8000", timeout=60) as client:
        for prompt in prompts:
            payload = {
                "topic": prompt,
                "duration_seconds": 60,
                "style": "geometric-heavy",
                "level": "school",
                "additional_instructions": "",
            }
            response = client.post("/generate", json=payload)
            body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            ok = response.status_code == 200 and "GeneratedScene" in body.get("code", "")
            if ok:
                successes += 1
            results.append(
                {
                    "prompt": prompt,
                    "status_code": response.status_code,
                    "generation_ok": ok,
                    "source": body.get("source"),
                    "warning_count": len(body.get("warnings", [])) if isinstance(body.get("warnings"), list) else 0,
                }
            )

    total = len(prompts)
    report = {
        "total": total,
        "generation_successes": successes,
        "generation_success_rate": round(successes / total, 4) if total else 0,
        "results": results,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

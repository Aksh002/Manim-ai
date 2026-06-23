from __future__ import annotations

from pathlib import Path
from typing import Iterator

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse


def ranged_file_response(
    path: str,
    *,
    media_type: str,
    filename: str,
    range_header: str | None = None,
):
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = file_path.stat().st_size
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    if not range_header:
        return FileResponse(path=file_path, media_type=media_type, filename=filename, headers=headers)

    start, end = _parse_range(range_header, file_size)
    content_length = end - start + 1
    headers.update(
        {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
        }
    )
    return StreamingResponse(
        _iter_file_range(file_path, start, content_length),
        status_code=206,
        media_type=media_type,
        headers=headers,
    )


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    if not range_header.startswith("bytes="):
        raise HTTPException(status_code=416, detail="Invalid range")
    raw_start, raw_end = range_header.replace("bytes=", "", 1).split("-", 1)
    if raw_start == "":
        suffix_length = int(raw_end)
        start = max(file_size - suffix_length, 0)
        end = file_size - 1
    else:
        start = int(raw_start)
        end = int(raw_end) if raw_end else file_size - 1
    if start < 0 or end >= file_size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Requested range not satisfiable",
            headers={"Content-Range": f"bytes */{file_size}"},
        )
    return start, end


def _iter_file_range(path: Path, start: int, content_length: int, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    remaining = content_length
    with path.open("rb") as file:
        file.seek(start)
        while remaining > 0:
            chunk = file.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk

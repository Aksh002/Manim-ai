from pathlib import Path

from starlette.responses import StreamingResponse

from app.services.range_response import ranged_file_response


def test_ranged_file_response_returns_partial_content(tmp_path: Path) -> None:
    video = tmp_path / "video.mp4"
    video.write_bytes(b"0123456789")

    response = ranged_file_response(
        str(video),
        media_type="video/mp4",
        filename="video.mp4",
        range_header="bytes=2-5",
    )

    assert isinstance(response, StreamingResponse)
    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["accept-ranges"] == "bytes"

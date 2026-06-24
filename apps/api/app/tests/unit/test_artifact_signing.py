from app.services.artifact_signing import build_artifact_url, sign_artifact, verify_artifact_signature


def test_artifact_signature_verifies_and_rejects_tampering() -> None:
    url, _expires_at = build_artifact_url("job_test", "video", ttl_seconds=60)
    params = dict(part.split("=") for part in url.split("?")[1].split("&"))
    expires = int(params["expires"])

    assert verify_artifact_signature("job_test", "video", expires, params["sig"])
    assert not verify_artifact_signature("job_test", "thumbnail", expires, params["sig"])
    assert not verify_artifact_signature("job_test", "video", expires, sign_artifact("job_other", "video", expires))

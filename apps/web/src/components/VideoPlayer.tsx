"use client";

type Props = {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  jobId: string | null;
};

export default function VideoPlayer({ videoUrl, thumbnailUrl, jobId }: Props) {
  return (
    <div className="card">
      <h2>Video Preview</h2>
      {videoUrl ? (
        <>
          <video src={videoUrl} poster={thumbnailUrl ?? undefined} controls style={{ width: "100%", borderRadius: 12 }} />
          <div style={{ marginTop: 12 }}>
            <a href={videoUrl} download={`${jobId ?? "render"}.mp4`}>
              Download MP4
            </a>
          </div>
        </>
      ) : (
        <p>No rendered video yet.</p>
      )}
    </div>
  );
}

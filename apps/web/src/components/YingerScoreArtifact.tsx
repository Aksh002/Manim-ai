import type { CSSProperties } from "react";

const bars = [
  [0, 0, 72, 0],
  [1, 0, 92, 90],
  [2, 0, 104, 180],
  [3, 0, 86, 270],
  [4, 0, 68, 360],
  [0, 1, 86, 110],
  [1, 1, 124, 200],
  [2, 1, 142, 290],
  [3, 1, 118, 380],
  [4, 1, 94, 470],
  [0, 2, 98, 220],
  [1, 2, 148, 310],
  [2, 2, 168, 400],
  [3, 2, 134, 490],
  [4, 2, 108, 580],
  [0, 3, 72, 330],
  [1, 3, 114, 420],
  [2, 3, 136, 510],
  [3, 3, 112, 600],
  [4, 3, 82, 690],
  [0, 4, 44, 440],
  [1, 4, 72, 530],
  [2, 4, 90, 620],
  [3, 4, 70, 710],
  [4, 4, 48, 800]
];

const chips = [
  [-92, 118, 0],
  [-42, 144, 180],
  [16, 162, 360],
  [78, 176, 540],
  [142, 188, 720]
];

export default function YingerScoreArtifact() {
  return (
    <div className="hero-artifact score-artifact" aria-hidden="true">
      <div className="score-rig">
        {bars.map(([x, z, height, delay]) => (
          <span
            className="score-bar"
            key={`${x}-${z}`}
            style={
              {
                "--cell-x": `${(x - 2) * 34 + (z - 2) * 31}px`,
                "--cell-y": `${(z - 2) * 18 - (x - 2) * 18}px`,
                "--h": `${height}px`,
                "--delay": `${delay}ms`,
                "--layer": x + z
              } as CSSProperties
            }
          >
            <span />
          </span>
        ))}
        {chips.map(([x, y, delay]) => (
          <span
            className="score-chip"
            key={`${x}-${y}`}
            style={
              {
                "--chip-x": `${x}px`,
                "--chip-y-offset": `${y * 0.14}px`,
                "--delay": `${delay}ms`
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Terminal } from "@/components/ui/terminal";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";
const CAPABILITIES_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";
const WORLDS_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260616_212935_bbf608da-62d1-4f25-9be4-c346e4d09cc8.mp4";
const DREAM_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4";
const FADE_MS = 500;
const LOOP_CROSSFADE_MS = 760;
const LOOP_CROSSFADE_LEAD = 1.05;
const LOOP_START_OFFSET = 0.08;

const capabilityCards = [
  {
    title: "Prompt to scene",
    body: "Describe the concept, audience, timing, and visual style. Manim AI turns the brief into a structured scene plan and Python code.",
    tags: ["Scene Plan", "Python", "Manim", "Narrative"],
    icon: "spark"
  },
  {
    title: "Edit the source",
    body: "Every generation exposes the actual Manim script. Change the math, tune animations, save versions, then regenerate from your edits.",
    tags: ["Code Editor", "Versions", "Diffs", "Repair"],
    icon: "code"
  },
  {
    title: "Render with control",
    body: "Submit drafts, final renders, and repair attempts through the queue while previews, logs, artifacts, and status stay attached to the chat.",
    tags: ["Draft", "Final", "Queue Logs", "Preview"],
    icon: "queue"
  }
];

const worldCards = [
  {
    title: "The brief stays visible",
    body: "Topic, audience, duration, visual constraints, and repair notes stay attached to the thread, so the animation keeps its teaching goal."
  },
  {
    title: "Motion is planned first",
    body: "Before a render starts, the studio shapes the explanation as beats, transitions, camera moves, labels, and timing."
  },
  {
    title: "Source remains editable",
    body: "Manim code, render attempts, queue events, previews, and downloads stay coupled, so every version can be fixed or reused."
  }
];

const worldsPipelineSteps = ["prompt", "scene plan", "manim.py", "mp4"];

const footerSocials = [
  { label: "GitHub", href: "https://github.com", icon: "github" },
  { label: "X", href: "https://x.com", icon: "x" },
  { label: "YouTube", href: "https://youtube.com", icon: "youtube" },
  { label: "Discord", href: "https://discord.com", icon: "discord" }
];

const pipelineSteps = ["Prompt", "Storyboard", "Python", "Render", "Preview"];

export default function LandingPage() {
  return (
    <main className="space-landing">
      <HeroSection />
      
      <WorldsSection />

      <CapabilitiesSection />
      <HeroCapabilityBridge />
      <DalaSection />
      <DreamSection />
    </main>
  );
}

function HeroCapabilityBridge() {
  return <section className="hero-capability-bridge" aria-hidden="true" />;
}

function HeroSection() {
  return (
    <section className="space-section space-hero" aria-labelledby="landing-title">
      <FadingVideo src={HERO_VIDEO} className="space-video space-video-hero" style={{ width: "120%", height: "120%" }} />
      <div className="space-layer hero-layer">
        <Navbar />
        <div className="hero-center">
          <Reveal delay={0.4}>
            <div className="space-badge liquid-glass">
              <span>Live</span>
              <p>Generate Manim animation with mere prompt </p>
            </div>
          </Reveal>
          <BlurText
            id="landing-title"
            text="Generate Manim Videos From Ideas"
            className="space-headline"
          />
          <Reveal delay={0.8}>
            <p className="space-subheading ">
              Manim AI turns rough educational prompts into editable Python scenes, queued
              renders, previews, and regeneration cycles that stay attached to the same chat.
            </p>
          </Reveal>
          <Reveal delay={1.1}>
            <div className="space-ctas">
              <Link className="liquid-glass-strong space-primary" href="/chat">
                Open Studio <ArrowUpRightIcon />
              </Link>
              <Link className="space-secondary" href="#capabilities">
                See Workflow <PlayIcon />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={1.3}>
            <div className="space-stats">
              <StatCard icon={<ClockIcon />} value="Prompt" label="Starts as a learning objective" />
              <StatCard icon={<GlobeIcon />} value="MP4" label="Ends as a rendered animation" />
            </div>
          </Reveal>
          
        </div>
        <Reveal delay={1.55}>
          <div className="space-partners">
            
            <div>
              {["Prompt", "Code", "Render", "Reprompt", "Download"].map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CapabilitiesSection() {
  return (
    <section className="space-section capabilities-section" id="capabilities">
      <FadingVideo src={CAPABILITIES_VIDEO} className="space-video capabilities-video" />
      <div className="space-layer capabilities-content">
        <Reveal>
          <header>
            <p>{"// Studio capabilities"}</p>
            <h2>
              Create
              <br />
              with control
            </h2>
          </header>
        </Reveal>
        <div className="capability-grid">
          {capabilityCards.map((card, index) => (
            <Reveal key={card.title} delay={0.18 * index}>
              <article className="capability-card liquid-glass">
                <div className="capability-top">
                  <div className="capability-icon liquid-glass">
                    <MaterialIcon name={card.icon} />
                  </div>
                  <div className="capability-tags">
                    {card.tags.map((tag) => (
                      <span className="liquid-glass" key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="capability-copy">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function PipelineReadout() {
  return (
    <div className="pipeline-readout liquid-glass" aria-label="Manim AI generation pipeline">
      <span className="pipeline-pulse" aria-hidden="true" />
      {pipelineSteps.map((step, index) => (
        <span
          className="pipeline-step"
          key={step}
          style={{ "--step-delay": `${index * 0.18}s` } as CSSProperties}
        >
          {step}
        </span>
      ))}
    </div>
  );
}

function WorldsSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");
    if (!section || !canvas || !context || !video) {
      return;
    }

    const canvasElement = canvas;
    const canvasContext = context;
    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const smoothstep = (edge0: number, edge1: number, value: number) => {
      const t = clamp((value - edge0) / Math.max(0.001, edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    let targetProgress = 0;
    let currentProgress = 0;
    let frameId = 0;
    let disposed = false;
    let lastFrameIndex = -1;
    let framesReady = false;
    let metadataReady = Number.isFinite(video.duration) && video.duration > 0;
    const frames: ImageBitmap[] = [];

    const measure = () => {
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, rect.height - window.innerHeight);
      targetProgress = clamp(-rect.top / range);
    };

    const writeProgress = (progress: number) => {
      const heroOpacity = 1 - smoothstep(0.08, 0.27, progress);
      const cardsIn = smoothstep(0.2, 0.34, progress);
      const cardsOut = 1 - smoothstep(0.68, 0.82, progress);
      const cardsOpacity = Math.min(cardsIn, cardsOut);
      const isCompact = window.innerWidth <= 640;
      const finaleProgress = isCompact ? smoothstep(0.56, 0.78, progress) : smoothstep(0.74, 0.92, progress);
      const cardMask = 130 * smoothstep(0.24, 0.66, progress);

      section.style.setProperty("--worlds-progress", progress.toFixed(4));
      section.style.setProperty("--worlds-hero-opacity", heroOpacity.toFixed(4));
      section.style.setProperty("--worlds-hero-y", `${(-42 * progress).toFixed(2)}px`);
      section.style.setProperty("--worlds-cards-opacity", cardsOpacity.toFixed(4));
      section.style.setProperty("--worlds-cards-y", `${((1 - cardsOpacity) * 24).toFixed(2)}px`);
      section.style.setProperty("--worlds-card-mask", `${cardMask.toFixed(2)}%`);
      section.style.setProperty("--worlds-finale-opacity", finaleProgress.toFixed(4));
      section.style.setProperty("--worlds-finale-y", `${((1 - finaleProgress) * 34).toFixed(2)}px`);
      section.style.setProperty("--worlds-video-scale", (1.06 - progress * 0.045).toFixed(4));
    };

    const resizeCanvas = () => {
      const rect = canvasElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
        lastFrameIndex = -1;
      }
    };

    const drawFrame = (frame: ImageBitmap) => {
      const scale = Math.max(canvasElement.width / frame.width, canvasElement.height / frame.height);
      const width = frame.width * scale;
      const height = frame.height * scale;
      canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasContext.drawImage(
        frame,
        (canvasElement.width - width) / 2,
        (canvasElement.height - height) / 2,
        width,
        height
      );
    };

    const drawScrollFrame = (progress: number) => {
      if (!framesReady || frames.length === 0) {
        return false;
      }
      const index = Math.min(frames.length - 1, Math.max(0, Math.round(progress * (frames.length - 1))));
      if (index !== lastFrameIndex) {
        lastFrameIndex = index;
        drawFrame(frames[index]);
      }
      return true;
    };

    const seekVideo = (progress: number) => {
      if (!metadataReady || !Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) {
        return;
      }
      const target = progress * Math.max(0, video.duration - 0.08);
      if (Math.abs(video.currentTime - target) > 0.045) {
        if ("fastSeek" in video && typeof video.fastSeek === "function") {
          video.fastSeek(target);
        } else {
          video.currentTime = target;
        }
      }
    };

    const tick = () => {
      currentProgress += (targetProgress - currentProgress) * 0.12;
      if (Math.abs(targetProgress - currentProgress) < 0.0008) {
        currentProgress = targetProgress;
      }
      writeProgress(currentProgress);
      if (!drawScrollFrame(currentProgress)) {
        seekVideo(currentProgress);
      }
      frameId = window.requestAnimationFrame(tick);
    };

    const extractFrames = async () => {
      let objectUrl = "";
      try {
        const response = await fetch(WORLDS_VIDEO, { mode: "cors" });
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        const sampler = document.createElement("video");
        sampler.muted = true;
        sampler.playsInline = true;
        sampler.crossOrigin = "anonymous";
        sampler.preload = "auto";
        sampler.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("worlds video metadata timeout")), 12000);
          sampler.addEventListener("loadedmetadata", () => {
            window.clearTimeout(timeout);
            resolve();
          }, { once: true });
          sampler.addEventListener("error", () => {
            window.clearTimeout(timeout);
            reject(new Error("worlds video metadata error"));
          }, { once: true });
        });

        const scale = Math.min(1, 1080 / Math.max(1, sampler.videoWidth));
        const resizeWidth = Math.max(320, Math.round(sampler.videoWidth * scale));
        const resizeHeight = Math.max(180, Math.round(sampler.videoHeight * scale));
        const frameCount = Math.max(48, Math.min(96, Math.round(sampler.duration * 18)));

        for (let index = 0; index < frameCount && !disposed; index += 1) {
          const time = Math.max(
            0.001,
            (index / Math.max(1, frameCount - 1)) * Math.max(0, sampler.duration - 0.08)
          );
          sampler.currentTime = time;
          await new Promise<void>((resolve, reject) => {
            if (Math.abs(sampler.currentTime - time) < 0.002 && sampler.readyState >= 2) {
              resolve();
              return;
            }
            const timeout = window.setTimeout(() => reject(new Error("worlds video seek timeout")), 2500);
            sampler.addEventListener("seeked", () => {
              window.clearTimeout(timeout);
              resolve();
            }, { once: true });
          });
          if (disposed) {
            break;
          }
          frames.push(await createImageBitmap(sampler, { resizeWidth, resizeHeight }));
          if (frames.length === 1) {
            framesReady = true;
            section.classList.add("worlds-frames-ready");
            drawScrollFrame(currentProgress);
          }
        }

        if (!disposed && frames.length > 0) {
          framesReady = true;
          section.classList.add("worlds-frames-ready");
          drawScrollFrame(currentProgress);
        }
      } catch {
        framesReady = false;
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    const handleMetadata = () => {
      metadataReady = true;
      video.pause();
      seekVideo(currentProgress);
    };

    video.pause();
    video.addEventListener("loadedmetadata", handleMetadata);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("resize", resizeCanvas);

    measure();
    resizeCanvas();
    writeProgress(0);
    frameId = window.requestAnimationFrame(tick);
    void extractFrames();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      video.removeEventListener("loadedmetadata", handleMetadata);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("resize", resizeCanvas);
      for (const frame of frames) {
        frame.close();
      }
    };
  }, []);

  return (
    <section
      className="worlds-section blend-section"
      ref={sectionRef}
      aria-labelledby="worlds-title"
      style={{
        "--worlds-progress": 0,
        "--worlds-hero-opacity": 1,
        "--worlds-hero-y": "0px",
        "--worlds-cards-opacity": 0,
        "--worlds-cards-y": "24px",
        "--worlds-card-mask": "0%",
        "--worlds-finale-opacity": 0,
        "--worlds-finale-y": "34px",
        "--worlds-video-scale": 1.06
      } as CSSProperties}
    >
      <div className="worlds-sticky">
        <canvas className="worlds-frame-canvas" ref={canvasRef} aria-hidden="true" />
        <video
          ref={videoRef}
          className="space-video worlds-video"
          src={WORLDS_VIDEO}
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />
        <ParticleField />
        <div className="worlds-overlay" />
        <div className="worlds-hero">
          <Reveal>
            <div className="worlds-actions">
              <div className="worlds-code" aria-label="Prompt to Manim render pipeline">
                <span className="worlds-code-caret">&gt;</span>
                <ol className="worlds-pipeline-row">
                  {worldsPipelineSteps.map((step, index) => (
                    <li
                      key={step}
                      style={{ "--pipeline-index": index } as CSSProperties}
                    >
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Reveal>
        </div>
        <div className="world-cards">
          {worldCards.map((card, index) => (
            <Reveal key={card.title} delay={index * 0.14}>
              <article>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal className="worlds-finale">
          <p>Introducing</p>
          <h2>Manim AI Studio</h2>
        </Reveal>
      </div>
    </section>
  );
}

function DreamSection() {
  return (
    <section className="dream-section blend-section" aria-labelledby="dream-title">
      <FadingVideo src={DREAM_VIDEO} className="space-video dream-video" />
      <div className="space-layer dream-content">
        <Reveal>
          <nav className="dream-nav" aria-label="Closing navigation">
            <Link className="dream-logo" href="/">
              ManimAI<sup>®</sup>
            </Link>

            <Link className="dream-nav-cta" href="/chat">Open Studio</Link>
          </nav>
        </Reveal>
        <footer className="dream-footer">
          <div className="dream-footer-shell">
            <Reveal className="dream-footer-brand">
              <Link className="dream-footer-logo liquid-glass" href="/" aria-label="Manim AI home">
                m
              </Link>
              <p className="dream-kicker">{"// Final frame"}</p>
              <h2 id="dream-title">Turn the next lesson into motion.</h2>
              <p>
                A focused Manim studio for drafting explanations, editing Python scenes,
                rendering previews, and keeping every repair loop in one place.
              </p>
              <div className="dream-footer-actions">
                <Link className="dream-cta" href="/chat">
                  Open Studio <ArrowUpRightIcon />
                </Link>
                <Link className="dream-footer-link" href="#worlds-title">
                  Watch workflow
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.18} className="dream-footer-console">
              <div className="dream-console-head">
                <span>studio/output</span>
                <span>ready</span>
              </div>
              <ol>
                <li><span>prompt</span><strong>learning objective captured</strong></li>
                <li><span>plan</span><strong>scene beats and timing shaped</strong></li>
                <li><span>code</span><strong>editable manim.py versioned</strong></li>
                <li><span>render</span><strong>preview, repair, final mp4</strong></li>
              </ol>
            </Reveal>
          </div>

          <Reveal delay={0.35} className="dream-social-bar">
            <div className="dream-social-brand">
              <Link className="dream-social-logo liquid-glass" href="/" aria-label="Manim AI home">
                m
              </Link>
              <span>Manim AI</span>
            </div>
            <nav className="dream-social-links" aria-label="Social links">
              {footerSocials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SocialIcon name={social.icon} />
                </a>
              ))}
            </nav>
            <div className="dream-footer-meta">
              <span>Prompt -&gt; Python -&gt; MP4</span>
              <Link href="#landing-title">Back to top</Link>
            </div>
          </Reveal>
        </footer>
      </div>
    </section>
  );
}

function DalaSection() {
  return (
    <section
      id="dala-scroll"
      className="dala-section dala-background-section"
      aria-labelledby="dala-title"
      style={{
        "--dala-progress": 1
      } as CSSProperties}
    >
      <DalaParticleCanvas />
      <div className="dala-life-layer">
        <Reveal delay={0.18} className="dala-loop-stage">
          <svg className="dala-loop-arcs" viewBox="0 0 720 720" aria-hidden="true">
            <circle className="dala-loop-orbit" cx="360" cy="360" r="312" />
            <path className="dala-loop-arc dala-loop-arc-one" d="M 360 48 A 312 312 0 0 1 630 516" />
            <path className="dala-loop-arc dala-loop-arc-two" d="M 630 516 A 312 312 0 0 1 90 516" />
            <path className="dala-loop-arc dala-loop-arc-three" d="M 90 516 A 312 312 0 0 1 360 48" />
          </svg>
          <div className="dala-loop-center">
            <p>{"// System loop"}</p>
            <h2 id="dala-title">Prompt, code, render, revise.</h2>
            <span>Every output feeds the next instruction.</span>
          </div>
          <div className="dala-loop-rail" aria-hidden="true">
            <span className="dala-loop-pulse dala-loop-pulse-one" />
            <span className="dala-loop-pulse dala-loop-pulse-two" />
            <span className="dala-loop-pulse dala-loop-pulse-three" />
          </div>

          <article className="dala-node dala-node-prompt">
            <div className="dala-node-head">
              <span>01</span>
              <strong>Prompt</strong>
            </div>
            <div className="dala-prompt-box">
              <div className="dala-prompt-label">
                <span className="dala-prompt-plus">+</span>
                <strong>Ask Manim AI</strong>
              </div>
              <p>Explain eigenvectors as a 45 second Manim scene with moving arrows and labels</p>
              <span className="dala-prompt-caret" aria-hidden="true" />
            </div>
            <div className="dala-submit-row">
              <span>duration: 45s · style: geometric</span>
              <b>Submit</b>
            </div>
          </article>

          <article className="dala-node dala-node-terminal" aria-label="Code generation terminal">
            <div className="dala-node-head">
              <span>02</span>
              <strong>Code</strong>
            </div>
            <DalaTerminalCycle />
          </article>

          <article className="dala-node dala-node-render">
            <div className="dala-node-head">
              <span>03</span>
              <strong>Render</strong>
            </div>
            <div className="dala-render-screen">
              <video
                src={WORLDS_VIDEO}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
              <div className="dala-render-overlay">
                <span>render preview</span>
                <b>MP4</b>
              </div>
            </div>
            <div className="dala-render-progress">
              <span />
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

function DalaTerminalCycle() {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCycle((value) => value + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Terminal
      key={cycle}
      className="dala-aceternity-terminal"
      username="manim-ai"
      commands={[
        "vim manim_scene.py",
        "manim-ai ingest prompt.json --scene EigenVectorScene",
        "manim render manim_scene.py EigenVectorScene -qk"
      ]}
      outputs={{
        0: ["opened buffer: scene plan -> python"],
        1: [
          "+ class EigenVectorScene(Scene):",
          "+ vector = Arrow(ORIGIN, [2, 1, 0])",
          "+ self.play(GrowArrow(vector))"
        ],
        2: ["queued draft render", "preview artifact ready"]
      }}
      typingSpeed={24}
      delayBetweenCommands={420}
      initialDelay={3200}
      enableSound={false}
    />
  );
}

function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const canvasElement = canvas;
    const canvasContext = context;

    type Particle = { x: number; y: number; vx: number; vy: number; size: number; opacity: number };
    let particles: Particle[] = [];
    let frameId = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.round(window.innerWidth * dpr);
      canvasElement.height = Math.round(window.innerHeight * dpr);
      canvasElement.style.width = `${window.innerWidth}px`;
      canvasElement.style.height = `${window.innerHeight}px`;
      particles = Array.from({ length: Math.floor((canvasElement.width * canvasElement.height) / 38000) }, () => ({
        x: Math.random() * canvasElement.width,
        y: Math.random() * canvasElement.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.45 + 0.18
      }));
    }

    function animate() {
      canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0) particle.x = canvasElement.width;
        if (particle.x > canvasElement.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvasElement.height;
        if (particle.y > canvasElement.height) particle.y = 0;
        canvasContext.beginPath();
        canvasContext.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        canvasContext.fillStyle = `rgba(255,255,255,${particle.opacity})`;
        canvasContext.fill();
      }
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="particles-canvas" ref={canvasRef} aria-hidden="true" />;
}

function DalaParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const canvasElement = canvas;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const section = canvasElement.closest(".dala-section");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.set(0, 0.2, 7.5);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true, alpha: true });
    renderer.setClearColor("#000000", 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const brainGroup = new THREE.Group();
    const figureGroup = new THREE.Group();
    scene.add(brainGroup, figureGroup);

    let frameId = 0;
    let seed = 42;
    let pointCount = 0;
    let brainTargets = new Float32Array();
    let scatterTargets = new Float32Array();
    const geometry = new THREE.BufferGeometry();
    const palette = ["#ffffff", "#bdbdbd", "#ffb829", "#8052ff", "#15846e"].map((color) => new THREE.Color(color));
    const material = new THREE.PointsMaterial({
      size: 0.042,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const points = new THREE.Points(geometry, material);
    brainGroup.add(points);
    const figures: THREE.Mesh[] = [];

    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    function brainPoint() {
      for (let attempt = 0; attempt < 160; attempt += 1) {
        const x = random() * 2.2 - 1.1;
        const y = random() * 1.8 - 0.9;
        const z = random() * 1.5 - 0.75;
        const upper = ((x + 0.12) / 1.08) ** 2 + ((y + 0.02) / 0.72) ** 2 + (z / 0.7) ** 2 < 1;
        const front = ((x + 0.94) / 0.32) ** 2 + ((y + 0.1) / 0.38) ** 2 + (z / 0.48) ** 2 < 1;
        const rear = ((x - 0.78) / 0.42) ** 2 + ((y + 0.08) / 0.5) ** 2 + (z / 0.58) ** 2 < 1;
        const lower = ((x - 0.05) / 0.82) ** 2 + ((y - 0.55) / 0.26) ** 2 + (z / 0.52) ** 2 < 1;
        const notch = ((x + 0.16) / 0.24) ** 2 + ((y - 0.74) / 0.2) ** 2 + (z / 0.42) ** 2 < 1;
        if ((upper || front || rear || lower) && !notch) {
          return new THREE.Vector3(x * 2.15, y * 1.55, z * 1.1);
        }
      }
      return new THREE.Vector3(random() * 4 - 2, random() * 2 - 1, random() * 1.4 - 0.7);
    }

    function rebuildPointCloud() {
      seed = 42;
      const rect = canvasElement.getBoundingClientRect();
      pointCount = Math.min(5200, Math.max(2800, Math.floor((rect.width * rect.height) / 210)));
      brainTargets = new Float32Array(pointCount * 3);
      scatterTargets = new Float32Array(pointCount * 3);
      const nextPositions = new Float32Array(pointCount * 3);
      const nextColors = new Float32Array(pointCount * 3);

      for (let index = 0; index < pointCount; index += 1) {
        const brain = brainPoint();
        const scatter = new THREE.Vector3(
          (random() - 0.5) * 11.5,
          (random() - 0.5) * 6.2,
          (random() - 0.5) * 4.8
        );
        const color = palette[Math.floor(random() * palette.length)];
        brainTargets.set([brain.x, brain.y, brain.z], index * 3);
        scatterTargets.set([scatter.x, scatter.y, scatter.z], index * 3);
        nextPositions.set([brain.x, brain.y, brain.z], index * 3);
        nextColors.set([color.r, color.g, color.b], index * 3);
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(nextPositions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(nextColors, 3));
    }

    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const smoothstep = (edge0: number, edge1: number, value: number) => {
      const t = clamp((value - edge0) / Math.max(0.001, edge1 - edge0));
      return t * t * (3 - 2 * t);
    };

    function rebuildFigures() {
      for (const figure of figures) {
        figure.geometry.dispose();
        if (Array.isArray(figure.material)) {
          figure.material.forEach((item) => item.dispose());
        } else {
          figure.material.dispose();
        }
        figureGroup.remove(figure);
      }
      figures.length = 0;
      seed = 99;
      for (let index = 0; index < 34; index += 1) {
        const geometryType = index % 3 === 0
          ? new THREE.OctahedronGeometry(0.16 + random() * 0.18, 0)
          : new THREE.TetrahedronGeometry(0.18 + random() * 0.2, 0);
        const material = new THREE.MeshBasicMaterial({
          color: palette[Math.floor(random() * palette.length)],
          wireframe: true,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(geometryType, material);
        mesh.position.set((random() - 0.5) * 10.8, (random() - 0.5) * 5.8, (random() - 0.5) * 4.4);
        mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
        figures.push(mesh);
        figureGroup.add(mesh);
      }
    }

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }

    function render(now = 0) {
      const time = now * 0.001;
      const progress = Number.parseFloat(
        getComputedStyle(section ?? canvasElement).getPropertyValue("--dala-progress")
      ) || 0;
      const zoom = smoothstep(0.16, 0.42, progress);
      const disperse = smoothstep(0.42, 0.62, progress);

      const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (positionAttribute) {
        const array = positionAttribute.array as Float32Array;
        for (let index = 0; index < pointCount; index += 1) {
          const offset = index * 3;
          const pulse = reducedMotion ? 0 : Math.sin(time * 0.5 + index * 0.037) * 0.016;
          array[offset] = brainTargets[offset] + (scatterTargets[offset] - brainTargets[offset]) * disperse + pulse;
          array[offset + 1] = brainTargets[offset + 1] + (scatterTargets[offset + 1] - brainTargets[offset + 1]) * disperse;
          array[offset + 2] = brainTargets[offset + 2] + (scatterTargets[offset + 2] - brainTargets[offset + 2]) * disperse + pulse * 2;
        }
        positionAttribute.needsUpdate = true;
      }

      brainGroup.position.x = THREE.MathUtils.lerp(1.35, -1.75, zoom * (1 - disperse)) * (1 - disperse);
      brainGroup.position.y = THREE.MathUtils.lerp(0, 0.05, zoom);
      const scale = THREE.MathUtils.lerp(1.03, 1.7, zoom * (1 - disperse));
      brainGroup.scale.setScalar(THREE.MathUtils.lerp(scale, 1, disperse));
      brainGroup.rotation.y = -0.28 + Math.sin(time * 0.16) * 0.06 + zoom * 0.28;
      brainGroup.rotation.x = 0.08 + Math.cos(time * 0.13) * 0.035;

      figureGroup.rotation.y = time * 0.025;
      figureGroup.rotation.x = Math.sin(time * 0.08) * 0.08;
      figureGroup.position.z = THREE.MathUtils.lerp(-0.8, 0.2, disperse);
      figureGroup.children.forEach((child, index) => {
        child.rotation.x += 0.003 + index * 0.00007;
        child.rotation.y += 0.004 + index * 0.00005;
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        material.opacity = 0.22 + disperse * 0.38;
      });

      material.opacity = 0.94 - disperse * 0.3;
      renderer.render(scene, camera);

      if (!reducedMotion) {
        frameId = window.requestAnimationFrame(render);
      }
    }

    rebuildPointCloud();
    rebuildFigures();
    resize();
    render();
    window.addEventListener("resize", resize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      for (const figure of figures) {
        figure.geometry.dispose();
        if (Array.isArray(figure.material)) {
          figure.material.forEach((item) => item.dispose());
        } else {
          figure.material.dispose();
        }
      }
      renderer.dispose();
    };
  }, []);

  return <canvas className="dala-particles" ref={canvasRef} aria-hidden="true" />;
}

function Navbar() {
  return (
    <header className="space-navbar">
      <Link className="space-logo liquid-glass" href="/" aria-label="Home">
        m
      </Link>
      <nav className="space-nav-pill liquid-glass" aria-label="Primary navigation">
        <a href="#">Home</a>
        <a href="#worlds-title">Workflow</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#dream-title">Use Cases</a>
        <Link className="space-claim" href="/chat">
          Open Studio <ArrowUpRightIcon />
        </Link>
      </nav>
      <span className="space-navbar-spacer" aria-hidden="true" />
    </header>
  );
}

function FadingVideo({ src, className, style }: { src: string; className: string; style?: CSSProperties }) {
  const primaryRef = useRef<HTMLVideoElement | null>(null);
  const secondaryRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const crossingRef = useRef(false);
  const posterCapturedRef = useRef(false);
  const [posterFrame, setPosterFrame] = useState<string | null>(null);

  useEffect(() => {
    const videos = [primaryRef.current, secondaryRef.current].filter(Boolean) as HTMLVideoElement[];
    if (videos.length !== 2) {
      return;
    }

    function cancelFade() {
      if (fadeRafRef.current !== null) {
        window.cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
    }

    function fadePair(fromVideo: HTMLVideoElement, toVideo: HTMLVideoElement, duration: number, onDone?: () => void) {
      cancelFade();
      const fromStart = Number.parseFloat(fromVideo.style.opacity || "1") || 0;
      const toStart = Number.parseFloat(toVideo.style.opacity || "0") || 0;
      const start = performance.now();

      function step(now: number) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        fromVideo.style.opacity = String(fromStart + (0 - fromStart) * eased);
        toVideo.style.opacity = String(toStart + (1 - toStart) * eased);
        if (progress < 1) {
          fadeRafRef.current = window.requestAnimationFrame(step);
          return;
        }
        onDone?.();
      }

      fadeRafRef.current = window.requestAnimationFrame(step);
    }

    function capturePoster(video: HTMLVideoElement) {
      if (posterCapturedRef.current || !video.videoWidth || !video.videoHeight) {
        return;
      }
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        posterCapturedRef.current = true;
        setPosterFrame(canvas.toDataURL("image/jpeg", 0.78));
      } catch {
        posterCapturedRef.current = true;
      }
    }

    function prepareVideo(video: HTMLVideoElement, opacity: number) {
      video.muted = true;
      video.loop = false;
      video.playsInline = true;
      video.preload = "auto";
      video.style.opacity = String(opacity);
      video.playbackRate = 1;
    }

    function seekToLoopStart(video: HTMLVideoElement) {
      const start = Number.isFinite(video.duration)
        ? Math.min(LOOP_START_OFFSET, Math.max(0, video.duration * 0.04))
        : 0;
      try {
        video.currentTime = start;
      } catch {
        // Some browsers reject seeks until metadata is ready; the next pass will retry.
      }
    }

    function startCrossfade() {
      if (crossingRef.current) {
        return;
      }
      const fromIndex = activeIndexRef.current;
      const toIndex = fromIndex === 0 ? 1 : 0;
      const fromVideo = videos[fromIndex];
      const toVideo = videos[toIndex];
      if (!fromVideo || !toVideo || toVideo.readyState < 2) {
        return;
      }
      crossingRef.current = true;
      seekToLoopStart(toVideo);
      toVideo.style.opacity = "0";
      toVideo.play().catch(() => null);
      fadePair(fromVideo, toVideo, LOOP_CROSSFADE_MS, () => {
        fromVideo.pause();
        seekToLoopStart(fromVideo);
        activeIndexRef.current = toIndex;
        crossingRef.current = false;
      });
    }

    function tick() {
      const activeVideo = videos[activeIndexRef.current];
      if (activeVideo && Number.isFinite(activeVideo.duration) && activeVideo.duration > 0) {
        const remaining = activeVideo.duration - activeVideo.currentTime;
        if (remaining <= LOOP_CROSSFADE_LEAD && remaining > 0) {
          startCrossfade();
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    }

    function handlePrimaryLoaded() {
      capturePoster(videos[0]);
      videos[0].play().catch(() => null);
      fadePair(videos[1], videos[0], FADE_MS);
    }

    videos.forEach((video, index) => prepareVideo(video, index === 0 ? 0 : 0));
    videos[0].addEventListener("loadeddata", handlePrimaryLoaded);
    videos[1].addEventListener("loadedmetadata", () => seekToLoopStart(videos[1]), { once: true });
    if (videos[0].readyState >= 2) {
      handlePrimaryLoaded();
    }
    tick();

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cancelFade();
      videos[0].removeEventListener("loadeddata", handlePrimaryLoaded);
      videos.forEach((video) => video.pause());
    };
  }, [src]);

  return (
    <span className={`seamless-video-shell ${className}`} style={style} aria-hidden="true">
      {posterFrame ? (
        <span
          className="seamless-video-poster"
          style={{ backgroundImage: `url(${posterFrame})` }}
        />
      ) : null}
      <video
        ref={primaryRef}
        className="seamless-video-layer"
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        poster={posterFrame ?? undefined}
      />
      <video
        ref={secondaryRef}
        className="seamless-video-layer"
        src={src}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        poster={posterFrame ?? undefined}
      />
    </span>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`motion-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}

function BlurText({ text, className, id }: { text: string; className: string; id?: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <p ref={ref} id={id} className={`${className} blur-text ${visible ? "is-visible" : ""}`}>
      {text.split(" ").map((word, index) => (
        <span key={`${word}-${index}`} style={{ "--word-delay": `${index * 0.1}s` } as CSSProperties}>
          {word}
        </span>
      ))}
    </p>
  );
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <article className="space-stat liquid-glass">
      {icon}
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5" />
      <path d="M12 3.5C9.6 5.8 8.5 8.7 8.5 12s1.1 6.2 3.5 8.5" />
    </svg>
  );
}

function MaterialIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    image: "M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h14q.825 0 1.413.588T21 5v14q0 .825-.587 1.413T19 21H5Zm1-4h12l-3.75-5-3 4L9 13l-3 4Z",
    movie: "M4 6.47 5.76 10H20v8H4V6.47M22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.89-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4Z",
    lightbulb: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1Zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7Z",
    spark: "M11 2h2l.7 5.4L19 5l1 1.7-4.6 3.1L21 12l-.7 1.9-5.7-.6 3.3 4.7-1.6 1.2-4.3-3.9-4.3 3.9-1.6-1.2 3.3-4.7-5.7.6L3 12l5.6-2.2L4 6.7 5 5l5.3 2.4L11 2Z",
    code: "M8.7 16.6 4.1 12l4.6-4.6 1.4 1.4L6.9 12l3.2 3.2-1.4 1.4Zm6.6 0-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4 4.6 4.6-4.6 4.6ZM11.2 19l-1.9-.6L12.8 5l1.9.6L11.2 19Z",
    queue: "M5 5h14v4H5V5Zm0 5h14v4H5v-4Zm0 5h14v4H5v-4Zm2-8v1h10V7H7Zm0 5v1h10v-1H7Zm0 5v1h10v-1H7Z"
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function SocialIcon({ name }: { name: string }) {
  if (name === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.51-1.11-1.51-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.86.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.04 0-1.11.39-2.03 1.03-2.74-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.04A9.3 9.3 0 0 1 12 6.99c.85 0 1.7.12 2.5.35 1.9-1.32 2.74-1.04 2.74-1.04.55 1.4.2 2.44.1 2.7.64.71 1.03 1.63 1.03 2.74 0 3.92-2.34 4.78-4.57 5.03.36.32.68.94.68 1.9v2.76c0 .27.18.59.69.49A10.1 10.1 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
      </svg>
    );
  }
  if (name === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.58 7.19a2.52 2.52 0 0 0-1.77-1.78C18.24 5 12 5 12 5s-6.24 0-7.81.41a2.52 2.52 0 0 0-1.77 1.78A26.3 26.3 0 0 0 2 12a26.3 26.3 0 0 0 .42 4.81 2.52 2.52 0 0 0 1.77 1.78C5.76 19 12 19 12 19s6.24 0 7.81-.41a2.52 2.52 0 0 0 1.77-1.78A26.3 26.3 0 0 0 22 12a26.3 26.3 0 0 0-.42-4.81ZM10 15.05v-6.1L15.2 12 10 15.05Z" />
      </svg>
    );
  }
  if (name === "discord") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.54 5.34A18.1 18.1 0 0 0 15.05 4l-.22.44a13.6 13.6 0 0 1 4.05 2.04 13.02 13.02 0 0 0-5.07-1.54 13.2 13.2 0 0 0-3.62 0 13.02 13.02 0 0 0-5.07 1.54 13.6 13.6 0 0 1 4.05-2.04L8.95 4a18.1 18.1 0 0 0-4.49 1.34C1.62 9.58.86 13.72 1.24 17.8A18.25 18.25 0 0 0 6.75 20.6l.67-.9a11.8 11.8 0 0 1-3.5-1.66l.84-.64c2.27 1.05 4.73 1.58 7.24 1.58s4.97-.53 7.24-1.58l.84.64a11.8 11.8 0 0 1-3.5 1.66l.67.9a18.25 18.25 0 0 0 5.51-2.8c.45-4.74-.77-8.84-3.22-12.46ZM8.56 15.28c-.7 0-1.27-.65-1.27-1.44s.56-1.44 1.27-1.44c.7 0 1.28.65 1.27 1.44 0 .79-.56 1.44-1.27 1.44Zm6.88 0c-.7 0-1.27-.65-1.27-1.44s.56-1.44 1.27-1.44c.71 0 1.28.65 1.27 1.44 0 .79-.56 1.44-1.27 1.44Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.9 2h3.06l-6.68 7.63L23.14 22h-6.16l-4.82-6.3L6.64 22H3.58l7.14-8.17L3.18 2h6.32l4.36 5.76L18.9 2Zm-1.07 17.82h1.7L8.58 4.07H6.76l11.07 15.75Z" />
    </svg>
  );
}

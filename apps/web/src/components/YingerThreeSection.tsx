"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function readClock() {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
  const suffix = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  return { time: `${hour}:${minute}`, suffix };
}

export default function YingerThreeSection() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [clock, setClock] = useState({ time: "--:--", suffix: "" });

  useEffect(() => {
    setClock(readClock());
    const interval = window.setInterval(() => setClock(readClock()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) {
      return;
    }
    const mount = mountNode;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#12130f");

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(5.9, 4.7, 7.4);
    camera.lookAt(0.2, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#12130f", 1);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#e4dfda", 1.4);
    const key = new THREE.DirectionalLight("#e4dfda", 3.4);
    key.position.set(4, 7, 5);
    const rose = new THREE.PointLight("#f5c2c8", 16, 8);
    rose.position.set(-2.8, 1.1, 2.2);
    scene.add(ambient, key, rose);

    const group = new THREE.Group();
    group.rotation.y = -0.66;
    group.rotation.x = 0.12;
    scene.add(group);

    const geometry = new THREE.BoxGeometry(0.44, 1, 0.44);
    const chipGeometry = new THREE.BoxGeometry(0.34, 0.16, 0.34);
    const boneMaterial = new THREE.MeshPhysicalMaterial({
      color: "#e4dfda",
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.8,
      clearcoatRoughness: 0.22,
      emissive: "#f5c2c8",
      emissiveIntensity: 0.055
    });
    const edgeMaterial = new THREE.MeshPhysicalMaterial({
      color: "#d8d4cf",
      roughness: 0.3,
      metalness: 0.04,
      emissive: "#f5c2c8",
      emissiveIntensity: 0.12
    });

    const bars: Array<{ mesh: THREE.Mesh; base: number; phase: number }> = [];
    const size = 5;
    for (let x = 0; x < size; x += 1) {
      for (let z = 0; z < size; z += 1) {
        const distance = Math.hypot(x - 2, z - 2);
        const base = Math.max(0.55, 2.7 - distance * 0.32 + ((x + z) % 3) * 0.13);
        const mesh = new THREE.Mesh(geometry, (x + z) % 2 === 0 ? boneMaterial : edgeMaterial);
        mesh.position.set((x - 2) * 0.52, base / 2 - 0.8, (z - 2) * 0.52);
        mesh.scale.y = base;
        group.add(mesh);
        bars.push({ mesh, base, phase: x * 0.52 + z * 0.37 });
      }
    }

    for (let index = 0; index < 7; index += 1) {
      const chip = new THREE.Mesh(chipGeometry, edgeMaterial);
      chip.position.set(-1.8 + index * 0.55, -1.38 - index * 0.035, 2.15 + index * 0.08);
      chip.rotation.set(0.1, index * 0.22, -0.08);
      group.add(chip);
    }

    const startedAt = performance.now();
    let frameId = 0;

    function resize() {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    }

    function animate() {
      const elapsed = (performance.now() - startedAt) / 1000;
      group.rotation.y = -0.66 + Math.sin(elapsed * 0.24) * 0.12;
      group.rotation.x = 0.12 + Math.cos(elapsed * 0.2) * 0.045;
      for (const bar of bars) {
        const pulse = 0.72 + Math.sin(elapsed * 1.7 + bar.phase) * 0.22 + Math.sin(elapsed * 0.8 + bar.phase * 1.8) * 0.12;
        const height = Math.max(0.34, bar.base * pulse);
        bar.mesh.scale.y = height;
        bar.mesh.position.y = height / 2 - 0.8;
      }
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      chipGeometry.dispose();
      boneMaterial.dispose();
      edgeMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <section id="yinger-screen" className="yinger-three-screen blend-section" aria-labelledby="yinger-title">
      <a className="yinger-three-wordmark" href="#top">MANIM</a>
      <div className="yinger-three-canvas" ref={mountRef} aria-hidden="true" />
      <div className="yinger-three-bio">
        <p>LOCAL TIME / PROMPT TO MANIM</p>
        <div className="yinger-three-clock">
          <span>{clock.time}</span>
          <small>{clock.suffix}</small>
        </div>
        <h2 id="yinger-title">UI Engineer who dips his toes in Realtime 3D Interaction · Perf</h2>
        <p>PYTHON, MANIM, RENDER QUEUE — US OF AI / DESIGN ENGINEER #CLNRK</p>
      </div>
      <nav className="yinger-three-links" aria-label="Yinger screen links">
        <a href="/chat">Studio</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#worlds-title">Worlds</a>
        <a href="#dream-title">Contact</a>
      </nav>
    </section>
  );
}

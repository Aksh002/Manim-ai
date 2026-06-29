"use client";

import { useEffect, useState } from "react";

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

export default function YingerClock() {
  const [clock, setClock] = useState({ time: "--:--", suffix: "" });

  useEffect(() => {
    setClock(readClock());
    const interval = window.setInterval(() => setClock(readClock()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="yinger-clock" aria-label={`Local time ${clock.time} ${clock.suffix}`}>
      <span>{clock.time}</span>
      <small>{clock.suffix}</small>
    </div>
  );
}

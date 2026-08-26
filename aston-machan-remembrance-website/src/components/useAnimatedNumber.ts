"use client";

import { useEffect, useRef, useState } from "react";

/** Smoothly counts from the previous value to the next one. */
export function useAnimatedNumber(value: number, duration = 1100): number {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const start = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const origin = from.current;
    if (origin === value) return;
    start.current = null;

    const step = (time: number) => {
      if (start.current === null) start.current = time;
      const progress = Math.min(1, (time - start.current) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(origin + (value - origin) * eased));
      if (progress < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        from.current = value;
      }
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  return display;
}

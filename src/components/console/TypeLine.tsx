"use client";
import { useEffect, useRef, useState } from "react";

export default function TypeLine({
  text,
  speed = 14,
  className,
  onProgress,
  animate = true,
}: {
  text: string;
  speed?: number;
  className?: string;
  onProgress?: () => void;
  animate?: boolean;
}) {
  const [shown, setShown] = useState<string>(animate ? "" : text);
  const idxRef = useRef(0);

  useEffect(() => {
    const shouldAnimate = animate && text.length <= 2000;
    if (!shouldAnimate) {
      setShown(text);
      onProgress?.();
      return;
    }
    setShown("");
    idxRef.current = 0;
    const timer = setInterval(() => {
      idxRef.current++;
      setShown(text.slice(0, idxRef.current));
      onProgress?.();
      if (idxRef.current >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, animate, onProgress]);

  return (
    <div className={`font-mono whitespace-pre-wrap leading-6 ${className || ""}`}>
      {shown}
    </div>
  );
}
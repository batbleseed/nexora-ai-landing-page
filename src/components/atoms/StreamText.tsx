import { useEffect, useState } from "react";

export function StreamText({
  text,
  charMs = 14,
  onProgress,
  onDone,
}: {
  text: string;
  charMs?: number;
  onProgress?: () => void;
  onDone?: () => void;
}) {
  const [count, setCount] = useState(0);
  const done = count >= text.length;

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    onProgress?.();
    if (done) {
      onDone?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setCount((c) => Math.min(text.length, c + 2));
    }, charMs);
    return () => window.clearTimeout(timer);
  }, [count, done, text.length, charMs, onProgress, onDone]);

  const tailSize = 10;
  const splitAt = Math.max(0, count - tailSize);
  const settled = text.slice(0, splitAt);
  const tail = text.slice(splitAt, count);

  return (
    <>
      <span>{settled}</span>
      {tail && <span className="stream-tail">{tail}</span>}
      <span className={`stream-caret ${done ? "" : "is-streaming"}`} aria-hidden="true" />
    </>
  );
}

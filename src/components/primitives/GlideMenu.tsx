"use client";

import { useRef, useState, type ReactNode } from "react";

export default function GlideMenu({
  children,
  className = "",
  highlightClassName = "inset-x-0 rounded-[8px] bg-hover-2",
  rowSelector = "[data-menu-row]",
}: {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);
  const [animateMove, setAnimateMove] = useState(false);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const row = (e.target as Element).closest(rowSelector) as HTMLElement | null;
    if (!row || !container.contains(row)) return;

    const cRect = container.getBoundingClientRect();
    const rRect = row.getBoundingClientRect();
    const nextTop = rRect.top - cRect.top;
    const nextHeight = rRect.height;

    setAnimateMove(rect !== null);
    setRect((prev) =>
      prev && prev.top === nextTop && prev.height === nextHeight
        ? prev
        : { top: nextTop, height: nextHeight }
    );
  };

  const handlePointerLeave = () => {
    setRect(null);
    setAnimateMove(false);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative ${className}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute top-0 ${highlightClassName}`}
        style={{
          height: rect ? rect.height : 32,
          transform: `translateY(${rect ? rect.top : 0}px)`,
          opacity: rect ? 1 : 0,
          transition: animateMove
            ? "transform 180ms cubic-bezier(0.16, 1, 0.3, 1), height 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease-out"
            : "opacity 140ms ease-out",
        }}
      />
      {children}
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NexoraLogo } from "./icons/NexoraLogo";

/* ─────────────────────────────────────────────────────────
 * THINKING — real-time expandable reasoning & execution trace
 *
 * Driven purely by live stream status, streamed reasoningText,
 * and measured elapsed time (no mock timers or placeholder copy).
 * ───────────────────────────────────────────────────────── */

export type ThinkingRow = {
  primary: string;
  secondary?: string;
  mono?: boolean;
  add?: number;
  del?: number;
  href?: string;
};

export type ThinkingVariant = "Steps" | "Reasoning" | "Search" | "Coding";

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "< 1s";
  if (ms < 1000) return `${Math.max(100, Math.round(ms / 100) * 100)}ms`;
  const secs = ms / 1000;
  if (secs < 10) return `${secs.toFixed(1)}s`;
  const rounded = Math.round(secs);
  if (rounded < 60) return `${rounded}s`;
  const mins = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return `${mins}m ${rem}s`;
}

export default function ThinkingState({
  variant = "Steps",
  isWorking = false,
  reasoningText,
  durationMs,
  rows = [],
  active,
  done,
  query,
  icon,
  fill = false,
}: {
  variant?: ThinkingVariant | string;
  isWorking?: boolean;
  reasoningText?: string;
  durationMs?: number;
  rows?: ThinkingRow[];
  active?: string;
  done?: string;
  query?: string;
  icon?: ReactNode;
  instant?: boolean;
  fill?: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [liveElapsedMs, setLiveElapsedMs] = useState<number>(durationMs ?? 0);
  const startedAtRef = useRef<number | null>(null);
  const reasoningScrollRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);

  const hasReasoning = Boolean(reasoningText && reasoningText.trim().length > 0);
  const effectiveVariant = hasReasoning ? "Reasoning" : variant;

  // Track real elapsed wall-clock time while generation/thinking is running
  useEffect(() => {
    if (!isWorking) {
      startedAtRef.current = null;
      if (typeof durationMs === "number" && durationMs > 0) {
        setLiveElapsedMs(durationMs);
      }
      return;
    }

    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now() - (durationMs ?? 0);
    }

    const tick = () => {
      if (startedAtRef.current !== null) {
        setLiveElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }
    };
    tick();
    const id = window.setInterval(tick, 120);
    return () => window.clearInterval(id);
  }, [isWorking, durationMs]);

  // Auto-expand while live reasoning prose is actively streaming; settle cleanly once finished
  const autoExpanded = Boolean(isWorking && hasReasoning);
  const expanded = manualExpanded ?? autoExpanded;

  useEffect(() => {
    if (expanded && hasReasoning && isWorking && reasoningScrollRef.current) {
      reasoningScrollRef.current.scrollTop = reasoningScrollRef.current.scrollHeight;
    }
  }, [reasoningText, expanded, hasReasoning, isWorking]);

  useLayoutEffect(() => {
    if (traceRef.current) {
      setLineHeight(traceRef.current.offsetHeight);
    }
  }, [expanded, reasoningText, rows.length, isWorking]);

  const measuredMs = typeof durationMs === "number" && durationMs > 0 ? durationMs : liveElapsedMs;
  const elapsedLabel = formatElapsed(measuredMs);

  const activeLabel = active
    ? `${active} · ${elapsedLabel}`
    : hasReasoning
      ? `Thinking · ${elapsedLabel}`
      : `Working · ${elapsedLabel}`;

  const doneLabel = done
    ? measuredMs > 0
      ? `${done} · ${elapsedLabel}`
      : done
    : hasReasoning
      ? `Thought for ${elapsedLabel}`
      : measuredMs > 0
        ? `Completed in ${elapsedLabel}`
        : "Completed";

  const hasDetails = hasReasoning || rows.length > 0 || Boolean(query);

  return (
    <div
      className={fill ? "flex w-full flex-col" : "flex w-full max-w-95 flex-col"}
    >
      {/* Header button */}
      <button
        type="button"
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        onClick={() => {
          if (!hasDetails) return;
          setManualExpanded((current) => !(current ?? autoExpanded));
        }}
        className={`-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 transition-colors duration-100 ${
          hasDetails ? "hover:bg-hover-2" : "cursor-default"
        }`}
      >
        {icon ? (
          <span
            className="flex shrink-0 transition-colors duration-200"
            style={{ color: isWorking ? "var(--ink-2)" : "var(--ink-3)" }}
          >
            {icon}
          </span>
        ) : (
          <NexoraLogo
            size={16}
            className={`shrink-0 transition-colors duration-200 ${
              isWorking ? "text-ink" : "text-ink-2"
            }`}
          />
        )}

        <span role="status" className="contents">
          {isWorking ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent tabular-nums"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              {activeLabel}
            </span>
          ) : (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2 tabular-nums">
              {doneLabel}
            </span>
          )}
        </span>

        {hasDetails && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {/* Expandable real thinking trace */}
      {hasDetails && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: expanded ? "1fr" : "0fr",
            opacity: expanded ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="relative mt-1 ml-[5px] pl-4">
              <span
                aria-hidden
                className="absolute left-[3px] w-px bg-line"
                style={{
                  top: -6,
                  height: lineHeight ? Math.max(0, lineHeight - 2) : 0,
                }}
              />
              <div ref={traceRef} className="flex flex-col gap-1 py-1">
                {query && (
                  <div className="flex h-6 items-center gap-2 px-1.5">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--ink-3)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="shrink-0"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <span className="text-[12.5px] text-ink-2">{query}</span>
                  </div>
                )}

                {hasReasoning ? (
                  <div
                    ref={reasoningScrollRef}
                    className="max-h-60 overflow-y-auto px-1.5 py-0.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2"
                  >
                    {reasoningText}
                    {isWorking && (
                      <span
                        aria-hidden="true"
                        className="ml-1 inline-block h-3 w-[2px] translate-y-[1px] bg-ink-2 align-baseline"
                        style={{ animation: "caret-blink 1s step-end infinite" }}
                      />
                    )}
                  </div>
                ) : (
                  rows.map((row, i) => {
                    const isLastActive = isWorking && i === rows.length - 1;
                    return (
                      <div
                        key={`${row.primary}-${i}`}
                        className="flex min-h-6 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left"
                      >
                        {effectiveVariant === "Steps" &&
                          (isLastActive ? (
                            <span
                              className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                              style={{ animation: "spin 700ms linear infinite" }}
                            />
                          ) : (
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--ink-3)"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="shrink-0"
                            >
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ))}
                        <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-2">
                          {row.primary}
                        </span>
                        {row.secondary && (
                          <span
                            className={`shrink-0 text-[11.5px] text-ink-3 ${row.mono ? "font-mono" : ""}`}
                          >
                            {row.secondary}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

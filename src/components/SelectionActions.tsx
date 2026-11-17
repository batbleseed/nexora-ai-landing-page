"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "./atoms/Button";
import { Shimmer } from "./atoms/Shimmer";
import { StreamText } from "./atoms/StreamText";

/* ─────────────────────────────────────────────────────────
 * SELECTION ACTIONS
 * A contextual AI bar attached beneath selected text.
 * The global theme owns its surface; this component only
 * composes existing surface, ink, accent, radius and motion
 * tokens.
 * ───────────────────────────────────────────────────────── */

const LEAD = "Pistachio holds the top slot all weekend. ";
const PICKED =
  "Churn it first thing Saturday so the batch has time to firm up before the afternoon rush.";
const REWRITE =
  "Churn pistachio first thing Saturday so the batch has time to fully firm before the afternoon rush.";

export type SelectionText = {
  lead: string;
  original: string;
  rewrite: string;
};

export type SelectionAction = {
  id: string;
  icon: ReactNode;
  action?: string;
  busyLabel?: string;
};

export type SelectionActionSet = {
  primary: SelectionAction[];
  more: SelectionAction[];
};

export type SelectionActionsLabels = {
  keep: string;
  discard: string;
  placeholder: string;
};

const DEFAULT_TEXT: SelectionText = {
  lead: LEAD,
  original: PICKED,
  rewrite: REWRITE,
};

const DEFAULT_LABELS: SelectionActionsLabels = {
  keep: "Keep",
  discard: "Discard",
  placeholder: "Describe edits",
};

type Mode = "idle" | "thinking" | "streaming" | "result";

const icons = {
  explain: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0 0 12 22Z" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.5-2.4 1.9-2.4 3.3" />
      <path d="M12 16.5v.01" />
    </svg>
  ),
  improve: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9Z" />
      <path d="M19 3v3M20.5 4.5h-3" />
    </svg>
  ),
  shorten: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
    </svg>
  ),
  tone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01" />
      <path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2" />
    </svg>
  ),
  grammar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M8 9h8M12 9v6" />
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  retry: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
    </svg>
  ),
};

const primary =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 text-[12.5px] font-normal text-canvas shadow-hairline transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.96]";

const DEFAULT_ACTIONS: SelectionActionSet = {
  primary: [
    { id: "Explain", icon: icons.explain, action: "Explain", busyLabel: "Explaining" },
    { id: "Improve", icon: icons.improve, action: "Improve", busyLabel: "Improving" },
  ],
  more: [
    { id: "Shorten", icon: icons.shorten, action: "Shorten", busyLabel: "Shortening" },
    { id: "Tone", icon: icons.tone, action: "Change tone", busyLabel: "Changing tone" },
    { id: "Grammar", icon: icons.grammar, action: "Fix grammar", busyLabel: "Checking grammar" },
  ],
};

function computeRewrite(actionName: string, base: string, defaultRewrite: string): string {
  const lower = actionName.toLowerCase();
  if (lower.includes("shorten")) {
    return "Churn pistachio early Saturday so it firms up before the afternoon rush.";
  }
  if (lower.includes("tone")) {
    return "Let’s churn pistachio first thing Saturday morning so the batch sets cleanly ahead of the afternoon crowd.";
  }
  if (lower.includes("grammar")) {
    return "Churn it first thing on Saturday so the batch has time to firm up before the afternoon rush.";
  }
  if (lower.includes("explain")) {
    return "Churning pistachio early Saturday gives the dense nut base enough chill time to hold a clean scoop before peak afternoon traffic.";
  }
  if (actionName === "Improve") {
    return defaultRewrite;
  }
  return defaultRewrite !== base ? defaultRewrite : REWRITE;
}

export type SelectionActionsProps = {
  variant?: string;
  text?: Partial<SelectionText>;
  actions?: SelectionActionSet;
  labels?: Partial<SelectionActionsLabels>;
  onAction?: (action: string) => void;
  fill?: boolean;
};

export default function SelectionActions({
  text: textProp,
  actions = DEFAULT_ACTIONS,
  labels,
  onAction,
  fill = false,
}: SelectionActionsProps = {}) {
  const passage = { ...DEFAULT_TEXT, ...textProp };
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [action, setAction] = useState("Improve");
  const [currentOriginal, setCurrentOriginal] = useState(passage.original);
  const [prompt, setPrompt] = useState("");
  const [typingWidth, setTypingWidth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousModeRef = useRef<Mode>("idle");
  const lastWidthRef = useRef(0);
  const widthAnimationRef = useRef<Animation | null>(null);

  const activeRewrite = computeRewrite(action, currentOriginal, passage.rewrite);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mode !== "thinking") return;
    const timer = window.setTimeout(() => setMode("streaming"), 700);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const place = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const host = hostRef.current;
      const selection = selectionRef.current;
      if (!host || !selection) return;

      const bounds = selection.getBoundingClientRect();
      const lines = Array.from(selection.getClientRects());
      const lastLine = lines.at(-1);
      if (!lastLine) return;

      const hostBounds = host.getBoundingClientRect();
      const next = {
        x: Math.round(bounds.left - hostBounds.left + bounds.width / 2),
        y: Math.round(lastLine.bottom - hostBounds.top + 8),
      };

      setAnchor((current) =>
        current.x === next.x && current.y === next.y ? current : next
      );
      setPositioned(true);
    });
  }, []);

  useLayoutEffect(() => {
    place();
  }, [mode, place]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(place);
    observer.observe(host);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [place]);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (!bar || !content) return;

    const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8;
    const previousWidth =
      lastWidthRef.current || Math.ceil(bar.getBoundingClientRect().width);

    if (
      previousModeRef.current !== mode &&
      Math.abs(nextWidth - previousWidth) > 1
    ) {
      widthAnimationRef.current?.cancel();
      const animation = bar.animate(
        [{ width: `${previousWidth}px` }, { width: `${nextWidth}px` }],
        {
          duration: 320,
          easing: "cubic-bezier(0.23,1,0.32,1)",
        }
      );
      widthAnimationRef.current = animation;
      animation.onfinish = () => {
        lastWidthRef.current = nextWidth;
        widthAnimationRef.current = null;
      };
    } else {
      lastWidthRef.current = nextWidth;
    }

    previousModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (widthAnimationRef.current?.playState === "running") return;
      lastWidthRef.current =
        Math.ceil(content.getBoundingClientRect().width) + 8;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      widthAnimationRef.current?.cancel();
    };
  }, []);

  const run = (nextAction: string) => {
    setAction(nextAction);
    setExpanded(false);
    setMode("thinking");
    onAction?.(nextAction);
  };

  const keepEdit = () => {
    setCurrentOriginal(activeRewrite);
    setExpanded(false);
    setPrompt("");
    setTypingWidth(null);
    setMode("idle");
  };

  const reset = () => {
    setExpanded(false);
    setPrompt("");
    setTypingWidth(null);
    setAction("Improve");
    setMode("idle");
  };

  const busy = mode === "thinking" || mode === "streaming";
  const visible = shown && positioned;
  const hasPrompt = prompt.trim().length > 0;
  const busyLabelMap: Record<string, string> = {};
  for (const item of [...actions.primary, ...actions.more]) {
    if (item.action && item.busyLabel) busyLabelMap[item.action] = item.busyLabel;
  }
  const busyLabel = busyLabelMap[action] ?? "Editing";

  return (
    <div className={fill ? "w-full" : "w-full max-w-[460px]"}>
      <div ref={hostRef} className="relative select-none pb-12">
        <p className="text-[13px] leading-relaxed text-ink">
          {passage.lead}
          <span
            ref={selectionRef}
            className="box-decoration-clone rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-ink dark:bg-accent-tint"
          >
            {mode === "idle" || mode === "thinking" ? (
              currentOriginal
            ) : mode === "streaming" ? (
              <StreamText
                text={activeRewrite}
                onProgress={place}
                onDone={() => setMode("result")}
              />
            ) : (
              activeRewrite
            )}
          </span>
        </p>

        <div
          className="absolute top-0 left-0 z-10"
          style={{
            transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0) translateX(-50%)`,
            transition:
              "transform 320ms cubic-bezier(0.77,0,0.175,1), opacity 180ms ease-out",
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? "auto" : "none",
            willChange: "transform",
          }}
        >
          <div
            ref={barRef}
            className="flex h-9 w-fit max-w-[calc(100vw-48px)] items-center justify-center gap-0.5 overflow-hidden rounded-full bg-surface p-1 font-sans font-normal text-ink shadow-overlay"
            style={{
              width:
                mode === "idle" && hasPrompt && typingWidth
                  ? typingWidth
                  : undefined,
              ...(visible
                ? {
                    animation:
                      "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both",
                  }
                : {}),
            }}
          >
            <div
              ref={contentRef}
              className="flex w-fit shrink-0 items-center justify-center gap-0.5"
              style={{
                width:
                  mode === "idle" && hasPrompt && typingWidth
                    ? typingWidth - 8
                    : undefined,
              }}
            >
              {busy && (
                <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-normal text-ink-2">
                  <span
                    className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
                    style={{ animation: "spin 700ms linear infinite" }}
                  />
                  {mode === "thinking" ? (
                    <Shimmer className="text-[12.5px] font-normal">
                      {busyLabel}…
                    </Shimmer>
                  ) : (
                    <span>{busyLabel}…</span>
                  )}
                </span>
              )}

              {mode === "result" && (
                <>
                  <button
                    type="button"
                    onClick={keepEdit}
                    className={primary}
                  >
                    {icons.check}
                    {copy.keep}
                  </button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="xs"
                    className="shrink-0"
                    onClick={reset}
                  >
                    {icons.close}
                    {copy.discard}
                  </Button>
                  <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                  <button
                    type="button"
                    aria-label="Try again"
                    onClick={() => run(action)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink-2 active:scale-[0.96]"
                  >
                    {icons.retry}
                  </button>
                </>
              )}

              {mode === "idle" && (
                <>
                  <div
                    className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: expanded
                        ? 0
                        : hasPrompt && typingWidth
                          ? typingWidth - 40
                          : 145,
                      opacity: expanded ? 0 : 1,
                      transform: expanded ? "translateX(-8px)" : "translateX(0)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    <form
                      className="flex h-7 shrink-0 items-center transition-[width] duration-400"
                      style={{
                        width:
                          hasPrompt && typingWidth ? typingWidth - 40 : 145,
                        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                      }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(prompt.trim() || "Improve");
                      }}
                    >
                      <input
                        value={prompt}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (!prompt.trim() && next.trim()) {
                            setTypingWidth(
                              Math.ceil(
                                barRef.current?.getBoundingClientRect().width ?? 0
                              )
                            );
                          } else if (!next.trim()) {
                            setTypingWidth(null);
                          }
                          setPrompt(next);
                        }}
                        aria-label={copy.placeholder}
                        placeholder={copy.placeholder}
                        className="h-7 w-full bg-transparent pr-2.5 pl-3 text-[12.5px] text-ink placeholder:text-ink-3"
                      />
                    </form>
                  </div>

                  <div
                    className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: hasPrompt ? 0 : expanded ? 462 : 224,
                      opacity: hasPrompt ? 0 : 1,
                      transform: hasPrompt ? "translateX(-8px)" : "translateX(0)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    {!expanded && (
                      <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" />
                    )}
                    {actions.primary.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="quiet"
                        size="xs"
                        className="shrink-0"
                        onClick={item.action ? () => run(item.action!) : undefined}
                      >
                        {item.icon}
                        {item.id}
                      </Button>
                    ))}

                    <div
                      className="flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,margin] duration-400"
                      style={{
                        maxWidth: expanded ? 262 : 0,
                        opacity: expanded ? 1 : 0,
                        marginLeft: expanded ? 2 : 0,
                        transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                      }}
                    >
                      {actions.more.map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          variant="quiet"
                          size="xs"
                          className="shrink-0"
                          onClick={item.action ? () => run(item.action!) : undefined}
                        >
                          {item.icon}
                          {item.id}
                        </Button>
                      ))}
                    </div>

                    <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                    <button
                      type="button"
                      aria-label={expanded ? "Show fewer actions" : "Show more actions"}
                      aria-expanded={expanded}
                      onClick={() => setExpanded((value) => !value)}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-200 hover:bg-hover active:scale-[0.96]"
                    >
                      <span
                        className="flex transition-transform duration-400"
                        style={{
                          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                          transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                        }}
                      >
                        {icons.chevron}
                      </span>
                    </button>
                  </div>

                  <div
                    className="flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400"
                    style={{
                      maxWidth: hasPrompt ? 30 : 0,
                      opacity: hasPrompt ? 1 : 0,
                      transform: hasPrompt ? "scale(1)" : "scale(0.88)",
                      transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)",
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Send edit instruction"
                      onClick={() => run(prompt.trim())}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-[opacity,transform] duration-200 active:scale-[0.94]"
                    >
                      {icons.send}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

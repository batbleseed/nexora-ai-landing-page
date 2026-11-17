"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Code2, Download, Eye, Maximize2, Minimize2 } from "lucide-react";

export const WorkspaceStageContext = createContext<{
  container: HTMLElement | null;
  hasFloatingControls: boolean;
}>({
  container: null,
  hasFloatingControls: false,
});

/* ─────────────────────────────────────────────────────────
 * CODE BLOCK
 * A clean line-numbered code panel with syntax coloring,
 * wrapping lines, and one-click copy.
 * ───────────────────────────────────────────────────────── */

const FILE = "churn.ts";

const CODE_LINES = [
  "export async function churnBatch() {",
  '  const flavor = await getFlavor("pistachio");',
  "  const base = await dairy.fetch({ flavor });",
  '  await freezer.store(base, { temp: "-16C" });',
  "  if (!base.approved) return null;",
  "  return base.gallons;",
  "}",
];

export type CodeBlockLabels = { copy: string; copied: string };

/* light syntax coloring — keywords/imports/conditionals, functions, strings & numbers */
const KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "default",
  "async",
  "function",
  "const",
  "let",
  "var",
  "await",
  "return",
  "if",
  "else",
  "for",
  "while",
  "new",
  "throw",
  "try",
  "catch",
  "null",
  "true",
  "false",
  "undefined",
]);
const TOKEN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;

function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    const t = m[0];
    if (idx > last) nodes.push(<span key={k++}>{text.slice(last, idx)}</span>);
    let color: string;
    let weight: number | undefined;
    if (/^["'`]/.test(t) || /^\d/.test(t)) color = "var(--orange)";
    else if (KEYWORDS.has(t)) color = "var(--accent-ink)";
    else {
      color = "var(--ink)";
      weight = 500;
    }
    nodes.push(
      <span key={k++} style={{ color, fontWeight: weight }}>
        {t}
      </span>
    );
    last = idx + t.length;
  }
  if (last < text.length) nodes.push(<span key={k++}>{text.slice(last)}</span>);
  return nodes;
}

function FileIcon() {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-ink-3"
    >
      <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

const DEFAULT_LABELS: CodeBlockLabels = { copy: "Copy", copied: "Copied" };

export type CodeBlockProps = {
  /** The lines shown in the Code view. */
  lines?: string[];
  /** Raw text placed on the clipboard by Copy. Defaults to `lines` joined. */
  code?: string;
  /** Label shown in the header. */
  filename?: string;
  /** Prominent copy strings. */
  labels?: Partial<CodeBlockLabels>;
  /** Called with the copied text after a successful copy. */
  onCopy?: (text: string) => void;
  /** Expand to parent width */
  fill?: boolean;
  /** True while this specific block is actively streaming */
  isStreaming?: boolean;
  /** Whether the fullscreen preview toggle is shown */
  allowFullscreen?: boolean;
};

function isHtmlSnippet(filename: string, raw: string): boolean {
  if (/\.(html?|xhtml)$/i.test(filename)) return true;
  const trimmed = raw.trim();
  return /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function buildHtmlSrcDoc(raw: string): string {
  const trimmed = raw.trim();
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return raw;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>body{margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;}</style>
</head>
<body>${raw}</body>
</html>`;
}

function extractHtmlTitle(raw: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  if (!match) return null;
  const cleaned = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export default function CodeBlock({
  lines = CODE_LINES,
  code,
  filename = FILE,
  labels,
  onCopy,
  fill = false,
  isStreaming = false,
  allowFullscreen = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [manualViewMode, setManualViewMode] = useState<"preview" | "code" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceStage = useContext(WorkspaceStageContext);
  const text = { ...DEFAULT_LABELS, ...labels };
  const raw = code ?? lines.join("\n");

  const canPreviewHtml = useMemo(() => isHtmlSnippet(filename, raw), [filename, raw]);
  const viewMode: "preview" | "code" = canPreviewHtml
    ? (manualViewMode ?? (isStreaming ? "code" : "preview"))
    : "code";

  const srcDoc = useMemo(
    () => (canPreviewHtml && viewMode === "preview" ? buildHtmlSrcDoc(raw) : ""),
    [canPreviewHtml, viewMode, raw]
  );

  const htmlTitle = useMemo(
    () => (canPreviewHtml ? extractHtmlTitle(raw) : null),
    [canPreviewHtml, raw]
  );

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isFullscreen]);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      onCopy?.(raw);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw, onCopy]);

  const downloadFile = useCallback(() => {
    const blob = new Blob([raw], {
      type: canPreviewHtml ? "text/html;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || (canPreviewHtml ? "index.html" : "snippet.txt");
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [raw, canPreviewHtml, filename]);

  return (
    <div
      className={`w-full overflow-hidden rounded-card bg-surface shadow-card ${
        fill ? "" : "max-w-105"
      }`}
    >
      <div className="flex h-11 items-center gap-2 border-b border-line px-4 text-[12.5px]">
        <span className="inline-flex min-w-0 items-center gap-[7px]">
          <FileIcon />
          <span className="truncate font-mono leading-none text-ink">{filename}</span>
        </span>

        <div className="-mr-1 ml-auto flex items-center gap-1">
          {canPreviewHtml && (
            <>
              <button
                type="button"
                aria-label="Download HTML file"
                title="Download HTML"
                onClick={downloadFile}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                <Download className="size-3.5" />
              </button>

              <button
                type="button"
                aria-label={viewMode === "preview" ? "View HTML code" : "Show HTML preview"}
                title={viewMode === "preview" ? "View code" : "Show preview"}
                onClick={() =>
                  setManualViewMode(viewMode === "preview" ? "code" : "preview")
                }
                className="flex h-7 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                {viewMode === "preview" ? (
                  <>
                    <Code2 className="size-3.5" />
                    <span>Code</span>
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    <span>Preview</span>
                  </>
                )}
              </button>

              {allowFullscreen && (
                <button
                  type="button"
                  aria-label="Fullscreen preview"
                  title="Fullscreen"
                  onClick={() => {
                    setManualViewMode("preview");
                    setIsFullscreen(true);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              )}
            </>
          )}

          <button
            type="button"
            aria-label="Copy code"
            onClick={copy}
            className={`flex h-7 items-center gap-1 rounded-[6px] px-2 text-[12px]
              font-medium transition-colors duration-100 hover:bg-hover
              ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`}
          >
            {copied ? (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? text.copied : text.copy}
          </button>
        </div>
      </div>

      {viewMode === "preview" ? (
        <div className="w-full overflow-hidden bg-white">
          <iframe
            title={filename || "HTML Preview"}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="block h-[380px] w-full border-0 bg-white sm:h-[420px]"
          />
        </div>
      ) : (
        <div className="px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-ink-2">
          <div className="flex flex-col">
            {lines.map((line, i) => (
              <code key={i} className="block break-words whitespace-pre-wrap">
                {line === "" ? "\u00A0" : highlight(line)}
              </code>
            ))}
          </div>
        </div>
      )}

      {allowFullscreen &&
        isFullscreen &&
        canPreviewHtml &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={htmlTitle || filename || "HTML Preview"}
            className={`${
              workspaceStage.container
                ? "absolute inset-0 z-20"
                : "fixed inset-0 z-[100]"
            } flex flex-col bg-page text-ink`}
          >
            {/* Fullscreen Top Toolbar */}
            <div
              className={`flex h-13 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:h-14 sm:px-5 ${
                workspaceStage.container && workspaceStage.hasFloatingControls
                  ? "pl-40 sm:pl-44"
                  : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileIcon />
                <span className="truncate text-[14px] font-semibold text-ink">
                  {htmlTitle || filename || "HTML Preview"}
                </span>
                {htmlTitle && filename && (
                  <span className="hidden shrink-0 rounded-[6px] border border-line bg-inset px-2 py-0.5 font-mono text-[11px] text-ink-3 sm:inline-flex">
                    {filename}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div
                  role="tablist"
                  aria-label="Preview mode"
                  className="inline-flex items-center rounded-[10px] border border-line bg-inset p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "code"}
                    onClick={() => setManualViewMode("code")}
                    className={`flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium transition-colors ${
                      viewMode === "code"
                        ? "bg-surface text-ink shadow-xs"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Code2 className="size-3.5" />
                    <span>Code</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === "preview"}
                    onClick={() => setManualViewMode("preview")}
                    className={`flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-medium transition-colors ${
                      viewMode === "preview"
                        ? "bg-surface text-ink shadow-xs"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <Eye className="size-3.5" />
                    <span>Preview</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={downloadFile}
                  aria-label="Download HTML file"
                  title="Download HTML"
                  className="flex h-8 items-center gap-1.5 rounded-[9px] border border-line-strong/80 bg-surface px-2.5 text-[12px] font-medium text-ink shadow-xs transition-colors hover:bg-hover"
                >
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </button>

                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy code"
                  title="Copy code"
                  className={`flex h-8 items-center gap-1.5 rounded-[9px] border border-line-strong/80 bg-surface px-2.5 text-[12px] font-medium shadow-xs transition-colors hover:bg-hover ${
                    copied ? "text-green" : "text-ink"
                  }`}
                >
                  {copied ? text.copied : text.copy}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  aria-label="Exit fullscreen"
                  title="Exit fullscreen (Esc)"
                  className="flex size-8 items-center justify-center rounded-[9px] border border-line-strong/80 bg-surface text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
                >
                  <Minimize2 className="size-4" />
                </button>
              </div>
            </div>

            {/* Fullscreen Content Stage */}
            <div className="min-h-0 flex-1 overflow-hidden bg-page">
              {viewMode === "preview" ? (
                <iframe
                  title={htmlTitle || filename || "HTML Preview"}
                  srcDoc={srcDoc}
                  sandbox="allow-scripts"
                  className="block h-full w-full border-0 bg-white"
                />
              ) : (
                <div className="h-full w-full overflow-auto bg-surface px-5 py-4 font-mono text-[13px] leading-[1.7] text-ink-2 sm:px-8 sm:py-6">
                  <div className="mx-auto flex max-w-5xl flex-col">
                    {lines.map((line, i) => (
                      <code key={i} className="block break-words whitespace-pre-wrap">
                        {line === "" ? "\u00A0" : highlight(line)}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>,
          workspaceStage.container ?? document.body
        )}
    </div>
  );
}

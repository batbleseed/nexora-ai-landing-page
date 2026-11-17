import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Mic,
  Moon,
  Paperclip,
  Pin,
  ShieldCheck,
  Sun,
  WifiOff,
} from "lucide-react";
import CodeBlock from "./CodeBlock";
import MarkdownRenderer from "./MarkdownRenderer";
import { PromptInput } from "./PromptInput";
import ThinkingState from "./ThinkingState";
import { NexoraLogo } from "./icons/NexoraLogo";
import type { SidebarAccount } from "./SidebarNav";
import type { SettingsTab } from "./SettingsView";

export interface LandingPageProps {
  isDark: boolean;
  onToggleTheme: () => void;
  isOnline: boolean;
  currentUser: SidebarAccount | null;
  threadsCount: number;
  composerModels: string[];
  selectedComposerModel: string;
  onSelectedComposerModelChange: (model: string) => void;
  selectedEffort: string;
  onSelectedEffortChange: (effort: string) => void;
  onOpenWorkspace?: () => void;
  onSubmitPrompt?: (
    value: string,
    meta: { model: string; effort: string; attachments: File[] }
  ) => void;
  onOpenAuth?: () => void;
  onOpenSettings: (tab?: SettingsTab) => void;
}

const WORKSPACE_URL = "https://nexora-ai-chat.up.railway.app/";

type ShowcaseKey = "preview" | "reasoning" | "local";

const HERO_PREVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Latency Budget Card</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f5f6f8;
    color: #181a1f;
    padding: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: #ffffff;
    border: 1px solid #e6e8ec;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
  }
  .title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
  .meta { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
  .rows { display: flex; flex-direction: column; gap: 12px; }
  .row-top {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    margin-bottom: 5px;
    color: #374151;
    font-variant-numeric: tabular-nums;
  }
  .track {
    height: 7px;
    background: #eef0f4;
    border-radius: 999px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    border-radius: 999px;
    background: #181a1f;
    transition: width 260ms ease;
  }
  .bar.accent { background: #2563eb; }
  .actions {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #eef0f4;
    display: flex;
    gap: 8px;
  }
  button {
    border: 1px solid #e2e5ea;
    background: #ffffff;
    color: #181a1f;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 7px;
    cursor: pointer;
  }
  button.active {
    background: #181a1f;
    color: #ffffff;
    border-color: #181a1f;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <span class="title">Response Hydration</span>
      <span class="meta" id="mode-label">Local Cache</span>
    </div>
    <div class="rows">
      <div>
        <div class="row-top"><span>UI Shell Paint</span><span id="v1">14 ms</span></div>
        <div class="track"><div class="bar accent" id="b1" style="width: 18%"></div></div>
      </div>
      <div>
        <div class="row-top"><span>IndexedDB Thread Read</span><span id="v2">28 ms</span></div>
        <div class="track"><div class="bar" id="b2" style="width: 34%"></div></div>
      </div>
      <div>
        <div class="row-top"><span>First Token Stream</span><span id="v3">140 ms</span></div>
        <div class="track"><div class="bar" id="b3" style="width: 62%"></div></div>
      </div>
    </div>
    <div class="actions">
      <button class="active" onclick="setMode('cache', this)">Local Cache</button>
      <button onclick="setMode('webgpu', this)">WebGPU Nano</button>
    </div>
  </div>
  <script>
    function setMode(mode, btn) {
      document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (mode === 'webgpu') {
        document.getElementById('mode-label').textContent = 'WebGPU · 300 MB';
        document.getElementById('v1').textContent = '12 ms';
        document.getElementById('b1').style.width = '14%';
        document.getElementById('v2').textContent = '24 ms';
        document.getElementById('b2').style.width = '28%';
        document.getElementById('v3').textContent = '95 ms';
        document.getElementById('b3').style.width = '46%';
      } else {
        document.getElementById('mode-label').textContent = 'Local Cache';
        document.getElementById('v1').textContent = '14 ms';
        document.getElementById('b1').style.width = '18%';
        document.getElementById('v2').textContent = '28 ms';
        document.getElementById('b2').style.width = '34%';
        document.getElementById('v3').textContent = '140 ms';
        document.getElementById('b3').style.width = '62%';
      }
    }
  </script>
</body>
</html>`;

const BENTO_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Interactive Effort Estimator</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f6f7f9;
    color: #181a1f;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .panel {
    width: 100%;
    max-width: 480px;
    background: #fff;
    border: 1px solid #e6e8ec;
    border-radius: 12px;
    padding: 18px 20px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .label { font-size: 13px; font-weight: 600; }
  .value { font-size: 12.5px; color: #2563eb; font-weight: 600; font-variant-numeric: tabular-nums; }
  input[type=range] {
    width: 100%;
    accent-color: #181a1f;
    margin-bottom: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    border-top: 1px solid #eef0f4;
    padding-top: 14px;
  }
  .cell-k { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
  .cell-v { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <div class="panel">
    <div class="top">
      <span class="label">Context Budget Simulator</span>
      <span class="value" id="tok">12,000 tokens</span>
    </div>
    <input id="rng" type="range" min="2000" max="64000" step="2000" value="12000" />
    <div class="grid">
      <div>
        <div class="cell-k">Turns Kept</div>
        <div class="cell-v" id="turns">16</div>
      </div>
      <div>
        <div class="cell-k">Reasoning Depth</div>
        <div class="cell-v" id="depth">Medium</div>
      </div>
      <div>
        <div class="cell-k">Cache Footprint</div>
        <div class="cell-v" id="size">48 KB</div>
      </div>
    </div>
  </div>
  <script>
    const rng = document.getElementById('rng');
    rng.addEventListener('input', () => {
      const v = Number(rng.value);
      document.getElementById('tok').textContent = v.toLocaleString() + ' tokens';
      document.getElementById('turns').textContent = String(Math.round(v / 750));
      document.getElementById('depth').textContent = v > 36000 ? 'Max Effort' : v > 10000 ? 'Medium' : 'Low';
      document.getElementById('size').textContent = Math.round(v * 0.004) + ' KB';
    });
  </script>
</body>
</html>`;

const STREAM_CODE_LINES = [
  "export async function resumeStream(jobId: string) {",
  "  const res = await fetch(`/api/chat/jobs/${jobId}/stream`);",
  "  if (!res.body) return pollSnapshot(jobId);",
  "  const reader = res.body.getReader();",
  "  for await (const frame of parseSSE(reader)) {",
  "    persistThreadDelta(frame.threadId, frame.text);",
  "  }",
  "}",
];

type ProviderFilter = "all" | "cloud" | "local";

interface ProviderRow {
  name: string;
  category: "cloud" | "local";
  execution: string;
  capabilities: string;
  storage: string;
}

const PROVIDER_ROWS: ProviderRow[] = [
  {
    name: "Nexora Assistant",
    category: "cloud",
    execution: "Built-in Cloud",
    capabilities: "Streaming · Vision · Web Search",
    storage: "Zero key setup required",
  },
  {
    name: "Google Gemini",
    category: "cloud",
    execution: "BYOK Endpoint",
    capabilities: "Reasoning · Multimodal · Long Context",
    storage: "Browser localStorage only",
  },
  {
    name: "Anthropic Claude",
    category: "cloud",
    execution: "BYOK Endpoint",
    capabilities: "Extended Thinking · Code · Prose",
    storage: "Browser localStorage only",
  },
  {
    name: "OpenAI & o-Series",
    category: "cloud",
    execution: "BYOK Endpoint",
    capabilities: "Reasoning Effort · Vision · Structured Code",
    storage: "Browser localStorage only",
  },
  {
    name: "OpenRouter & Groq",
    category: "cloud",
    execution: "BYOK Endpoint",
    capabilities: "Multi-provider routing · Low latency",
    storage: "Browser localStorage only",
  },
  {
    name: "Nexora Nano (Local)",
    category: "local",
    execution: "On-Device WebGPU",
    capabilities: "SmolLM2 360M · Offline Inference",
    storage: "~300 MB browser cache",
  },
];

const FAQ_ITEMS = [
  {
    question: "Where are my BYOK API keys stored?",
    answer:
      "Your Gemini, OpenAI, Claude, OpenRouter, Groq, or custom base URL keys stay exclusively in your browser's localStorage and are passed per request only when you invoke that model. Keys are never stored in cloud account profiles.",
  },
  {
    question: "How does the 300 MB offline WebGPU model work?",
    answer:
      "Enable Local WebGPU in Settings → Beta to download SmolLM2 360M into your browser cache via WebLLM. Once cached, you can select Nexora Nano (Local) in the composer and run text inference completely offline with zero network calls.",
  },
  {
    question: "What happens if I reload the page mid-stream?",
    answer:
      "Cloud generation runs inside durable server jobs backed by SSE streams and pending job records. Reloading or reconnecting resumes the active stream automatically while local IndexedDB holds your partial transcript.",
  },
  {
    question: "Can I sync threads across devices or export them?",
    answer:
      "Yes. Sign in with Google (Firebase Auth) or Email to sync folders, pinned threads, and preferences across devices via Cloud Firestore. You can also export any conversation as a formatted PDF or export all workspace chats as JSON.",
  },
];

function EffortBars({ level }: { level: string }) {
  const isMediumOrHigh = level === "Medium" || level === "Max Effort";
  const isHigh = level === "Max Effort";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="8" width="2.5" height="4.5" rx="1" fill="currentColor" opacity={1} />
      <rect
        x="5.75"
        y="5"
        width="2.5"
        height="7.5"
        rx="1"
        fill="currentColor"
        opacity={isMediumOrHigh ? 1 : 0.3}
      />
      <rect
        x="10"
        y="2"
        width="2.5"
        height="10.5"
        rx="1"
        fill="currentColor"
        opacity={isHigh ? 1 : 0.3}
      />
    </svg>
  );
}

export default function LandingPage({
  isDark,
  onToggleTheme,
  isOnline,
  currentUser,
  composerModels,
  selectedComposerModel,
  onSelectedComposerModelChange,
  selectedEffort,
  onSelectedEffortChange,
  onOpenSettings,
}: LandingPageProps) {
  const [activeShowcase, setActiveShowcase] = useState<ShowcaseKey>("preview");
  const [bentoEffort, setBentoEffort] = useState<"Low" | "Medium" | "Max Effort">("Medium");
  const [bentoVoiceWave, setBentoVoiceWave] = useState(true);
  const [localViewMode, setLocalViewMode] = useState<"webgpu" | "offline">("webgpu");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifySuccess, setNotifySuccess] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 16);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const visibleProviders = PROVIDER_ROWS.filter((row) =>
    providerFilter === "all" ? true : row.category === providerFilter
  );

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = notifyEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setNotifyError("Enter a valid email address.");
      setNotifySuccess(null);
      return;
    }
    setNotifyError(null);
    setNotifySuccess(`Release notes will be sent to ${trimmed}.`);
    setNotifyEmail("");
  };

  const showcaseMeta: Record<
    ShowcaseKey,
    { title: string; userPrompt: string; model: string; timestamp: string }
  > = {
    preview: {
      title: "Interactive HTML Preview",
      userPrompt:
        "Build a compact hydration latency card comparing local cache vs. WebGPU.",
      model: "Nexora Assistant",
      timestamp: "10:14",
    },
    reasoning: {
      title: "Durable Stream Recovery",
      userPrompt:
        "How should Nexora reconnect an active SSE generation after a page reload?",
      model: "Claude Sonnet 4",
      timestamp: "10:18",
    },
    local: {
      title: "WebGPU Offline Session",
      userPrompt:
        "Summarize the differences between local IndexedDB caching and cloud sync.",
      model: "Nexora Nano (Local)",
      timestamp: "10:22",
    },
  };

  const activeDemo = showcaseMeta[activeShowcase];

  return (
    <div id="top" className="min-h-dvh w-full bg-canvas text-ink">
      {/* Floating Bubble Top Bar (invisible & slightly larger at top, normal bubble on scroll) */}
      <header className="sticky top-3 z-30 px-4 sm:px-8">
        <div
          className={`mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 rounded-full border transition-all duration-200 ease-out ${
            isScrolled
              ? "border-line bg-surface/90 px-4 shadow-card backdrop-blur-md sm:px-5"
              : "border-transparent bg-transparent px-1 shadow-none"
          }`}
        >
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap font-display font-semibold tracking-tight text-ink transition-all duration-200 ${
              isScrolled ? "text-[16px]" : "text-[18px]"
            }`}
          >
            <NexoraLogo size={isScrolled ? 20 : 22} className="shrink-0 text-ink transition-all duration-200" />
            <span>Nexora</span>
          </a>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav
            aria-label="Primary navigation"
            className={`hidden items-center gap-7 font-medium text-ink-2 transition-all duration-200 md:flex ${
              isScrolled ? "text-[13.5px]" : "text-[15px]"
            }`}
          >
            <a
              href="#workspace-preview"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-ink"
            >
              <span className="animated-underline">Workspace</span>
            </a>
            <a
              href="#capabilities"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-ink"
            >
              <span className="animated-underline">Capabilities</span>
            </a>
            <a
              href="#models"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-ink"
            >
              <span className="animated-underline">Models</span>
            </a>
            <a
              href="#architecture"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-ink"
            >
              <span className="animated-underline">Architecture</span>
            </a>
            <a
              href="#faq"
              className="whitespace-nowrap shrink-0 transition-colors hover:text-ink"
            >
              <span className="animated-underline">FAQ</span>
            </a>
          </nav>

          {/* Zone 3: Theme Switch & Primary Action */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-page font-medium text-ink-2 shadow-xs transition-all duration-200 hover:bg-hover hover:text-ink ${
                isScrolled ? "h-9 px-3.5 text-[12.5px]" : "h-10 px-4 text-[13.5px]"
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="size-3.5" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5" aria-hidden="true" />
                  <span>Dark</span>
                </>
              )}
            </button>
            <a
              href={WORKSPACE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ink font-medium text-surface shadow-btn transition-all duration-200 hover:opacity-90 active:scale-[0.98] ${
                isScrolled ? "h-9 px-4 text-[13px]" : "h-10 px-4.5 text-[14px]"
              }`}
            >
              <span>Open Workspace</span>
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Workspace Showcase */}
        <section className="px-4 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
          <div className="mx-auto max-w-6xl">
            {/* Nexora AI Bubble Header */}
            <div className="mb-6">
              <div className="flex w-full items-center gap-3.5 rounded-full border border-line bg-surface px-6 py-4 shadow-card sm:px-8">
                <NexoraLogo size={24} className="shrink-0 text-ink" />
                <span className="flex min-w-0 flex-col text-left">
                  <span className="font-display text-[16px] font-semibold leading-snug tracking-tight text-ink">
                    Presenting Nexora AI
                  </span>
                  <span className="text-[13.5px] leading-snug text-ink-2">
                    Cloud, BYOK, and local WebGPU models in one quiet workspace.
                  </span>
                </span>
              </div>
            </div>

            {/* Interactive Nexora Workspace Showcase Frame */}
            <div
              id="workspace-preview"
              className="rounded-[20px] border border-line bg-canvas p-2 shadow-overlay sm:p-2.5"
            >
              <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[15px] bg-canvas md:flex-row">
                {/* Mini Sidebar matching SidebarNav */}
                <aside
                  aria-label="Workspace preview navigation"
                  className="hidden w-[224px] shrink-0 flex-col justify-between bg-canvas px-2 py-3 md:flex"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-2">
                        <NexoraLogo size={18} className="text-ink" />
                        <span className="text-[14px] font-medium text-ink">Nexora</span>
                      </div>
                      {!isOnline && (
                        <WifiOff
                          className="size-3.5 text-ink-3"
                          aria-label="Offline cache active"
                        />
                      )}
                    </div>

                    <div className="flex h-8 w-full select-none items-center gap-2 rounded-[8px] px-2 text-left text-[13.5px] font-medium text-ink-2">
                      <span className="flex size-5 items-center justify-center text-ink-2">
                        +
                      </span>
                      <span>New chat</span>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between px-2 text-[12px] font-medium text-ink-3">
                        <span className="flex items-center gap-1.5">
                          <Pin className="size-3" aria-hidden="true" />
                          <span>Pinned demos</span>
                        </span>
                        <span className="tabular-nums text-[11px]">3</span>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        {(
                          [
                            { id: "preview", label: "Interactive HTML Preview" },
                            { id: "reasoning", label: "Durable Stream Recovery" },
                            { id: "local", label: "WebGPU Offline Session" },
                          ] as { id: ShowcaseKey; label: string }[]
                        ).map((item) => {
                          const active = activeShowcase === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setActiveShowcase(item.id)}
                              className={`flex h-8 w-full items-center rounded-[8px] px-2 text-left text-[13.5px] font-medium transition-colors ${
                                active
                                  ? "bg-hover-2 text-ink"
                                  : "text-ink-2 hover:bg-hover-2/70 hover:text-ink"
                              }`}
                            >
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center gap-1.5 px-2 text-[12px] font-medium text-ink-3">
                        <FolderOpen className="size-3" aria-hidden="true" />
                        <span>Folders</span>
                      </div>
                      <div className="px-2 py-1 text-[12.5px] text-ink-2">
                        Research · Engineering · Drafts
                      </div>
                    </div>
                  </div>

                  <div className="flex select-none items-center justify-between gap-2 rounded-[10px] px-2 py-1.5">
                    <div
                      aria-disabled="true"
                      className="flex min-w-0 flex-1 cursor-default items-center gap-2 text-left"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hover-2 text-[11px] font-semibold text-ink ring-1 ring-line">
                        {currentUser ? currentUser.initials : "G"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {currentUser ? currentUser.name : "Guest session"}
                        </span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {currentUser ? "Cloud synced" : "Local IndexedDB"}
                        </span>
                      </span>
                    </div>
                    <span className="rounded-[7px] px-2 py-1 text-[11.5px] font-medium text-ink-3">
                      Settings
                    </span>
                  </div>
                </aside>

                {/* Inset Main Window matching App.tsx */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-page shadow-xs">
                  {/* Showcase Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2 text-[13px]">
                      <span className="font-medium text-ink-2">Nexora</span>
                      <span aria-hidden="true" className="text-ink-3">
                        /
                      </span>
                      <span className="truncate font-medium text-ink">
                        {activeDemo.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 md:hidden">
                      {/* Mobile switcher for the 3 showcase demos */}
                      <div className="flex items-center gap-1 rounded-[8px] bg-inset p-0.5">
                        {(["preview", "reasoning", "local"] as ShowcaseKey[]).map(
                          (key) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setActiveShowcase(key)}
                              className={`rounded-[6px] px-2 py-1 text-[11.5px] font-medium capitalize transition-colors ${
                                activeShowcase === key
                                  ? "bg-surface text-ink shadow-xs"
                                  : "text-ink-2"
                              }`}
                            >
                              {key}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Showcase Conversation Viewport */}
                  <div className="flex flex-1 flex-col justify-between gap-6 p-4 sm:p-7">
                    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
                      {/* User Prompt */}
                      <div className="flex flex-col items-end">
                        <div className="max-w-[85%] rounded-full border border-line bg-surface px-5 py-2.5 text-[14px] leading-relaxed text-ink shadow-card">
                          {activeDemo.userPrompt}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] tabular-nums text-ink-3">
                          <span>You</span>
                          <span aria-hidden="true">·</span>
                          <span>{selectedEffort}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeDemo.timestamp}</span>
                        </div>
                      </div>

                      {/* Assistant Output */}
                      <div className="flex flex-col items-start">
                        <div
                          data-assistant-prose
                          className="flex w-full flex-col gap-3 border-b border-line pb-5"
                        >
                          {activeShowcase === "preview" && (
                            <>
                              <ThinkingState
                                fill
                                variant="Steps"
                                durationMs={900}
                                done="Completed with Nexora Assistant"
                                rows={[
                                  { primary: "Drafted responsive metric card layout" },
                                  { primary: "Wired local cache vs. WebGPU toggle" },
                                ]}
                              />
                              <MarkdownRenderer content="Here is an interactive HTML card comparing **Local Cache** hydration with **WebGPU Nano** execution. Toggle between `Preview` and `Code` directly inside the block." />
                              <CodeBlock
                                fill
                                filename="hydration-card.html"
                                code={HERO_PREVIEW_HTML}
                                allowFullscreen={false}
                              />
                            </>
                          )}

                          {activeShowcase === "reasoning" && (
                            <>
                              <ThinkingState
                                fill
                                variant="Reasoning"
                                durationMs={1800}
                                done="Thought"
                                reasoningText="To prevent lost tokens on reload, the server creates a persistent job ID before streaming SSE frames. The client stores the active jobId in localStorage, hydrates partial output immediately from IndexedDB on mount, and reconnects to /api/chat/jobs/:id/stream until status transitions to completed."
                              />
                              <MarkdownRenderer content="Use a **two-step durable job pattern**: persist the job identifier on creation, then stream SSE frames into IndexedDB so reloads pick up seamlessly." />
                              <CodeBlock
                                fill
                                filename="stream-resume.ts"
                                lines={STREAM_CODE_LINES}
                              />
                            </>
                          )}

                          {activeShowcase === "local" && (
                            <>
                              <ThinkingState
                                fill
                                variant="Steps"
                                durationMs={600}
                                done="Completed with Nexora Nano (Local)"
                                rows={[
                                  { primary: "Loaded SmolLM2 360M from WebGPU cache" },
                                  { primary: "Completed inference on-device (0 network calls)" },
                                ]}
                              />
                              <MarkdownRenderer
                                content={`**IndexedDB local cache** hydrates your threads and folders in under 30 ms on startup—no network required.\n\n- **Offline mode**: Messages queue or run locally on **Nexora Nano (300 MB WebGPU)**.\n- **Cloud sync**: When signed in with Google or Email, changes mirror automatically to **Cloud Firestore** upon reconnect.`}
                              />
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
                                  <Globe className="size-3" aria-hidden="true" />
                                  Runtime
                                </span>
                                <span className="text-[11.5px] font-medium text-ink-2">
                                  WebGPU · SmolLM2 360M · Browser Cache Storage
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] tabular-nums text-ink-3">
                          <span>Nexora</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeDemo.model}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeDemo.timestamp}</span>
                        </div>
                      </div>
                    </div>

                    {/* Preview-only PromptInput inside the Showcase */}
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <PromptInput
                        readOnlyPreview
                        models={composerModels}
                        selectedModel={selectedComposerModel}
                        onSelectedModelChange={onSelectedComposerModelChange}
                        selectedEffort={selectedEffort}
                        onSelectedEffortChange={onSelectedEffortChange}
                        placeholder="Ask anything"
                        className="mx-auto"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 01: Core Capabilities — Asymmetric Bento Grid */}
        <section
          id="capabilities"
          className="border-t border-line bg-page px-4 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-[13px] font-medium text-ink-2">01. Capabilities</p>
              <h2 className="mt-2 font-display text-[clamp(1.65rem,3vw,2.35rem)] font-semibold tracking-tight text-ink">
                Every control earns its space.
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                No cluttered dashboards or decorative sidebars—each surface in
                Nexora serves a concrete part of your prompting, coding, and reading
                workflow.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Bento Card 1 (2 cols): Expandable Prompt Composer */}
              <div className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-6 shadow-card lg:col-span-2 sm:p-7">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-[18px] font-semibold text-ink">
                      Multimodal Prompt Composer
                    </h3>
                    <span className="text-[12px] font-medium text-ink-3 tabular-nums">
                      Spring-physics · Voice · Up to 6 images
                    </span>
                  </div>
                  <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2">
                    Starts as a compact single-line bar and expands smoothly on
                    focus. Switch models, cycle reasoning effort, paste or drop up to
                    six images, or dictate with live audio-level feedback.
                  </p>
                </div>

                {/* Interactive Composer Control Preview */}
                <div className="mt-6 rounded-[14px] border border-line bg-canvas p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 shadow-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                        <NexoraLogo size={14} />
                        <span>{selectedComposerModel}</span>
                      </span>
                      <span aria-hidden="true" className="text-ink-3">
                        ·
                      </span>
                      <div
                        role="group"
                        aria-label="Preview reasoning effort"
                        className="inline-flex items-center gap-1 rounded-[8px] bg-inset p-0.5"
                      >
                        {(["Low", "Medium", "Max Effort"] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setBentoEffort(level)}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                              bentoEffort === level
                                ? "bg-surface text-ink shadow-xs"
                                : "text-ink-2 hover:text-ink"
                            }`}
                          >
                            <EffortBars level={level} />
                            <span>{level}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBentoVoiceWave((v) => !v)}
                        aria-pressed={bentoVoiceWave}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-page px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:text-ink"
                      >
                        <Mic className="size-3.5" aria-hidden="true" />
                        <span>{bentoVoiceWave ? "Waveform On" : "Waveform Off"}</span>
                      </button>
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                        <Paperclip className="size-3.5" aria-hidden="true" />
                        <span>Drag &amp; drop</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-[12px] text-ink-2">
                    <span>
                      Active effort:{" "}
                      <strong className="font-medium text-ink">{bentoEffort}</strong>
                      {bentoEffort === "Max Effort"
                        ? " — deeper multi-step reasoning budget"
                        : bentoEffort === "Medium"
                          ? " — balanced speed and analysis"
                          : " — fast direct answers"}
                    </span>
                    <a
                      href={WORKSPACE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline"
                    >
                      <span>Open composer</span>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Bento Card 2 (1 col): Expandable Thinking Traces */}
              <div className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-6 shadow-card sm:p-7">
                <div>
                  <h3 className="font-display text-[18px] font-semibold text-ink">
                    Verifiable Thinking Traces
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                    Inspect live reasoning prose and wall-clock duration while a
                    model works, then collapse it cleanly once the answer settles.
                  </p>
                </div>

                <div className="mt-6 rounded-[12px] border border-line bg-page p-4">
                  <ThinkingState
                    fill
                    variant="Reasoning"
                    durationMs={1400}
                    done="Thought"
                    reasoningText="1. Checked IndexedDB cache for prior thread state. 2. Confirmed client-side BYOK header routing without server persistence. 3. Ready to stream markdown and inline HTML preview."
                  />
                </div>
              </div>

              {/* Bento Card 3 (1 col): On-Device 300 MB WebGPU */}
              <div className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-6 shadow-card sm:p-7">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-[18px] font-semibold text-ink">
                      On-Device WebGPU
                    </h3>
                    <Cpu className="size-4 text-ink-3" aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                    Download SmolLM2 360M directly into your browser cache (~300 MB)
                    for private, offline text inference with zero API cost.
                  </p>
                </div>

                <div className="mt-6">
                  <div className="inline-flex w-full rounded-[9px] bg-inset p-1">
                    <button
                      type="button"
                      onClick={() => setLocalViewMode("webgpu")}
                      className={`flex-1 rounded-[7px] py-1.5 text-[12px] font-medium transition-colors ${
                        localViewMode === "webgpu"
                          ? "bg-surface text-ink shadow-xs"
                          : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      WebGPU Engine
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalViewMode("offline")}
                      className={`flex-1 rounded-[7px] py-1.5 text-[12px] font-medium transition-colors ${
                        localViewMode === "offline"
                          ? "bg-surface text-ink shadow-xs"
                          : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      Offline PWA
                    </button>
                  </div>

                  <div className="mt-3 divide-y divide-line rounded-[10px] border border-line bg-page px-3.5 text-[12.5px]">
                    {localViewMode === "webgpu" ? (
                      <>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Model</span>
                          <span className="font-mono font-medium text-ink">
                            SmolLM2 360M
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Cache size</span>
                          <span className="font-mono tabular-nums text-ink">
                            ~300 MB
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Network calls</span>
                          <span className="font-mono tabular-nums text-ink">
                            0 after download
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Thread store</span>
                          <span className="font-mono font-medium text-ink">
                            IndexedDB + LS
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Installable</span>
                          <span className="font-mono text-ink">Desktop &amp; Mobile</span>
                        </div>
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-ink-2">Shell cache</span>
                          <span className="font-mono text-ink">Workbox SW</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Bento Card 4 (2 cols): Sandboxed HTML Preview & CodeBlock */}
              <div className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-6 shadow-card lg:col-span-2 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-[18px] font-semibold text-ink">
                      Inline Code &amp; Sandboxed HTML Previews
                    </h3>
                    <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2">
                      HTML artifacts render immediately inside a sandboxed preview
                      with one-click switching to syntax-highlighted code, fullscreen
                      inspection, or file download.
                    </p>
                  </div>
                  <span className="text-[12px] font-medium text-ink-3">
                    Preview · Code · Download
                  </span>
                </div>

                <div className="mt-5">
                  <CodeBlock
                    fill
                    filename="context-simulator.html"
                    code={BENTO_WIDGET_HTML}
                    allowFullscreen={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 02: Models & Provider Routing */}
        <section
          id="models"
          className="border-t border-line bg-canvas px-4 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-[13px] font-medium text-ink-2">
                  02. Model Routing
                </p>
                <h2 className="mt-2 font-display text-[clamp(1.65rem,3vw,2.35rem)] font-semibold tracking-tight text-ink">
                  Built-in, bring-your-own-key, or strictly on-device.
                </h2>
              </div>

              {/* Interactive Segmented Filter */}
              <div
                role="tablist"
                aria-label="Filter model providers"
                className="inline-flex items-center gap-1 rounded-[10px] border border-line bg-inset p-1"
              >
                {(
                  [
                    { id: "all", label: "All Providers" },
                    { id: "cloud", label: "Cloud & BYOK" },
                    { id: "local", label: "On-Device" },
                  ] as { id: ProviderFilter; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={providerFilter === tab.id}
                    onClick={() => setProviderFilter(tab.id)}
                    className={`whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      providerFilter === tab.id
                        ? "bg-surface text-ink shadow-xs"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-line bg-inset/60 text-[12px] font-medium text-ink-2">
                      <th className="px-5 py-3.5 font-medium">Provider / Model</th>
                      <th className="px-5 py-3.5 font-medium">Execution</th>
                      <th className="px-5 py-3.5 font-medium">Capabilities</th>
                      <th className="px-5 py-3.5 font-medium">Key &amp; Cache Policy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visibleProviders.map((row) => (
                      <tr
                        key={row.name}
                        className="transition-colors hover:bg-hover/60"
                      >
                        <td className="whitespace-nowrap px-5 py-4 font-medium text-ink">
                          {row.name}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-ink-2">
                          {row.execution}
                        </td>
                        <td className="px-5 py-4 text-ink-2">{row.capabilities}</td>
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-[12.5px] text-ink-2">
                          {row.storage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-page/70 px-5 py-3.5 text-[12.5px]">
                <div className="flex items-center gap-2 text-ink-2">
                  <KeyRound className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  <span>
                    Configure custom OpenAI-compatible endpoints or fetch provider
                    models anytime in Settings.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSettings("models")}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-ink hover:text-accent-ink"
                >
                  <span>Open Models Settings</span>
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 03: Workspace Architecture */}
        <section
          id="architecture"
          className="border-t border-line bg-page px-4 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-[13px] font-medium text-ink-2">
                03. Architecture
              </p>
              <h2 className="mt-2 font-display text-[clamp(1.65rem,3vw,2.35rem)] font-semibold tracking-tight text-ink">
                Designed to stay fast offline and resilient online.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-[16px] border border-line bg-surface shadow-card md:grid-cols-2">
              <div className="border-b border-line p-6 sm:p-8 md:border-r">
                <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-3 tabular-nums">
                  <span>01. Durable Job Streaming</span>
                  <Layers className="size-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">
                  Background SSE jobs survive page reloads
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Responses run as trackable server jobs rather than fragile single
                  fetch calls. Switching chats or refreshing mid-generation reconnects
                  to the active stream automatically.
                </p>
              </div>

              <div className="border-b border-line p-6 sm:p-8">
                <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-3 tabular-nums">
                  <span>02. Instant Local Hydration</span>
                  <HardDrive className="size-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">
                  Zero spinner gate on startup
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Threads, folders, drafts, and UI preferences hydrate synchronously
                  from localStorage and IndexedDB before background cloud sync
                  completes.
                </p>
              </div>

              <div className="border-b border-line p-6 sm:p-8 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-3 tabular-nums">
                  <span>03. Organization &amp; Exports</span>
                  <FileText className="size-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">
                  Folders, pinning, search, and PDF export
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Group threads into custom folders, pin active conversations, filter
                  history with instant command search, and export any thread as a
                  clean PDF or JSON backup.
                </p>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between text-[12.5px] font-medium text-ink-3 tabular-nums">
                  <span>04. Optional Cloud Sync</span>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                </div>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">
                  Guest mode first, Google &amp; Email sync when ready
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Start immediately as a guest without creating an account. Sign in
                  with Google (Firebase Auth) or Email whenever you want Firestore
                  mirroring across devices.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 04: FAQ & Conversion */}
        <section
          id="faq"
          className="border-t border-line bg-canvas px-4 py-16 sm:px-8 sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-12">
            {/* FAQ Column */}
            <div className="lg:col-span-7">
              <p className="text-[13px] font-medium text-ink-2">04. Questions</p>
              <h2 className="mt-2 font-display text-[clamp(1.65rem,3vw,2.2rem)] font-semibold tracking-tight text-ink">
                Frequently asked questions
              </h2>

              <div className="mt-7 divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div key={item.question}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-hover/60"
                      >
                        <span className="text-[14.5px] font-medium text-ink">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`size-4 shrink-0 text-ink-3 transition-transform duration-200 ${
                            isOpen ? "rotate-180 text-ink" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 text-[13.5px] leading-relaxed text-ink-2">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conversion Card */}
            <div className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-6 shadow-card lg:col-span-5 sm:p-8">
              <div>
                <div className="flex items-center gap-2.5">
                  <NexoraLogo size={20} className="text-ink" />
                  <span className="font-display text-[16px] font-semibold text-ink">
                    Start using Nexora
                  </span>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
                  Launch the workspace directly in your browser—no sign-up required.
                  Your chats persist locally and sync only if you choose to connect
                  an account.
                </p>

                <div className="mt-6 flex flex-col gap-2.5">
                  <a
                    href={WORKSPACE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13.5px] font-medium text-surface shadow-btn transition-opacity hover:opacity-90"
                  >
                    <span>Open Workspace</span>
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenSettings("models")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-page px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-hover"
                    >
                      <KeyRound className="size-3.5 text-ink-2" aria-hidden="true" />
                      <span>Add API Key</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSettings("beta")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-page px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-hover"
                    >
                      <Download className="size-3.5 text-ink-2" aria-hidden="true" />
                      <span>Local WebGPU</span>
                    </button>
                  </div>
                </div>
              </div>

              <form
                onSubmit={handleNotifySubmit}
                noValidate
                className="mt-8 border-t border-line pt-6"
              >
                <label
                  htmlFor="nexora-release-email"
                  className="block text-[12.5px] font-medium text-ink"
                >
                  Release notes &amp; changelog updates
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="nexora-release-email"
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => {
                      setNotifyEmail(e.target.value);
                      if (notifyError) setNotifyError(null);
                    }}
                    placeholder="you@company.com"
                    className="h-9 min-w-0 flex-1 rounded-control border border-line-strong bg-field px-3 text-[13px] text-ink shadow-xs placeholder:text-ink-3 focus:border-ink"
                  />
                  <button
                    type="submit"
                    className="h-9 shrink-0 whitespace-nowrap rounded-control border border-line-strong bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-btn transition-colors hover:bg-hover"
                  >
                    Notify me
                  </button>
                </div>
                {notifyError && (
                  <p role="alert" className="mt-2 text-[12px] text-red">
                    {notifyError}
                  </p>
                )}
                {notifySuccess && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-green">
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{notifySuccess}</span>
                  </p>
                )}
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-line bg-page px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <NexoraLogo size={18} className="text-ink" />
            <span className="font-display text-[14px] font-semibold text-ink">
              Nexora
            </span>
            <span aria-hidden="true" className="text-ink-3">
              ·
            </span>
            <span className="text-[12.5px] text-ink-3">
              Local-first AI workspace
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-[13px] text-ink-2">
            <a href="#workspace-preview" className="hover:text-ink">
              Workspace
            </a>
            <a href="#capabilities" className="hover:text-ink">
              Capabilities
            </a>
            <a href="#models" className="hover:text-ink">
              Models
            </a>
            <a href="#architecture" className="hover:text-ink">
              Architecture
            </a>
            <a
              href={WORKSPACE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink hover:underline"
            >
              Launch App
            </a>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              {isDark ? (
                <>
                  <Sun className="size-3.5" aria-hidden="true" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="size-3.5" aria-hidden="true" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

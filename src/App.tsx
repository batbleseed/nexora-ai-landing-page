import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Globe, Square, Volume2, WifiOff } from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import CodeBlock, { WorkspaceStageContext } from "./components/CodeBlock";
import InlineHtmlPreview from "./components/InlineHtmlPreview";
import MarkdownRenderer from "./components/MarkdownRenderer";
import {
  IconMagnifyingGlass,
  IconSidebarLeftArrow,
} from "./components/icons/CentralIcons";
import { NexoraLogo } from "./components/icons/NexoraLogo";
import ChatTitleMenu from "./components/ChatTitleMenu";
import ImageLightboxGallery, {
  type LightboxImageItem,
} from "./components/ImageLightboxGallery";
import LandingPage from "./components/LandingPage";
import LoginModal from "./components/LoginModal";
import { exportThreadToPdf } from "./lib/exportThreadPdf";
import { PromptInput } from "./components/PromptInput";
import { PWAInstallButton } from "./components/PWAInstallButton";
import SearchList from "./components/SearchList";
import SettingsView, {
  type LocalModelStatus,
  type SettingsTab,
} from "./components/SettingsView";
import SidebarNav, { type SidebarAccount } from "./components/SidebarNav";
import ThinkingState from "./components/ThinkingState";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import {
  auth,
  deleteAllFirebaseThreads,
  deleteFirebaseFolder,
  deleteFirebaseThread,
  loadFirebaseFolders,
  loadFirebasePreferences,
  loadFirebaseThreads,
  makeInitials,
  saveFirebasePreferences,
  signInWithGooglePopup,
  signOutFirebase,
  syncFolderToFirestore,
  syncThreadToFirestore,
  upsertFirebaseUserProfile,
} from "./lib/firebase";
import {
  getOrCreateGuestWorkspaceId,
  loadAuthSession,
  loadByokConfig,
  loadLocalFoldersSync,
  loadLocalSettingsSync,
  loadLocalThreadsSync,
  loadOfflineFolders,
  loadOfflineSettings,
  loadOfflineThreads,
  loadPendingJobs,
  loadUiSession,
  resolveByokForModel,
  saveAuthSession,
  saveByokConfig,
  saveLocalFoldersSync,
  saveLocalSettingsSync,
  saveLocalThreadsSync,
  saveOfflineFolders,
  saveOfflineSettings,
  saveOfflineThreads,
  savePendingJobs,
  saveUiSession,
  type AuthSessionSnapshot,
  type ByokConfig,
  type PendingJobRecord,
  type UiSessionSnapshot,
  type WorkspaceSettingsSnapshot,
} from "./lib/offlineStore";
import {
  buildAdaptivePrompts,
  runOfflineLocalAssistant,
  type ChatFolder,
  type SourceLink,
  type WorkspaceMessage,
  type WorkspaceThread,
} from "./data/workspaceThreads";
import {
  clearLocalModelCache,
  ensureLocalEngineLoaded,
  isAnyLocalModelCached,
  streamLocalWebGpuChat,
} from "./lib/localWebGpuEngine";

const DEFAULT_MODELS = ["Nexora Assistant"];

function languageToLocale(language: string): string {
  switch (language) {
    case "English (UK)":
      return "en-GB";
    case "Japanese":
      return "ja-JP";
    case "German":
      return "de-DE";
    case "French":
      return "fr-FR";
    case "Spanish":
      return "es-ES";
    default:
      return "en-US";
  }
}

function formatNowTime(language = "English (US)"): string {
  return new Date().toLocaleTimeString(languageToLocale(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function playFeedbackTone(
  settings: WorkspaceSettingsSnapshot,
  forcePreview = false,
  cueKind: "complete" | "start" | "error" = "complete"
) {
  const allowTone =
    forcePreview ||
    (cueKind === "complete"
      ? settings.completionChime || settings.spokenStatusUpdates
      : settings.spokenStatusUpdates);
  if (!allowTone || settings.soundProfile === "muted" || settings.volume <= 0) {
    return;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const level = Math.max(0.01, Math.min(0.15, (settings.volume / 100) * 0.12));

    if (cueKind === "start") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.08);
    } else if (cueKind === "error") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(360, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.18);
    } else {
      osc.type = settings.soundProfile === "click" ? "triangle" : "sine";
      osc.frequency.setValueAtTime(settings.soundProfile === "click" ? 520 : 660, ctx.currentTime);
      if (settings.soundProfile === "chime") {
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);
      }
    }

    const duration = cueKind === "error" ? 0.2 : 0.16;
    gain.gain.setValueAtTime(level, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.01);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {
    // Ignore audio playback errors if autoplay policy blocks it
  }
}

function speakStatusUpdate(settings: WorkspaceSettingsSnapshot, phrase: string) {
  if (
    !settings.spokenStatusUpdates ||
    settings.soundProfile === "muted" ||
    settings.volume <= 0 ||
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.volume = Math.max(0.05, Math.min(1, settings.volume / 100));
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis errors
  }
}

function notifyGenerationStatus(
  settings: WorkspaceSettingsSnapshot,
  status: "start" | "complete" | "error"
) {
  playFeedbackTone(settings, false, status);
  if (!settings.spokenStatusUpdates) return;
  if (status === "start") {
    speakStatusUpdate(settings, "Generation started.");
  } else if (status === "complete") {
    speakStatusUpdate(settings, "Generation complete.");
  } else {
    speakStatusUpdate(settings, "Generation encountered an error.");
  }
}

function toReadableSpeechText(markdown: string): string {
  return markdown
    .replace(
      /```(?:nexora-preview|html-preview|preview|widget)[\s\S]*?```/gi,
      " Interactive visual omitted. "
    )
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readFileAsAttachmentPayload(
  file: File
): Promise<{ mimeType: string; base64Data: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      const rawMime = file.type || "image/png";
      const supportedMime =
        rawMime === "image/jpeg" ||
        rawMime === "image/png" ||
        rawMime === "image/webp" ||
        rawMime === "image/gif";

      // Fast path for moderately sized, standard images
      if (supportedMime && file.size <= 1_100_000) {
        const commaIdx = rawDataUrl.indexOf(",");
        resolve({
          mimeType: rawMime,
          base64Data: commaIdx >= 0 ? rawDataUrl.slice(commaIdx + 1) : "",
          dataUrl: rawDataUrl,
        });
        return;
      }

      // Downscale oversized images or convert unsupported formats (e.g., BMP/AVIF/HEIC) to JPEG
      const img = new Image();
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const targetW = Math.max(1, Math.round((img.naturalWidth || 800) * scale));
        const targetH = Math.max(1, Math.round((img.naturalHeight || 600) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          const commaIdx = rawDataUrl.indexOf(",");
          resolve({
            mimeType: rawMime,
            base64Data: commaIdx >= 0 ? rawDataUrl.slice(commaIdx + 1) : "",
            dataUrl: rawDataUrl,
          });
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const outMime = rawMime === "image/png" && file.size <= 2_500_000 ? "image/png" : "image/jpeg";
        const compressedUrl = canvas.toDataURL(outMime, 0.86);
        const commaIdx = compressedUrl.indexOf(",");
        resolve({
          mimeType: outMime,
          base64Data: commaIdx >= 0 ? compressedUrl.slice(commaIdx + 1) : "",
          dataUrl: compressedUrl,
        });
      };
      img.onerror = () => {
        const commaIdx = rawDataUrl.indexOf(",");
        resolve({
          mimeType: rawMime,
          base64Data: commaIdx >= 0 ? rawDataUrl.slice(commaIdx + 1) : "",
          dataUrl: rawDataUrl,
        });
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

type ResponseSegment =
  | { type: "text"; content: string }
  | { type: "code"; filename: string; lines: string[] }
  | { type: "preview"; html: string; isLoading?: boolean };

const PREVIEW_FENCE_LANGS = new Set([
  "nexora-preview",
  "html-preview",
  "preview",
  "widget",
]);

function isPreviewFenceLang(lang: string): boolean {
  return PREVIEW_FENCE_LANGS.has(lang.trim().toLowerCase());
}

function langToFilename(lang: string): string {
  const clean = lang.trim().toLowerCase();
  if (clean === "typescript" || clean === "ts" || clean === "tsx") return `snippet.${clean}`;
  if (clean === "javascript" || clean === "js" || clean === "jsx") return `snippet.${clean}`;
  if (clean === "python" || clean === "py") return "script.py";
  if (clean === "json") return "data.json";
  if (clean === "bash" || clean === "sh") return "commands.sh";
  if (clean === "sql") return "query.sql";
  if (clean === "html") return "index.html";
  if (clean === "css") return "styles.css";
  return clean ? `${clean}.txt` : "snippet.txt";
}

function splitMarkdownSegments(markdown: string, isStreaming: boolean): ResponseSegment[] {
  const segments: ResponseSegment[] = [];
  const fenceRegex = /```([a-zA-Z0-9_.-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      const before = markdown.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }
    const lang = match[1] || "";
    const body = match[2].replace(/\n$/, "");
    if (isPreviewFenceLang(lang)) {
      if (body.trim()) {
        segments.push({ type: "preview", html: body });
      }
    } else {
      segments.push({
        type: "code",
        filename: langToFilename(lang),
        lines: body.split("\n"),
      });
    }
    lastIndex = fenceRegex.lastIndex;
  }

  const tail = markdown.slice(lastIndex);
  if (tail) {
    const openFenceIdx = tail.indexOf("```");
    if (isStreaming && openFenceIdx >= 0) {
      const textBefore = tail.slice(0, openFenceIdx).trim();
      if (textBefore) segments.push({ type: "text", content: textBefore });
      const afterBackticks = tail.slice(openFenceIdx + 3);
      const newlineIdx = afterBackticks.indexOf("\n");
      if (newlineIdx >= 0) {
        const lang = afterBackticks.slice(0, newlineIdx);
        const partialCode = afterBackticks.slice(newlineIdx + 1);
        if (isPreviewFenceLang(lang)) {
          segments.push({ type: "preview", html: "", isLoading: true });
        } else {
          segments.push({
            type: "code",
            filename: langToFilename(lang),
            lines: (partialCode || " ").split("\n"),
          });
        }
      }
    } else if (!isStreaming && openFenceIdx >= 0) {
      const textBefore = tail.slice(0, openFenceIdx).trim();
      if (textBefore) segments.push({ type: "text", content: textBefore });
      const afterBackticks = tail.slice(openFenceIdx + 3);
      const newlineIdx = afterBackticks.indexOf("\n");
      if (newlineIdx >= 0) {
        const lang = afterBackticks.slice(0, newlineIdx);
        const body = afterBackticks.slice(newlineIdx + 1).trim();
        if (isPreviewFenceLang(lang) && body) {
          segments.push({ type: "preview", html: body });
        } else {
          segments.push({ type: "text", content: tail.slice(openFenceIdx).trim() });
        }
      } else if (tail.trim()) {
        segments.push({ type: "text", content: tail.trim() });
      }
    } else if (tail.trim()) {
      segments.push({ type: "text", content: tail.trim() });
    }
  }

  return segments;
}

function NewChatBubbleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

function toSafeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

function getSourceHostLabel(source: SourceLink): string {
  const rawTitle = source.title.trim();
  if (rawTitle && !/^https?:\/\//i.test(rawTitle)) {
    return rawTitle;
  }
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function AssistantMessageBlock({
  msg,
  fontScale,
  isDark,
  showTraces,
  speechVolume,
  onOpenSettings,
  onStop,
}: {
  msg: WorkspaceMessage;
  fontScale: "default" | "large";
  isDark: boolean;
  showTraces: boolean;
  speechVolume?: number;
  onOpenSettings: (tab?: SettingsTab) => void;
  onStop?: () => void;
}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isRunning = msg.jobStatus === "running";
  const isError = msg.jobStatus === "error";
  const segments = useMemo(
    () => splitMarkdownSegments(msg.content || "", isRunning),
    [msg.content, isRunning]
  );

  const safeSources = useMemo(() => {
    const seen = new Set<string>();
    const list: SourceLink[] = [];
    for (const s of msg.sources ?? []) {
      const safeHref = toSafeHttpUrl(s.url);
      if (!safeHref || seen.has(safeHref)) continue;
      seen.add(safeHref);
      list.push({ title: s.title, url: safeHref });
    }
    return list;
  }, [msg.sources]);

  const hasReasoning = Boolean(msg.reasoningText && msg.reasoningText.trim().length > 0);
  const traceRows = useMemo(
    () =>
      (msg.thinkingLines ?? []).map((line) => ({
        primary: line,
      })),
    [msg.thinkingLines]
  );

  const needsKeySetup =
    isError && /byok|key|provider|model/i.test(msg.errorMessage || msg.content || "");

  const canReadAloud =
    !isRunning &&
    Boolean(msg.content?.trim()) &&
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  useEffect(() => {
    return () => {
      if (
        utteranceRef.current &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
        utteranceRef.current = null;
      }
    };
  }, []);

  const handleToggleReadAloud = () => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      utteranceRef.current = null;
      setIsSpeaking(false);
      return;
    }

    const spokenText = toReadableSpeechText(msg.content || "");
    if (!spokenText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.volume = Math.max(0.25, Math.min(1, (speechVolume ?? 85) / 100 || 0.85));
    utterance.rate = 1.02;
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setIsSpeaking(false);
      }
    };
    utterance.onerror = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setIsSpeaking(false);
      }
    };
    utteranceRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div data-assistant-prose className="flex w-full flex-col gap-3 border-b border-line pb-5">
      {showTraces && (hasReasoning || traceRows.length > 0 || isRunning) && (
        <ThinkingState
          fill
          variant={hasReasoning ? "Reasoning" : "Steps"}
          isWorking={isRunning}
          reasoningText={msg.reasoningText}
          durationMs={msg.thinkingDurationMs}
          active={hasReasoning ? "Thinking" : `Using ${msg.model ?? "Nexora"}`}
          done={
            isError
              ? "Generation stopped"
              : hasReasoning
                ? "Thought"
                : `Completed with ${msg.model ?? "Nexora"}`
          }
          rows={hasReasoning ? [] : traceRows}
        />
      )}

      {segments.length === 0 && isRunning && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
          <span
            className="size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2"
            style={{ animation: "spin 700ms linear infinite" }}
          />
          <span>Streaming response…</span>
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="ml-1 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-0.5 text-[11.5px] font-medium text-ink shadow-hairline transition-colors hover:bg-hover"
            >
              <span className="size-2 rounded-[2px] bg-ink" aria-hidden="true" />
              Stop
            </button>
          )}
        </div>
      )}

      {segments.map((seg, idx) =>
        seg.type === "preview" ? (
          <InlineHtmlPreview
            key={`preview-${idx}`}
            html={seg.html}
            isDark={isDark}
            isLoading={seg.isLoading}
          />
        ) : seg.type === "code" ? (
          <div key={`code-${idx}`} className="w-full">
            <CodeBlock
              fill
              filename={seg.filename}
              lines={seg.lines}
              isStreaming={isRunning && idx === segments.length - 1}
            />
          </div>
        ) : (
          <MarkdownRenderer
            key={`txt-${idx}`}
            content={seg.content}
            fontScale={fontScale}
            isError={isError}
            isStreaming={isRunning && idx === segments.length - 1}
          />
        )
      )}

      {segments.length > 0 && isRunning && onStop && (
        <div className="flex items-center pt-0.5">
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink shadow-hairline transition-colors hover:bg-hover"
          >
            <span className="size-2 rounded-[2px] bg-ink" aria-hidden="true" />
            Stop response
          </button>
        </div>
      )}

      {safeSources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
            <Globe className="size-3" />
            Sources
          </span>
          {safeSources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              title={source.url}
              className="inline-flex max-w-[240px] items-center gap-1 rounded-control border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium text-ink-2 shadow-hairline transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="truncate">{getSourceHostLabel(source)}</span>
              <ArrowUpRight className="size-3 shrink-0 text-ink-3" />
            </a>
          ))}
        </div>
      )}

      {canReadAloud && (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleToggleReadAloud}
            aria-label={isSpeaking ? "Stop reading aloud" : "Read Aloud"}
            className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-[11.5px] font-medium shadow-hairline transition-colors ${
              isSpeaking
                ? "border-ink bg-ink text-surface"
                : "border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            {isSpeaking ? (
              <>
                <Square className="size-3 fill-current" />
                <span>Stop reading</span>
              </>
            ) : (
              <>
                <Volume2 className="size-3.5" />
                <span>Read Aloud</span>
              </>
            )}
          </button>
        </div>
      )}

      {needsKeySetup && (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onOpenSettings("models")}
            className="rounded-control border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink shadow-hairline transition-colors hover:bg-hover"
          >
            Configure API Keys in Settings → Models
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [authSession, setAuthSession] = useState<AuthSessionSnapshot | null>(() =>
    loadAuthSession()
  );
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [initialUi] = useState<UiSessionSnapshot | null>(() => loadUiSession());
  const [guestWorkspaceId] = useState<string>(() => getOrCreateGuestWorkspaceId());
  const [settings, setSettings] = useState<WorkspaceSettingsSnapshot>(() =>
    loadLocalSettingsSync()
  );
  const [byok, setByok] = useState<ByokConfig>(() => loadByokConfig());
  const [threads, setThreads] = useState<WorkspaceThread[]>(() => loadLocalThreadsSync());
  const [folders, setFolders] = useState<ChatFolder[]>(() => loadLocalFoldersSync());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => initialUi?.activeThreadId ?? null
  );
  const [activeView, setActiveView] = useState<"landing" | "chat" | "settings">(() => {
    if (typeof window !== "undefined") {
      if (window.location.hash === "#workspace" || window.location.hash === "#chat") {
        return "chat";
      }
      if (window.location.hash === "#settings") {
        return "settings";
      }
    }
    return "landing";
  });
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    () => initialUi?.settingsTab ?? "general"
  );
  const [settingsTabKey, setSettingsTabKey] = useState(0);

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const mobile =
      typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false;
    if (mobile) return true;
    return initialUi?.sidebarCollapsed ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setSidebarCollapsed(e.matches);
    };
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [sidebarSearchTrigger, setSidebarSearchTrigger] = useState(0);
  const [collapsedSearchOpen, setCollapsedSearchOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialUi?.draft ?? "");
  const [selectionBar, setSelectionBar] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [lightboxGallery, setLightboxGallery] = useState<{
    images: LightboxImageItem[];
    initialIndex: number;
  } | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const prevMsgCountRef = useRef(0);
  const prevThreadIdRef = useRef<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [workspaceStageEl, setWorkspaceStageEl] = useState<HTMLDivElement | null>(null);
  const workspaceStageValue = useMemo(
    () => ({
      container: workspaceStageEl,
      hasFloatingControls: sidebarCollapsed || isMobile,
    }),
    [workspaceStageEl, sidebarCollapsed, isMobile]
  );

  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus>("idle");
  const [localDownloadProgress, setLocalDownloadProgress] = useState(0);
  const [localStatusText, setLocalStatusText] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedComposerModel, setSelectedComposerModel] = useState<string>(
    () => initialUi?.selectedComposerModel || "Nexora Assistant"
  );
  const [selectedEffort, setSelectedEffort] = useState<string>(
    () => initialUi?.selectedEffort || "Medium"
  );
  const downloadTimerRef = useRef<number | null>(null);

  const activeJobStreamsRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledMsgIdsRef = useRef<Set<string>>(new Set());
  const notifiedMsgStatusRef = useRef<Set<string>>(new Set());
  const pendingAiTitlesRef = useRef<
    Map<string, { fallbackTitle: string; prompt: string; model: string }>
  >(new Map());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const desktopSidebarCollapsedRef = useRef(sidebarCollapsed);
  if (!isMobile) {
    desktopSidebarCollapsedRef.current = sidebarCollapsed;
  }
  const uiSessionRef = useRef<UiSessionSnapshot>({
    activeThreadId,
    activeView,
    settingsTab,
    draft,
    selectedComposerModel,
    selectedEffort,
    sidebarCollapsed: desktopSidebarCollapsedRef.current,
  });
  uiSessionRef.current = {
    activeThreadId,
    activeView,
    settingsTab,
    draft,
    selectedComposerModel,
    selectedEffort,
    sidebarCollapsed: desktopSidebarCollapsedRef.current,
  };
  const byokRef = useRef(byok);
  byokRef.current = byok;
  const authSessionRef = useRef(authSession);
  authSessionRef.current = authSession;
  const firebaseUserRef = useRef<FirebaseUser | null>(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  useEffect(() => {
    saveUiSession(uiSessionRef.current);
  }, [
    activeThreadId,
    activeView,
    settingsTab,
    draft,
    selectedComposerModel,
    selectedEffort,
    sidebarCollapsed,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeView === "chat") {
      if (window.location.hash !== "#workspace") {
        window.history.replaceState(null, "", "#workspace");
      }
    } else if (activeView === "settings") {
      if (window.location.hash !== "#settings") {
        window.history.replaceState(null, "", "#settings");
      }
    } else if (window.location.hash === "#workspace" || window.location.hash === "#chat" || window.location.hash === "#settings") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [activeView]);

  useEffect(() => {
    const flushAllToLocalStorage = () => {
      saveLocalThreadsSync(threadsRef.current);
      saveLocalFoldersSync(foldersRef.current);
      saveLocalSettingsSync(settingsRef.current);
      saveUiSession(uiSessionRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushAllToLocalStorage();
      }
    };
    window.addEventListener("pagehide", flushAllToLocalStorage);
    window.addEventListener("beforeunload", flushAllToLocalStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushAllToLocalStorage);
      window.removeEventListener("beforeunload", flushAllToLocalStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const currentUser: SidebarAccount | null = useMemo(() => {
    if (firebaseUser) {
      const providerProfile = firebaseUser.providerData?.[0];
      const name =
        firebaseUser.displayName ||
        providerProfile?.displayName ||
        firebaseUser.email ||
        providerProfile?.email ||
        "Google User";
      const email = firebaseUser.email || providerProfile?.email || "";
      const avatarUrl =
        firebaseUser.photoURL || providerProfile?.photoURL || undefined;
      return {
        id: firebaseUser.uid,
        name,
        email,
        initials: makeInitials(name),
        avatarUrl,
      };
    }
    return authSession?.user ?? null;
  }, [firebaseUser, authSession]);

  const authProviderLabel = firebaseUser
    ? "Google (Firebase)"
    : authSession
      ? "Email account"
      : null;

  const buildApiHeaders = useCallback(
    (tokenOverride?: string | null, fbUidOverride?: string | null): Record<string, string> => {
      const token =
        tokenOverride !== undefined ? tokenOverride : authSessionRef.current?.token;
      const fbUid =
        fbUidOverride !== undefined ? fbUidOverride : firebaseUserRef.current?.uid;
      const effectiveWorkspace = fbUid ? `fb_${fbUid}` : guestWorkspaceId;

      return {
        "Content-Type": "application/json",
        "x-workspace-id": effectiveWorkspace,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
    },
    [guestWorkspaceId]
  );

  const persistThreadsLocally = useCallback((nextThreads: WorkspaceThread[]) => {
    saveLocalThreadsSync(nextThreads);
    void saveOfflineThreads(nextThreads);
  }, []);

  const pushThreadsToServer = useCallback(
    async (
      nextThreads: WorkspaceThread[],
      tokenOverride?: string | null,
      fbUidOverride?: string | null
    ) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        await fetch("/api/workspace/threads", {
          method: "PUT",
          headers: buildApiHeaders(tokenOverride, fbUidOverride),
          body: JSON.stringify({ threads: nextThreads }),
        });
      } catch {
        // Offline or unreachable — IndexedDB cache holds state
      }
    },
    [buildApiHeaders]
  );

  const mirrorThreadToFirestore = useCallback((thread: WorkspaceThread) => {
    const fbUser = firebaseUserRef.current;
    if (fbUser && fbUser.emailVerified && typeof navigator !== "undefined" && navigator.onLine) {
      void syncThreadToFirestore(fbUser.uid, thread).catch((err) => {
        console.error("Firestore thread mirror error:", err);
      });
    }
  }, []);

  const pushFoldersToServer = useCallback(
    async (
      nextFolders: ChatFolder[],
      tokenOverride?: string | null,
      fbUidOverride?: string | null
    ) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      try {
        await fetch("/api/workspace/folders", {
          method: "PUT",
          headers: buildApiHeaders(tokenOverride, fbUidOverride),
          body: JSON.stringify({ folders: nextFolders }),
        });
      } catch {
        // Offline or unreachable — IndexedDB holds state
      }
    },
    [buildApiHeaders]
  );

  const mirrorFolderToFirestore = useCallback((folder: ChatFolder) => {
    const fbUser = firebaseUserRef.current;
    if (fbUser && fbUser.emailVerified && typeof navigator !== "undefined" && navigator.onLine) {
      void syncFolderToFirestore(fbUser.uid, folder).catch((err) => {
        console.error("Firestore folder mirror error:", err);
      });
    }
  }, []);

  const removePendingJob = useCallback((jobId: string) => {
    const existing = loadPendingJobs();
    const filtered = existing.filter((j) => j.jobId !== jobId);
    if (filtered.length !== existing.length) {
      savePendingJobs(filtered);
    }
  }, []);

  const addPendingJob = useCallback((record: PendingJobRecord) => {
    const existing = loadPendingJobs().filter((j) => j.jobId !== record.jobId);
    savePendingJobs([...existing, record]);
  }, []);

  const subscribeToJobStream = useCallback(
    async (
      jobId: string,
      threadId: string,
      assistantMessageId: string,
      tokenOverride?: string | null,
      fbUidOverride?: string | null
    ) => {
      if (activeJobStreamsRef.current.has(jobId)) return;

      const controller = new AbortController();
      activeJobStreamsRef.current.set(jobId, controller);

      const applyJobUpdate = (payload: {
        status: "running" | "completed" | "error";
        text?: string;
        thinkingLines?: string[];
        reasoningText?: string;
        thinkingDurationMs?: number;
        thinkingVariant?: WorkspaceMessage["thinkingVariant"];
        sources?: SourceLink[];
        errorMessage?: string;
      }) => {
        let completedThread: WorkspaceThread | null = null;

        setThreads((prev) => {
          const next = prev.map((t) => {
            if (t.id !== threadId) return t;
            const updated: WorkspaceThread = {
              ...t,
              updatedAt: "Just now",
              messages: t.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: payload.text ?? m.content,
                      thinkingLines:
                        payload.thinkingLines && payload.thinkingLines.length > 0
                          ? payload.thinkingLines
                          : m.thinkingLines,
                      reasoningText:
                        payload.reasoningText && payload.reasoningText.length > 0
                          ? payload.reasoningText
                          : m.reasoningText,
                      thinkingDurationMs:
                        typeof payload.thinkingDurationMs === "number" &&
                        payload.thinkingDurationMs > 0
                          ? payload.thinkingDurationMs
                          : m.thinkingDurationMs,
                      thinkingVariant:
                        payload.reasoningText && payload.reasoningText.length > 0
                          ? "Reasoning"
                          : payload.thinkingVariant ?? m.thinkingVariant,
                      sources:
                        payload.sources && payload.sources.length > 0
                          ? payload.sources
                          : m.sources,
                      jobStatus: payload.status,
                      errorMessage: payload.errorMessage,
                    }
                  : m
              ),
            };
            if (payload.status !== "running") {
              completedThread = updated;
            }
            return updated;
          });
          persistThreadsLocally(next);
          return next;
        });

        if (payload.status !== "running") {
          removePendingJob(jobId);
          if (completedThread) {
            mirrorThreadToFirestore(completedThread);
          }
          if (payload.status === "completed") {
            const notifyKey = `${assistantMessageId}:complete`;
            if (!notifiedMsgStatusRef.current.has(notifyKey)) {
              notifiedMsgStatusRef.current.add(notifyKey);
              notifyGenerationStatus(settingsRef.current, "complete");
            }
            const pendingTitle = pendingAiTitlesRef.current.get(threadId);
            if (
              pendingTitle &&
              payload.text &&
              payload.text.trim() &&
              !payload.text.startsWith("Response stopped")
            ) {
              pendingAiTitlesRef.current.delete(threadId);
              void requestAiThreadTitle(
                threadId,
                pendingTitle.fallbackTitle,
                pendingTitle.prompt,
                payload.text,
                pendingTitle.model
              );
            }
          } else if (payload.status === "error") {
            pendingAiTitlesRef.current.delete(threadId);
            const notifyKey = `${assistantMessageId}:error`;
            if (!notifiedMsgStatusRef.current.has(notifyKey)) {
              notifiedMsgStatusRef.current.add(notifyKey);
              notifyGenerationStatus(settingsRef.current, "error");
            }
          }
        }
      };

      try {
        const res = await fetch(`/api/chat/jobs/${encodeURIComponent(jobId)}/stream`, {
          headers: buildApiHeaders(tokenOverride, fbUidOverride),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const poll = await fetch(`/api/chat/jobs/${encodeURIComponent(jobId)}`, {
            headers: buildApiHeaders(tokenOverride, fbUidOverride),
            signal: controller.signal,
          }).catch(() => null);
          if (poll?.ok) {
            const data = (await poll.json()) as {
              job?: {
                status: "running" | "completed" | "error";
                text: string;
                thinkingLines?: string[];
                reasoningText?: string;
                thinkingDurationMs?: number;
                sources?: SourceLink[];
                errorMessage?: string;
              };
            };
            if (data.job) {
              applyJobUpdate(data.job);
            }
          } else {
            removePendingJob(jobId);
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!line) continue;
            const rawJson = line.slice(5).trim();
            if (!rawJson) continue;
            try {
              const payload = JSON.parse(rawJson) as {
                status: "running" | "completed" | "error";
                text?: string;
                thinkingLines?: string[];
                reasoningText?: string;
                thinkingDurationMs?: number;
                thinkingVariant?: WorkspaceMessage["thinkingVariant"];
                sources?: SourceLink[];
                errorMessage?: string;
              };
              applyJobUpdate(payload);
            } catch {
              // Ignore malformed SSE frame
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          // Network dropped mid-stream; keep pending job record so we resume on reconnect
        }
      } finally {
        activeJobStreamsRef.current.delete(jobId);
      }
    },
    [buildApiHeaders, mirrorThreadToFirestore, persistThreadsLocally, removePendingJob]
  );

  // Sync workspace from built-in server + Firestore (if Google signed in) + resume active jobs
  const syncWorkspace = useCallback(
    async (tokenOverride?: string | null, fbUserOverride?: FirebaseUser | null) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const activeFb = fbUserOverride !== undefined ? fbUserOverride : firebaseUserRef.current;

      try {
        const res = await fetch("/api/workspace", {
          headers: buildApiHeaders(tokenOverride, activeFb?.uid ?? null),
        });

        let serverThreads: WorkspaceThread[] = [];
        let serverFolders: ChatFolder[] = [];
        let serverSettings: Partial<WorkspaceSettingsSnapshot> = {};
        let activeJobs: Array<{
          id: string;
          threadId: string;
          assistantMessageId: string;
          status: "running" | "completed" | "error";
          text: string;
          thinkingLines?: string[];
          reasoningText?: string;
          thinkingDurationMs?: number;
          sources?: SourceLink[];
          errorMessage?: string;
        }> = [];

        if (res.ok) {
          const data = (await res.json()) as {
            threads?: WorkspaceThread[];
            folders?: ChatFolder[];
            settings?: Partial<WorkspaceSettingsSnapshot>;
            activeJobs?: typeof activeJobs;
          };
          serverThreads = Array.isArray(data.threads) ? data.threads : [];
          serverFolders = Array.isArray(data.folders) ? data.folders : [];
          serverSettings = data.settings ?? {};
          activeJobs = Array.isArray(data.activeJobs) ? data.activeJobs : [];
        }

        // Pull Cloud Firestore snapshot if signed in with verified Firebase account
        let firestoreThreads: WorkspaceThread[] = [];
        let firestoreFolders: ChatFolder[] = [];
        let firestorePrefs: Partial<WorkspaceSettingsSnapshot> | null = null;
        if (activeFb && activeFb.emailVerified) {
          try {
            const [fsThreads, fsFolders, fsPrefs] = await Promise.all([
              loadFirebaseThreads(activeFb.uid),
              loadFirebaseFolders(activeFb.uid),
              loadFirebasePreferences(activeFb.uid),
            ]);
            firestoreThreads = fsThreads;
            firestoreFolders = fsFolders;
            firestorePrefs = fsPrefs;
          } catch (err) {
            console.error("Firestore read error:", err);
          }
        }

        if (
          Object.keys(serverSettings).length > 0 ||
          (firestorePrefs && Object.keys(firestorePrefs).length > 0)
        ) {
          setSettings((prev) => {
            const merged = { ...prev, ...serverSettings, ...(firestorePrefs ?? {}) };
            void saveOfflineSettings(merged);
            return merged;
          });
        }

        const [localCachedThreads, localCachedFolders] = await Promise.all([
          loadOfflineThreads(),
          loadOfflineFolders(),
        ]);

        // Merge folders across local cache, Firestore, and built-in server
        const foldersById = new Map<string, ChatFolder>();
        for (const f of localCachedFolders) foldersById.set(f.id, f);
        for (const f of firestoreFolders) foldersById.set(f.id, f);
        for (const f of serverFolders) foldersById.set(f.id, f);
        const effectiveFolders = Array.from(foldersById.values());
        setFolders(effectiveFolders);
        void saveOfflineFolders(effectiveFolders);

        const serverFolderIds = new Set(serverFolders.map((f) => f.id));
        if (effectiveFolders.some((f) => !serverFolderIds.has(f.id))) {
          void pushFoldersToServer(effectiveFolders, tokenOverride, activeFb?.uid ?? null);
        }

        // Merge threads across local cache, Firestore, and built-in server while preserving any saved thinking traces & sources
        const mergeThreadWithThinking = (
          prev: WorkspaceThread | undefined,
          incoming: WorkspaceThread
        ): WorkspaceThread => {
          if (!prev) return incoming;
          const prevMsgById = new Map(prev.messages.map((m) => [m.id, m]));
          const mergedMessages = incoming.messages.map((m) => {
            const older = prevMsgById.get(m.id);
            if (!older) return m;
            const reasoningText =
              m.reasoningText && m.reasoningText.length > 0
                ? m.reasoningText
                : older.reasoningText;
            const thinkingLines =
              m.thinkingLines && m.thinkingLines.length > 0
                ? m.thinkingLines
                : older.thinkingLines;
            const thinkingDurationMs =
              typeof m.thinkingDurationMs === "number" && m.thinkingDurationMs > 0
                ? m.thinkingDurationMs
                : older.thinkingDurationMs;
            const thinkingVariant =
              m.thinkingVariant ??
              (reasoningText ? "Reasoning" : older.thinkingVariant);
            const sources =
              m.sources && m.sources.length > 0 ? m.sources : older.sources;
            return {
              ...m,
              reasoningText,
              thinkingLines,
              thinkingDurationMs,
              thinkingVariant,
              sources,
            };
          });
          return {
            ...incoming,
            messages: mergedMessages,
          };
        };

        const byId = new Map<string, WorkspaceThread>();
        for (const t of localCachedThreads) byId.set(t.id, t);
        for (const t of firestoreThreads) {
          byId.set(t.id, mergeThreadWithThinking(byId.get(t.id), t));
        }
        for (const t of serverThreads) {
          byId.set(t.id, mergeThreadWithThinking(byId.get(t.id), t));
        }

        let effectiveThreads = Array.from(byId.values());

        // Push any local/Firestore-only threads to built-in server if server didn't have them yet
        const serverIds = new Set(serverThreads.map((t) => t.id));
        if (effectiveThreads.some((t) => !serverIds.has(t.id))) {
          void pushThreadsToServer(effectiveThreads, tokenOverride, activeFb?.uid ?? null);
        }

        // Apply latest state from active/recently finished server jobs
        const jobsMap = new Map(activeJobs.map((j) => [j.id, j]));
        const jobsToResume: Array<{
          jobId: string;
          threadId: string;
          assistantMessageId: string;
        }> = [];

        effectiveThreads = effectiveThreads.map((t) => ({
          ...t,
          messages: t.messages.map((m) => {
            if (!m.jobId) return m;
            const srvJob = jobsMap.get(m.jobId);
            if (srvJob) {
              if (srvJob.status === "running") {
                jobsToResume.push({
                  jobId: srvJob.id,
                  threadId: t.id,
                  assistantMessageId: m.id,
                });
              } else {
                removePendingJob(srvJob.id);
              }
              return {
                ...m,
                content: srvJob.text || m.content,
                thinkingLines: srvJob.thinkingLines ?? m.thinkingLines,
                reasoningText: srvJob.reasoningText ?? m.reasoningText,
                thinkingDurationMs: srvJob.thinkingDurationMs ?? m.thinkingDurationMs,
                thinkingVariant: srvJob.reasoningText ? "Reasoning" : m.thinkingVariant,
                sources:
                  srvJob.sources && srvJob.sources.length > 0
                    ? srvJob.sources
                    : m.sources,
                jobStatus: srvJob.status,
                errorMessage: srvJob.errorMessage,
              };
            }
            return m;
          }),
        }));

        const pendingLocal = loadPendingJobs();
        for (const pj of pendingLocal) {
          if (!jobsToResume.some((r) => r.jobId === pj.jobId)) {
            const jobRes = await fetch(
              `/api/chat/jobs/${encodeURIComponent(pj.jobId)}`,
              { headers: buildApiHeaders(tokenOverride, activeFb?.uid ?? null) }
            ).catch(() => null);
            if (jobRes?.ok) {
              const { job } = (await jobRes.json()) as {
                job: {
                  id: string;
                  threadId: string;
                  assistantMessageId: string;
                  status: "running" | "completed" | "error";
                  text: string;
                  thinkingLines?: string[];
                  reasoningText?: string;
                  thinkingDurationMs?: number;
                  sources?: SourceLink[];
                  errorMessage?: string;
                };
              };
              effectiveThreads = effectiveThreads.map((t) =>
                t.id !== job.threadId
                  ? t
                  : {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id !== job.assistantMessageId
                          ? m
                          : {
                              ...m,
                              content: job.text || m.content,
                              thinkingLines: job.thinkingLines ?? m.thinkingLines,
                              reasoningText: job.reasoningText ?? m.reasoningText,
                              thinkingDurationMs:
                                job.thinkingDurationMs ?? m.thinkingDurationMs,
                              thinkingVariant: job.reasoningText
                                ? "Reasoning"
                                : m.thinkingVariant,
                              sources:
                                job.sources && job.sources.length > 0
                                  ? job.sources
                                  : m.sources,
                              jobStatus: job.status,
                              errorMessage: job.errorMessage,
                            }
                      ),
                    }
              );
              if (job.status === "running") {
                jobsToResume.push(pj);
              } else {
                removePendingJob(pj.jobId);
              }
            } else {
              removePendingJob(pj.jobId);
            }
          }
        }

        setThreads(effectiveThreads);
        persistThreadsLocally(effectiveThreads);
        setActiveThreadId((curr) =>
          curr && !effectiveThreads.some((t) => t.id === curr) ? null : curr
        );

        for (const r of jobsToResume) {
          void subscribeToJobStream(
            r.jobId,
            r.threadId,
            r.assistantMessageId,
            tokenOverride,
            activeFb?.uid ?? null
          );
        }
      } catch {
        // Offline or unreachable — keep using IndexedDB cache
      }
    },
    [
      buildApiHeaders,
      pushFoldersToServer,
      pushThreadsToServer,
      removePendingJob,
      subscribeToJobStream,
    ]
  );

  // Listen for Firebase Auth state changes (Google Login persistence across reloads)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      firebaseUserRef.current = user;
      if (user) {
        if (user.emailVerified && navigator.onLine) {
          void upsertFirebaseUserProfile(user).catch((err) => {
            console.error("Firestore profile error:", err);
          });
        }
        void syncWorkspace(undefined, user);
      }
    });
    return () => unsubscribe();
  }, [syncWorkspace]);

  // Initial hydrate from IndexedDB then sync server
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const [cachedThreads, cachedFolders, cachedSettings] = await Promise.all([
        loadOfflineThreads(),
        loadOfflineFolders(),
        loadOfflineSettings(),
      ]);
      if (cancelled) return;

      setThreads(cachedThreads);
      saveLocalThreadsSync(cachedThreads);
      setFolders(cachedFolders);
      saveLocalFoldersSync(cachedFolders);
      setSettings(cachedSettings);
      saveLocalSettingsSync(cachedSettings);
      if (cachedSettings.localModelReady) {
        const cachedOk = await isAnyLocalModelCached();
        if (!cancelled && cachedOk) {
          setLocalModelStatus("ready");
          setLocalDownloadProgress(100);
          const currentByok = loadByokConfig();
          if (
            !loadUiSession()?.selectedComposerModel &&
            !currentByok.apiKey.trim() &&
            (currentByok.savedModels?.length ?? 0) === 0
          ) {
            setSelectedComposerModel("Nexora Nano (Local)");
          }
        } else if (!cancelled) {
          setLocalModelStatus("idle");
          setLocalDownloadProgress(0);
        }
      }

      if (navigator.onLine) {
        const currentAuth = loadAuthSession();
        let activeToken: string | null = currentAuth?.token ?? null;
        if (activeToken) {
          const meRes = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${activeToken}` },
          }).catch(() => null);
          if (meRes && meRes.status === 401) {
            saveAuthSession(null);
            setAuthSession(null);
            activeToken = null;
          }
        }
        if (!cancelled) {
          await syncWorkspace(activeToken);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      for (const ctrl of activeJobStreamsRef.current.values()) {
        ctrl.abort();
      }
      activeJobStreamsRef.current.clear();
    };
  }, [syncWorkspace]);

  useEffect(() => {
    if (isOnline) {
      void syncWorkspace();
    }
  }, [isOnline, syncWorkspace]);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) {
        window.clearInterval(downloadTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    if (settings.isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    const raf = requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
    return () => cancelAnimationFrame(raf);
  }, [settings.isDark]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<WorkspaceSettingsSnapshot>) => {
      const enablingSpoken =
        patch.spokenStatusUpdates === true && !settingsRef.current.spokenStatusUpdates;
      const mergedPreview = { ...settingsRef.current, ...patch };
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        void saveOfflineSettings(next);
        if (typeof navigator === "undefined" || navigator.onLine) {
          void fetch("/api/workspace/settings", {
            method: "PUT",
            headers: buildApiHeaders(),
            body: JSON.stringify({ settings: next }),
          }).catch(() => {});

          const fbUser = firebaseUserRef.current;
          if (fbUser && fbUser.emailVerified) {
            void saveFirebasePreferences(fbUser.uid, next).catch((err) => {
              console.error("Firestore preferences save error:", err);
            });
          }
        }
        return next;
      });
      if (enablingSpoken) {
        speakStatusUpdate(mergedPreview, "Spoken status updates enabled.");
      }
    },
    [buildApiHeaders]
  );

  const handleUpdateByok = useCallback((patch: Partial<ByokConfig>) => {
    setByok((prev) => {
      const next = { ...prev, ...patch };
      saveByokConfig(next);
      return next;
    });
  }, []);

  const handleDownloadLocalModel = () => {
    if (localModelStatus === "downloading" || localModelStatus === "ready") return;
    setLocalError(null);
    setLocalStatusText("Checking WebGPU support…");
    setLocalModelStatus("downloading");
    setLocalDownloadProgress(2);

    void ensureLocalEngineLoaded(({ progress, text }) => {
      setLocalDownloadProgress(Math.max(2, progress));
      setLocalStatusText(text);
    })
      .then(() => {
        setLocalDownloadProgress(100);
        setLocalStatusText("WebGPU model cached and ready.");
        setLocalModelStatus("ready");
        setSelectedComposerModel("Nexora Nano (Local)");
        handleUpdateSettings({ localModelReady: true, localModelEnabled: true });
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not initialize WebGPU local model.";
        setLocalModelStatus("idle");
        setLocalDownloadProgress(0);
        setLocalStatusText(null);
        setLocalError(msg);
        handleUpdateSettings({ localModelReady: false });
      });
  };

  const handleClearLocalModel = () => {
    if (downloadTimerRef.current) {
      window.clearInterval(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
    void clearLocalModelCache();
    setLocalDownloadProgress(0);
    setLocalStatusText(null);
    setLocalError(null);
    setLocalModelStatus("idle");
    if (selectedComposerModel === "Nexora Nano (Local)") {
      setSelectedComposerModel("Nexora Assistant");
    }
    handleUpdateSettings({ localModelReady: false });
  };

  const handleGoogleLogin = async () => {
    const user = await signInWithGooglePopup();
    saveAuthSession(null);
    setAuthSession(null);
    setFirebaseUser(user);
    firebaseUserRef.current = user;
    if (user.emailVerified) {
      await upsertFirebaseUserProfile(user).catch((err) => {
        console.error("Firestore profile error:", err);
      });
    }
    await syncWorkspace(null, user);
  };

  const handleEmailLogin = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as {
      token?: string;
      user?: AuthSessionSnapshot["user"];
      error?: string;
    };
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error || "Sign in failed.");
    }
    if (firebaseUserRef.current) {
      await signOutFirebase().catch(() => {});
      setFirebaseUser(null);
      firebaseUserRef.current = null;
    }
    const nextSession: AuthSessionSnapshot = { token: data.token, user: data.user };
    saveAuthSession(nextSession);
    setAuthSession(nextSession);
    await syncWorkspace(nextSession.token, null);
  };

  const handleEmailRegister = async (
    name: string,
    email: string,
    password: string
  ) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, guestWorkspaceId }),
    });
    const data = (await res.json()) as {
      token?: string;
      user?: AuthSessionSnapshot["user"];
      error?: string;
    };
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error || "Registration failed.");
    }
    if (firebaseUserRef.current) {
      await signOutFirebase().catch(() => {});
      setFirebaseUser(null);
      firebaseUserRef.current = null;
    }
    const nextSession: AuthSessionSnapshot = { token: data.token, user: data.user };
    saveAuthSession(nextSession);
    setAuthSession(nextSession);
    await syncWorkspace(nextSession.token, null);
  };

  const handleSignOut = async () => {
    const prevToken = authSession?.token;
    if (prevToken && navigator.onLine) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${prevToken}` },
      }).catch(() => {});
    }
    if (firebaseUserRef.current) {
      await signOutFirebase().catch(() => {});
      setFirebaseUser(null);
      firebaseUserRef.current = null;
    }
    saveAuthSession(null);
    savePendingJobs([]);
    await Promise.all([saveOfflineThreads([]), saveOfflineFolders([])]);
    setAuthSession(null);
    setThreads([]);
    setFolders([]);
    setActiveThreadId(null);
    await syncWorkspace(null, null);
  };

  const handleExportAllChats = () => {
    if (threads.length === 0) return;
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        workspace: "Nexora",
        threads,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nexora-chats-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportThreadPdf = useCallback(
    async (thread: WorkspaceThread) => {
      const folderName =
        folders.find((f) => f.id === thread.folderId)?.name ?? null;
      await exportThreadToPdf(thread, {
        folderName,
        exportedBy: currentUser?.name ?? null,
      });
    },
    [folders, currentUser?.name]
  );

  const handleSyncNow = useCallback(async () => {
    await syncWorkspace();
  }, [syncWorkspace]);

  const handleClearAllChats = () => {
    setThreads([]);
    setActiveThreadId(null);
    savePendingJobs([]);
    void saveOfflineThreads([]);
    if (navigator.onLine) {
      void fetch("/api/workspace/threads", {
        method: "DELETE",
        headers: buildApiHeaders(),
      }).catch(() => {});
      const fbUser = firebaseUserRef.current;
      if (fbUser && fbUser.emailVerified) {
        void deleteAllFirebaseThreads(fbUser.uid).catch((err) => {
          console.error("Firestore delete threads error:", err);
        });
      }
    }
  };

  const updateThreadMetadata = useCallback(
    (
      threadId: string,
      updater: (thread: WorkspaceThread) => WorkspaceThread
    ) => {
      let updatedTarget: WorkspaceThread | null = null;
      setThreads((prev) => {
        const next = prev.map((t) => {
          if (t.id !== threadId) return t;
          const upd = updater(t);
          updatedTarget = upd;
          return upd;
        });
        persistThreadsLocally(next);
        if (navigator.onLine) {
          void pushThreadsToServer(next);
        }
        return next;
      });
      if (updatedTarget) {
        mirrorThreadToFirestore(updatedTarget);
      }
    },
    [mirrorThreadToFirestore, persistThreadsLocally, pushThreadsToServer]
  );

  const requestAiThreadTitle = useCallback(
    async (
      threadId: string,
      expectedFallbackTitle: string,
      prompt: string,
      assistantText: string,
      model: string
    ) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      if (!prompt.trim() && !assistantText.trim()) return;
      try {
        const res = await fetch("/api/chat/title", {
          method: "POST",
          headers: buildApiHeaders(),
          body: JSON.stringify({
            prompt,
            assistantText: assistantText.slice(0, 600),
            model,
            byok: resolveByokForModel(byokRef.current, model),
            language: settingsRef.current.language,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string | null };
        const aiTitle = typeof data.title === "string" ? data.title.trim() : "";
        if (!aiTitle) return;
        updateThreadMetadata(threadId, (t) =>
          t.title === expectedFallbackTitle ? { ...t, title: aiTitle } : t
        );
      } catch {
        // Fallback to the user-message title already assigned
      }
    },
    [buildApiHeaders, updateThreadMetadata]
  );

  const handleRenameThread = useCallback(
    (threadId: string, newTitle: string) => {
      const clean = newTitle.trim();
      if (!clean) return;
      pendingAiTitlesRef.current.delete(threadId);
      updateThreadMetadata(threadId, (t) => ({ ...t, title: clean }));
    },
    [updateThreadMetadata]
  );

  const handleTogglePinThread = useCallback(
    (threadId: string) => {
      updateThreadMetadata(threadId, (t) => ({ ...t, pinned: !t.pinned }));
    },
    [updateThreadMetadata]
  );

  const handleMoveThreadToFolder = useCallback(
    (threadId: string, folderId: string | null) => {
      updateThreadMetadata(threadId, (t) => ({ ...t, folderId }));
    },
    [updateThreadMetadata]
  );

  const handleDeleteThread = useCallback(
    (threadId: string) => {
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== threadId);
        persistThreadsLocally(next);
        if (navigator.onLine) {
          void pushThreadsToServer(next);
        }
        return next;
      });
      setActiveThreadId((curr) => (curr === threadId ? null : curr));

      const fbUser = firebaseUserRef.current;
      if (fbUser && fbUser.emailVerified && navigator.onLine) {
        void deleteFirebaseThread(fbUser.uid, threadId).catch((err) => {
          console.error("Firestore delete thread error:", err);
        });
      }
    },
    [persistThreadsLocally, pushThreadsToServer]
  );

  const handleCreateFolder = useCallback(
    (name: string): ChatFolder | null => {
      const clean = name.trim().slice(0, 80);
      if (!clean) return null;
      const folder: ChatFolder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: clean,
        createdAt: Date.now(),
      };
      setFolders((prev) => {
        const next = [...prev, folder];
        void saveOfflineFolders(next);
        if (navigator.onLine) {
          void pushFoldersToServer(next);
        }
        return next;
      });
      mirrorFolderToFirestore(folder);
      return folder;
    },
    [mirrorFolderToFirestore, pushFoldersToServer]
  );

  const handleRenameFolder = useCallback(
    (folderId: string, name: string) => {
      const clean = name.trim().slice(0, 80);
      if (!clean) return;
      let renamed: ChatFolder | null = null;
      setFolders((prev) => {
        const next = prev.map((f) => {
          if (f.id !== folderId) return f;
          const upd = { ...f, name: clean };
          renamed = upd;
          return upd;
        });
        void saveOfflineFolders(next);
        if (navigator.onLine) {
          void pushFoldersToServer(next);
        }
        return next;
      });
      if (renamed) {
        mirrorFolderToFirestore(renamed);
      }
    },
    [mirrorFolderToFirestore, pushFoldersToServer]
  );

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      setFolders((prev) => {
        const next = prev.filter((f) => f.id !== folderId);
        void saveOfflineFolders(next);
        if (navigator.onLine) {
          void pushFoldersToServer(next);
        }
        return next;
      });

      const affected: WorkspaceThread[] = [];
      setThreads((prev) => {
        const next = prev.map((t) => {
          if (t.folderId !== folderId) return t;
          const upd = { ...t, folderId: null };
          affected.push(upd);
          return upd;
        });
        if (affected.length > 0) {
          persistThreadsLocally(next);
          if (navigator.onLine) {
            void pushThreadsToServer(next);
          }
        }
        return next;
      });

      for (const t of affected) {
        mirrorThreadToFirestore(t);
      }

      const fbUser = firebaseUserRef.current;
      if (fbUser && fbUser.emailVerified && navigator.onLine) {
        void deleteFirebaseFolder(fbUser.uid, folderId).catch((err) => {
          console.error("Firestore delete folder error:", err);
        });
      }
    },
    [mirrorThreadToFirestore, persistThreadsLocally, pushFoldersToServer, pushThreadsToServer]
  );

  const openSettings = (tab: SettingsTab = "general") => {
    setSettingsTab(tab);
    setSettingsTabKey((k) => k + 1);
    setActiveView("settings");
    setCollapsedSearchOpen(false);
  };

  const composerModels = useMemo(() => {
    const list = [...DEFAULT_MODELS];
    const saved = byok.savedModels ?? [];
    if (saved.length > 0) {
      for (const item of saved) {
        const trimmed = item.id.trim();
        if (trimmed && trimmed !== "Nexora Assistant" && !list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    } else if (byok.baseUrl.trim()) {
      const configuredModels =
        byok.selectedModels.length > 0
          ? byok.selectedModels
          : byok.modelId.trim()
            ? [byok.modelId.trim()]
            : [];
      for (const item of configuredModels) {
        const trimmed = item.trim();
        if (trimmed && trimmed !== "Nexora Assistant" && !list.includes(trimmed)) {
          list.push(trimmed);
        }
      }
    }
    if (settings.localModelEnabled && localModelStatus === "ready") {
      list.push("Nexora Nano (Local)");
    }
    return list;
  }, [
    byok.savedModels,
    byok.selectedModels,
    byok.modelId,
    byok.baseUrl,
    settings.localModelEnabled,
    localModelStatus,
  ]);

  useEffect(() => {
    if (!composerModels.includes(selectedComposerModel)) {
      setSelectedComposerModel("Nexora Assistant");
    }
  }, [composerModels, selectedComposerModel]);

  const adaptiveCards = useMemo(() => buildAdaptivePrompts(threads), [threads]);
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const activeRunningAssistantMsg = useMemo(() => {
    if (!activeThread) return null;
    for (let i = activeThread.messages.length - 1; i >= 0; i -= 1) {
      const m = activeThread.messages[i];
      if (m.role === "assistant" && m.jobStatus === "running") {
        return m;
      }
    }
    return null;
  }, [activeThread]);

  const handleStopGeneration = useCallback(
    async (threadId: string, assistantMessageId: string, jobId?: string) => {
      cancelledMsgIdsRef.current.add(assistantMessageId);

      const localStream = activeJobStreamsRef.current.get(`local:${assistantMessageId}`);
      if (localStream) {
        localStream.abort();
        activeJobStreamsRef.current.delete(`local:${assistantMessageId}`);
      }

      if (jobId) {
        const activeStream = activeJobStreamsRef.current.get(jobId);
        if (activeStream) {
          activeStream.abort();
          activeJobStreamsRef.current.delete(jobId);
        }
        removePendingJob(jobId);
      }

      let stoppedThread: WorkspaceThread | null = null;
      let stoppedHadContent = false;
      setThreads((prev) => {
        const next = prev.map((t) => {
          if (t.id !== threadId) return t;
          const targetMsg = t.messages.find((m) => m.id === assistantMessageId);
          stoppedHadContent = Boolean(targetMsg?.content.trim());
          const updated: WorkspaceThread = {
            ...t,
            updatedAt: "Just now",
            messages: t.messages.map((m) =>
              m.id === assistantMessageId && m.jobStatus === "running"
                ? {
                    ...m,
                    content: m.content.trim() ? m.content : "Response stopped.",
                    thinkingLines: m.thinkingLines?.includes("Generation stopped")
                      ? m.thinkingLines
                      : [...(m.thinkingLines ?? []), "Generation stopped"],
                    jobStatus: "completed",
                  }
                : m
            ),
          };
          stoppedThread = updated;
          return updated;
        });
        persistThreadsLocally(next);
        return next;
      });

      if (!stoppedHadContent) {
        pendingAiTitlesRef.current.delete(threadId);
      }

      if (jobId && (typeof navigator === "undefined" || navigator.onLine)) {
        await fetch(`/api/chat/jobs/${encodeURIComponent(jobId)}/stop`, {
          method: "POST",
          headers: buildApiHeaders(),
        }).catch(() => {});
      }

      if (stoppedThread) {
        mirrorThreadToFirestore(stoppedThread);
      }
    },
    [buildApiHeaders, mirrorThreadToFirestore, persistThreadsLocally, removePendingJob]
  );

  const updateScrollToBottomVisibility = useCallback(() => {
    const el = chatScrollContainerRef.current;
    if (!el) {
      isUserScrolledUpRef.current = false;
      setShowScrollToBottom(false);
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 120;
    isUserScrolledUpRef.current = isUp;
    setShowScrollToBottom(isUp);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    isUserScrolledUpRef.current = false;
    setShowScrollToBottom(false);
    const el = chatScrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    if (activeView !== "chat" || !activeThread) {
      isUserScrolledUpRef.current = false;
      prevMsgCountRef.current = 0;
      prevThreadIdRef.current = null;
      setShowScrollToBottom(false);
      return;
    }

    const threadChanged = activeThread.id !== prevThreadIdRef.current;
    prevThreadIdRef.current = activeThread.id;
    const msgCount = activeThread.messages.length;
    const msgCountIncreased = msgCount > prevMsgCountRef.current;
    prevMsgCountRef.current = msgCount;
    if (threadChanged) {
      isUserScrolledUpRef.current = false;
    }

    if (
      settings.autoScroll &&
      scrollEndRef.current &&
      (threadChanged || msgCountIncreased || !isUserScrolledUpRef.current)
    ) {
      scrollEndRef.current.scrollIntoView({ behavior: threadChanged ? "auto" : "smooth" });
    }

    const raf = requestAnimationFrame(updateScrollToBottomVisibility);
    return () => cancelAnimationFrame(raf);
  }, [
    activeView,
    activeThread?.id,
    activeThread?.messages.length,
    activeThread?.messages[activeThread.messages.length - 1]?.content,
    activeThread?.messages[activeThread.messages.length - 1]?.reasoningText,
    settings.autoScroll,
    activeThread,
    updateScrollToBottomVisibility,
  ]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      setCollapsedSearchOpen(false);
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!collapsedSearchOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-collapsed-search]") &&
        !target.closest("[data-collapsed-search-trigger]")
      ) {
        setCollapsedSearchOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCollapsedSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [collapsedSearchOpen]);

  useEffect(() => {
    if (!settings.betaSelectionBar || activeView !== "chat" || !activeThread) {
      setSelectionBar(null);
      return;
    }

    const updateSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionBar(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) {
        setSelectionBar(null);
        return;
      }
      const anchorNode = sel.anchorNode;
      const anchorEl =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
      if (!anchorEl?.closest("[data-assistant-prose]")) {
        setSelectionBar(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setSelectionBar(null);
        return;
      }
      setSelectionBar({
        text,
        top: Math.max(64, rect.top - 42),
        left: Math.min(Math.max(24, rect.left + rect.width / 2), window.innerWidth - 150),
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-selection-bar]")) {
        setSelectionBar(null);
      }
    };

    document.addEventListener("mouseup", updateSelection);
    document.addEventListener("keyup", updateSelection);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("mouseup", updateSelection);
      document.removeEventListener("keyup", updateSelection);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [settings.betaSelectionBar, activeView, activeThread]);

  const focusPromptComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      const openBtn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Open prompt input"]'
      );
      if (openBtn && !openBtn.classList.contains("pointer-events-none")) {
        openBtn.click();
      }
      window.setTimeout(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Prompt"]'
        );
        textarea?.focus();
      }, 60);
    });
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveView("chat");
    setActiveThreadId(null);
    setDraft("");
    setCollapsedSearchOpen(false);
    setSelectionBar(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (loginModalOpen || lightboxGallery) return;

      const mod = (event.ctrlKey || event.metaKey) && !event.altKey;
      const key = event.key.toLowerCase();

      // Ctrl + N -> New chat
      if (mod && !event.shiftKey && key === "n") {
        event.preventDefault();
        handleNewChat();
        focusPromptComposer();
        return;
      }

      // Ctrl + K -> Quick search
      if (mod && !event.shiftKey && key === "k") {
        event.preventDefault();
        if (sidebarCollapsed || isMobile) {
          if (settingsRef.current.betaCommandSearch) {
            setCollapsedSearchOpen((open) => !open);
          } else {
            setSidebarCollapsed(false);
            setSidebarSearchTrigger((c) => c + 1);
          }
        } else {
          setSidebarSearchTrigger((c) => c + 1);
        }
        return;
      }

      // Ctrl + / -> Toggle sidebar
      if (mod && !event.shiftKey && (event.key === "/" || event.code === "Slash")) {
        event.preventDefault();
        setCollapsedSearchOpen(false);
        setSidebarCollapsed((prev) => !prev);
        return;
      }

      // Ctrl + , -> Toggle Settings
      if (mod && !event.shiftKey && (event.key === "," || event.code === "Comma")) {
        event.preventDefault();
        if (activeView === "settings") {
          setActiveView("chat");
        } else {
          openSettings("general");
        }
        return;
      }

      // Ctrl + Shift + L -> Toggle Dark / Light theme
      if (mod && event.shiftKey && key === "l") {
        event.preventDefault();
        handleUpdateSettings({ isDark: !settingsRef.current.isDark });
        return;
      }

      // Ctrl + . -> Stop active response generation
      if (mod && !event.shiftKey && (event.key === "." || event.code === "Period")) {
        if (activeThread && activeRunningAssistantMsg) {
          event.preventDefault();
          void handleStopGeneration(
            activeThread.id,
            activeRunningAssistantMsg.id,
            activeRunningAssistantMsg.jobId
          );
        }
        return;
      }

      // Shift + Esc -> Focus prompt composer
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.shiftKey &&
        event.key === "Escape"
      ) {
        event.preventDefault();
        setCollapsedSearchOpen(false);
        if (activeView !== "chat") {
          setActiveView("chat");
        }
        focusPromptComposer();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    activeRunningAssistantMsg,
    activeThread,
    activeView,
    focusPromptComposer,
    handleNewChat,
    handleStopGeneration,
    handleUpdateSettings,
    isMobile,
    lightboxGallery,
    loginModalOpen,
    sidebarCollapsed,
  ]);

  const handleSelectThread = (id: string) => {
    setActiveView("chat");
    setActiveThreadId(id);
    setCollapsedSearchOpen(false);
    setSelectionBar(null);
  };

  const handleSelectSearchTitle = (title: string) => {
    const matched = threads.find((t) => t.title === title);
    if (matched) {
      handleSelectThread(matched.id);
    } else {
      setCollapsedSearchOpen(false);
    }
  };

  const appendMessagePair = async (
    promptText: string,
    meta: { model: string; effort: string; attachments: File[] },
    options?: { forceNewThread?: boolean }
  ) => {
    const baseThread = options?.forceNewThread ? null : activeThread;
    const trimmed = promptText.trim();
    const timestamp = formatNowTime(settings.language);

    const encodedAttachments = await Promise.all(
      meta.attachments.map((file) => readFileAsAttachmentPayload(file))
    );
    const attachmentNames = meta.attachments.map((file) => file.name);
    const attachmentPreviews = encodedAttachments.map((a) => a.dataUrl);

    const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_u`;
    const assistantMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_a`;

    const userMsg: WorkspaceMessage = {
      id: userMsgId,
      role: "user",
      content:
        trimmed ||
        `Attached ${meta.attachments.length} image${meta.attachments.length > 1 ? "s" : ""}`,
      model: meta.model,
      effort: meta.effort,
      timestamp,
      attachmentNames,
      attachmentPreviews,
    };

    const useWebGpuLocal =
      meta.model === "Nexora Nano (Local)" ||
      (!isOnline && settings.localModelEnabled && localModelStatus === "ready");
    const isOfflineWithoutLocal = !isOnline && !useWebGpuLocal;

    const assistantMsg: WorkspaceMessage = isOfflineWithoutLocal
      ? {
          id: assistantMsgId,
          role: "assistant",
          content: runOfflineLocalAssistant(trimmed, {
            isLocalWebGpuReady:
              settings.localModelEnabled && localModelStatus === "ready",
            backend: settings.localBackend,
          }),
          model: meta.model,
          effort: meta.effort,
          timestamp,
          thinkingVariant: "Steps",
          thinkingLines: ["Served from offline workspace cache"],
          jobStatus: "completed",
        }
      : useWebGpuLocal
        ? {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            model: "Nexora Nano (Local)",
            effort: meta.effort,
            timestamp,
            thinkingVariant: "Steps",
            thinkingLines: ["Running on-device WebGPU (SmolLM2 360M)"],
            reasoningText: "",
            thinkingDurationMs: 0,
            jobStatus: "running",
          }
        : {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            model: meta.model,
            effort: meta.effort,
            timestamp,
            thinkingVariant: "Steps",
            thinkingLines: [`Connecting to ${meta.model}`],
            reasoningText: "",
            thinkingDurationMs: 0,
            jobStatus: "running",
          };

    const targetThreadId = baseThread?.id ?? `thread_${Date.now()}`;
    const isBrandNewThread = !baseThread;
    const titleSource = trimmed || attachmentNames[0] || "New chat";
    const computedTitle =
      baseThread?.title ??
      (titleSource.length > 34 ? `${titleSource.slice(0, 34).trim()}…` : titleSource);
    if (isBrandNewThread && !isOfflineWithoutLocal) {
      pendingAiTitlesRef.current.set(targetThreadId, {
        fallbackTitle: computedTitle,
        prompt: titleSource,
        model: meta.model,
      });
    }

    const historyTurns = (baseThread?.messages ?? [])
      .filter((m) => m.content.trim() && m.jobStatus !== "error")
      .slice(-16)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setActiveView("chat");
    setActiveThreadId(targetThreadId);

    let updatedThreadForFirestore: WorkspaceThread | null = null;

    setThreads((prev) => {
      const exists = prev.some((t) => t.id === targetThreadId);
      const next = exists
        ? prev.map((thread) => {
            if (thread.id !== targetThreadId) return thread;
            const upd: WorkspaceThread = {
              ...thread,
              updatedAt: "Just now",
              messages: [...thread.messages, userMsg, assistantMsg],
            };
            updatedThreadForFirestore = upd;
            return upd;
          })
        : (() => {
            const created: WorkspaceThread = {
              id: targetThreadId,
              title: computedTitle,
              updatedAt: "Just now",
              messages: [userMsg, assistantMsg],
            };
            updatedThreadForFirestore = created;
            return [created, ...prev];
          })();

      persistThreadsLocally(next);
      if (isOfflineWithoutLocal && navigator.onLine) {
        void pushThreadsToServer(next);
      }
      return next;
    });

    if (isOfflineWithoutLocal) {
      if (updatedThreadForFirestore) {
        mirrorThreadToFirestore(updatedThreadForFirestore);
      }
      playFeedbackTone(settings);
      return;
    }

    if (!notifiedMsgStatusRef.current.has(`${assistantMsgId}:start`)) {
      notifiedMsgStatusRef.current.add(`${assistantMsgId}:start`);
      notifyGenerationStatus(settingsRef.current, "start");
    }

    if (useWebGpuLocal) {
      if (encodedAttachments.length > 0) {
        pendingAiTitlesRef.current.delete(targetThreadId);
        const noticeText =
          "Nexora Nano (Local) is text-only and cannot view attached images. Switch to Nexora Assistant or a vision-capable BYOK model in the composer to analyze images.";
        let completedThread: WorkspaceThread | null = null;
        setThreads((prev) => {
          const next = prev.map((t) => {
            if (t.id !== targetThreadId) return t;
            const upd: WorkspaceThread = {
              ...t,
              updatedAt: "Just now",
              messages: t.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: noticeText,
                      thinkingLines: ["Skipped local inference (images attached)"],
                      jobStatus: "completed",
                    }
                  : m
              ),
            };
            completedThread = upd;
            return upd;
          });
          persistThreadsLocally(next);
          return next;
        });
        if (completedThread) {
          mirrorThreadToFirestore(completedThread);
        }
        notifyGenerationStatus(settingsRef.current, "complete");
        return;
      }

      const localKey = `local:${assistantMsgId}`;
      const localController = new AbortController();
      activeJobStreamsRef.current.set(localKey, localController);
      const localStartedAt = Date.now();
      let firstAnswerAt: number | null = null;

      try {
        let streamedText = "";
        let streamedThought = "";
        const cleanedResult = await streamLocalWebGpuChat({
          prompt: trimmed,
          history: historyTurns,
          language: settings.language,
          effort: meta.effort,
          signal: localController.signal,
          onProgress: ({ progress, text }) => {
            setLocalDownloadProgress(progress);
            setLocalStatusText(text);
          },
          onThought: (delta) => {
            streamedThought += delta;
            const elapsed = Math.max(100, Date.now() - localStartedAt);
            setThreads((prev) =>
              prev.map((t) =>
                t.id !== targetThreadId
                  ? t
                  : {
                      ...t,
                      updatedAt: "Just now",
                      messages: t.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              reasoningText: streamedThought,
                              thinkingDurationMs: elapsed,
                              thinkingVariant: "Reasoning",
                            }
                          : m
                      ),
                    }
              )
            );
          },
          onDelta: (delta) => {
            if (firstAnswerAt === null) {
              firstAnswerAt = Date.now();
            }
            streamedText += delta;
            const thoughtElapsed =
              streamedThought.trim().length > 0 && firstAnswerAt !== null
                ? Math.max(100, firstAnswerAt - localStartedAt)
                : undefined;
            setThreads((prev) =>
              prev.map((t) =>
                t.id !== targetThreadId
                  ? t
                  : {
                      ...t,
                      updatedAt: "Just now",
                      messages: t.messages.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: streamedText,
                              ...(thoughtElapsed !== undefined
                                ? { thinkingDurationMs: thoughtElapsed }
                                : {}),
                            }
                          : m
                      ),
                    }
              )
            );
          },
          onReplaceText: (cleaned) => {
            streamedText = cleaned;
            setThreads((prev) =>
              prev.map((t) =>
                t.id !== targetThreadId
                  ? t
                  : {
                      ...t,
                      updatedAt: "Just now",
                      messages: t.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, content: cleaned } : m
                      ),
                    }
              )
            );
          },
        });

        const effectiveText = cleanedResult || streamedText;
        const wasStopped =
          localController.signal.aborted || cancelledMsgIdsRef.current.has(assistantMsgId);
        cancelledMsgIdsRef.current.delete(assistantMsgId);
        const finalContent = effectiveText.trim()
          ? effectiveText
          : wasStopped
            ? "Response stopped."
            : "No response generated locally.";
        const finalDurationMs =
          streamedThought.trim().length > 0 && firstAnswerAt !== null
            ? Math.max(100, firstAnswerAt - localStartedAt)
            : Math.max(100, Date.now() - localStartedAt);

        let completedThread: WorkspaceThread | null = null;
        setThreads((prev) => {
          const next = prev.map((t) => {
            if (t.id !== targetThreadId) return t;
            const upd: WorkspaceThread = {
              ...t,
              updatedAt: "Just now",
              messages: t.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: finalContent,
                      reasoningText: streamedThought || m.reasoningText,
                      thinkingDurationMs: finalDurationMs,
                      thinkingVariant: streamedThought.trim() ? "Reasoning" : "Steps",
                      thinkingLines: [
                        "Ran on-device WebGPU (SmolLM2 360M)",
                        wasStopped ? "Generation stopped" : "Response completed",
                      ],
                      jobStatus: "completed",
                    }
                  : m
              ),
            };
            completedThread = upd;
            return upd;
          });
          persistThreadsLocally(next);
          if (navigator.onLine) {
            void pushThreadsToServer(next);
          }
          return next;
        });

        if (completedThread) {
          mirrorThreadToFirestore(completedThread);
        }
        if (!wasStopped) {
          if (!notifiedMsgStatusRef.current.has(`${assistantMsgId}:complete`)) {
            notifiedMsgStatusRef.current.add(`${assistantMsgId}:complete`);
            notifyGenerationStatus(settingsRef.current, "complete");
          }
          const pendingTitle = pendingAiTitlesRef.current.get(targetThreadId);
          if (pendingTitle && streamedText.trim()) {
            pendingAiTitlesRef.current.delete(targetThreadId);
            void requestAiThreadTitle(
              targetThreadId,
              pendingTitle.fallbackTitle,
              pendingTitle.prompt,
              streamedText,
              pendingTitle.model
            );
          }
        } else if (!streamedText.trim()) {
          pendingAiTitlesRef.current.delete(targetThreadId);
        }
      } catch (err) {
        pendingAiTitlesRef.current.delete(targetThreadId);
        if (!localController.signal.aborted) {
          const notifyKey = `${assistantMsgId}:error`;
          if (!notifiedMsgStatusRef.current.has(notifyKey)) {
            notifiedMsgStatusRef.current.add(notifyKey);
            notifyGenerationStatus(settingsRef.current, "error");
          }
        }
        const message =
          err instanceof Error
            ? err.message
            : "Local WebGPU inference failed in this browser.";
        setLocalError(message);
        let erroredThread: WorkspaceThread | null = null;
        setThreads((prev) => {
          const next = prev.map((t) => {
            if (t.id !== targetThreadId) return t;
            const upd: WorkspaceThread = {
              ...t,
              messages: t.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: message,
                      jobStatus: "error" as const,
                      errorMessage: message,
                    }
                  : m
              ),
            };
            erroredThread = upd;
            return upd;
          });
          persistThreadsLocally(next);
          if (navigator.onLine) {
            void pushThreadsToServer(next);
          }
          return next;
        });
        if (erroredThread) {
          mirrorThreadToFirestore(erroredThread);
        }
      } finally {
        activeJobStreamsRef.current.delete(localKey);
      }
      return;
    }

    try {
      const res = await fetch("/api/chat/jobs", {
        method: "POST",
        headers: buildApiHeaders(),
        body: JSON.stringify({
          threadId: targetThreadId,
          threadTitle: computedTitle,
          userMessage: userMsg,
          assistantMessageId: assistantMsgId,
          model: meta.model,
          effort: meta.effort,
          prompt: trimmed,
          history: historyTurns,
          attachments: encodedAttachments.map((a) => ({
            mimeType: a.mimeType,
            base64Data: a.base64Data,
          })),
          byok: resolveByokForModel(byokRef.current, meta.model),
          language: settings.language,
        }),
      });

      const payload = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !payload.jobId) {
        throw new Error(payload.error || "Unable to start generation job.");
      }

      const jobId = payload.jobId;
      if (cancelledMsgIdsRef.current.has(assistantMsgId)) {
        cancelledMsgIdsRef.current.delete(assistantMsgId);
        void fetch(`/api/chat/jobs/${encodeURIComponent(jobId)}/stop`, {
          method: "POST",
          headers: buildApiHeaders(),
        }).catch(() => {});
        return;
      }

      addPendingJob({
        jobId,
        threadId: targetThreadId,
        assistantMessageId: assistantMsgId,
      });

      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id !== targetThreadId
            ? t
            : {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, jobId } : m
                ),
              }
        );
        persistThreadsLocally(next);
        return next;
      });

      void subscribeToJobStream(jobId, targetThreadId, assistantMsgId);
    } catch (err) {
      pendingAiTitlesRef.current.delete(targetThreadId);
      const notifyKey = `${assistantMsgId}:error`;
      if (!notifiedMsgStatusRef.current.has(notifyKey)) {
        notifiedMsgStatusRef.current.add(notifyKey);
        notifyGenerationStatus(settingsRef.current, "error");
      }
      const fallbackText =
        err instanceof Error
          ? err.message
          : "Network request failed. Cached message remains on device.";
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id !== targetThreadId
            ? t
            : {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: fallbackText,
                        jobStatus: "error" as const,
                        errorMessage: fallbackText,
                      }
                    : m
                ),
              }
        );
        persistThreadsLocally(next);
        return next;
      });
    }
  };

  return (
    <>
      {activeView === "landing" ? (
        <LandingPage
          isDark={settings.isDark}
          onToggleTheme={() => handleUpdateSettings({ isDark: !settings.isDark })}
          isOnline={isOnline}
          currentUser={currentUser}
          threadsCount={threads.length}
          composerModels={composerModels}
          selectedComposerModel={selectedComposerModel}
          onSelectedComposerModelChange={setSelectedComposerModel}
          selectedEffort={selectedEffort}
          onSelectedEffortChange={setSelectedEffort}
          onOpenWorkspace={() => {
            setActiveView("chat");
          }}
          onSubmitPrompt={(val, meta) => {
            setActiveThreadId(null);
            void appendMessagePair(val, meta, { forceNewThread: true });
          }}
          onOpenAuth={() => setLoginModalOpen(true)}
          onOpenSettings={(tab) => openSettings(tab ?? "general")}
        />
      ) : (
        <div className="flex h-dvh w-full overflow-hidden bg-canvas text-ink">
          {/* Collapsible SidebarNav (Popup overlay on phone) */}
          <SidebarNav
        fill
        isMobile={isMobile}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        searchTrigger={sidebarSearchTrigger}
        activeThreadId={activeThread?.id ?? null}
        activeTitle={activeThread?.title ?? null}
        onNewChat={handleNewChat}
        onPick={(id) => handleSelectThread(id)}
        recents={threads.map((t) => ({
          id: t.id,
          label: t.title,
          pinned: Boolean(t.pinned),
          folderId: t.folderId ?? null,
        }))}
        folders={folders}
        onCreateFolder={(name) => {
          void handleCreateFolder(name);
        }}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onTogglePin={handleTogglePinThread}
        currentUser={currentUser}
        onOpenAuth={() => setLoginModalOpen(true)}
        onSignOut={() => void handleSignOut()}
        isDark={settings.isDark}
        onToggleTheme={() => handleUpdateSettings({ isDark: !settings.isDark })}
        onOpenSettings={() => openSettings("general")}
      />

      {/* Main Workspace Area (clean inset rounded frame on desktop) */}
      <WorkspaceStageContext.Provider value={workspaceStageValue}>
        <div
          ref={setWorkspaceStageEl}
          className={`relative flex min-w-0 flex-1 flex-col overflow-hidden bg-page md:my-2 md:mr-2 md:rounded-[16px] md:border md:border-line md:shadow-xs ${
            sidebarCollapsed ? "md:ml-2" : ""
          }`}
        >
        {/* Top-left floating bar when sidebar is closed */}
        {(sidebarCollapsed || isMobile) && (
          <div
            className="pointer-events-none absolute top-2.5 left-4 z-30 flex flex-col items-start gap-2.5"
            style={{ animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both" }}
          >
            <div className="pointer-events-auto flex items-center gap-3">
              <button
                type="button"
                onClick={handleNewChat}
                aria-label="Nexora home"
                className="flex size-8 items-center justify-center rounded-lg text-ink transition-opacity hover:opacity-80"
              >
                <NexoraLogo size={20} />
              </button>

              <div className="flex items-center gap-0.5 rounded-full bg-surface p-1 shadow-card">
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedSearchOpen(false);
                    setSidebarCollapsed(false);
                  }}
                  aria-label="Open sidebar"
                  title="Open sidebar"
                  className="flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink"
                >
                  <IconSidebarLeftArrow size={16} direction="right" />
                </button>
                <button
                  type="button"
                  data-collapsed-search-trigger
                  aria-expanded={collapsedSearchOpen}
                  onClick={() => {
                    if (settings.betaCommandSearch) {
                      setCollapsedSearchOpen((open) => !open);
                    } else {
                      setSidebarCollapsed(false);
                      setSidebarSearchTrigger((c) => c + 1);
                    }
                  }}
                  aria-label="Search chats"
                  title="Search chats"
                  className={`flex size-7 items-center justify-center rounded-full transition-colors ${
                    collapsedSearchOpen
                      ? "bg-hover-2 text-ink"
                      : "text-ink-2 hover:bg-hover-2 hover:text-ink"
                  }`}
                >
                  <IconMagnifyingGlass size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleNewChat}
                  aria-label="New chat"
                  title="New chat"
                  className="flex size-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink"
                >
                  <NewChatBubbleIcon />
                </button>
              </div>
            </div>

            {collapsedSearchOpen && settings.betaCommandSearch && (
              <div
                data-collapsed-search
                className="w-72"
                style={{
                  animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
                  transformOrigin: "top left",
                }}
              >
                <SearchList
                  autoFocus
                  items={threads.map((t) => t.title)}
                  labels={{
                    placeholder: "Search chats…",
                    ariaLabel: "Search chats",
                    emptyTitle: threads.length === 0 ? "No chats yet" : "No results found",
                    emptyHint:
                      threads.length === 0
                        ? "Start a conversation to search history"
                        : "Adjust your search to try again",
                  }}
                  onSelect={handleSelectSearchTitle}
                />
              </div>
            )}
          </div>
        )}

        {/* Top Bar for active threads or Settings */}
        {(activeThread || activeView === "settings") && (
          <header
            className={`flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-page px-4 sm:gap-6 sm:px-5 ${
              sidebarCollapsed || isMobile ? "pl-40 sm:pl-44" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span
                className={`shrink-0 whitespace-nowrap font-medium text-ink-2 ${
                  sidebarCollapsed || isMobile ? "hidden sm:inline" : ""
                }`}
              >
                Nexora
              </span>
              <span
                aria-hidden="true"
                className={`text-ink-3 ${sidebarCollapsed || isMobile ? "hidden sm:inline" : ""}`}
              >
                /
              </span>
              {activeView === "settings" ? (
                <span className="max-w-[180px] truncate font-medium text-ink sm:max-w-[420px]">
                  Settings
                </span>
              ) : activeThread ? (
                <ChatTitleMenu
                  thread={activeThread}
                  folders={folders}
                  onRename={(newTitle) => handleRenameThread(activeThread.id, newTitle)}
                  onTogglePin={() => handleTogglePinThread(activeThread.id)}
                  onMoveToFolder={(folderId) =>
                    handleMoveThreadToFolder(activeThread.id, folderId)
                  }
                  onCreateFolderAndMove={(folderName) => {
                    const created = handleCreateFolder(folderName);
                    if (created) {
                      handleMoveThreadToFolder(activeThread.id, created.id);
                    }
                  }}
                  onExportPdf={() => void handleExportThreadPdf(activeThread)}
                  onDelete={() => handleDeleteThread(activeThread.id)}
                />
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {!isOnline && (
                <span className="flex items-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-inset px-2.5 py-1 text-[11.5px] font-medium text-ink-2">
                  <WifiOff className="size-3.5 text-ink-3" />
                  <span className="hidden sm:inline">Offline cache</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setActiveView("landing")}
                className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
              >
                Overview
              </button>
              <PWAInstallButton />
            </div>
          </header>
        )}

        {/* Workspace Viewport */}
        {activeView === "settings" ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SettingsView
              key={settingsTabKey}
              initialTab={settingsTab}
              currentUser={currentUser}
              authProviderLabel={authProviderLabel}
              onOpenAuth={() => setLoginModalOpen(true)}
              onSignOut={handleSignOut}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              byok={byok}
              onUpdateByok={handleUpdateByok}
              threadCount={threads.length}
              onExportAllChats={handleExportAllChats}
              onClearAllChats={handleClearAllChats}
              onTestSound={() => playFeedbackTone(settings, true)}
              onSyncNow={handleSyncNow}
              localModelStatus={localModelStatus}
              localDownloadProgress={localDownloadProgress}
              localStatusText={localStatusText}
              localError={localError}
              onDownloadLocalModel={handleDownloadLocalModel}
              onClearLocalModel={handleClearLocalModel}
              onUseLocalModel={() => {
                setSelectedComposerModel("Nexora Nano (Local)");
                setActiveView("chat");
              }}
            />
          </main>
        ) : !activeThread ? (
          <main className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10 pt-16 sm:px-8 sm:py-10">
            <div className="absolute right-5 top-3.5 flex items-center gap-2">
              {!isOnline && (
                <span className="flex items-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-inset px-2.5 py-1 text-[11.5px] font-medium text-ink-2">
                  <WifiOff className="size-3.5 text-ink-3" />
                  <span>Offline cache</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setActiveView("landing")}
                className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
              >
                Overview
              </button>
              <PWAInstallButton />
            </div>

            <div className="flex w-full max-w-2xl flex-col items-center">
              <div className="mb-7 flex items-center justify-center gap-3 text-center">
                <NexoraLogo size={28} className="shrink-0 text-ink" />
                <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[26px]">
                  Hi. What can I help with?
                </h1>
              </div>

              <div className="flex w-full justify-center">
                <PromptInput
                  value={draft}
                  onChange={setDraft}
                  onSubmit={(val, meta) => void appendMessagePair(val, meta)}
                  models={composerModels}
                  selectedModel={selectedComposerModel}
                  onSelectedModelChange={setSelectedComposerModel}
                  selectedEffort={selectedEffort}
                  onSelectedEffortChange={setSelectedEffort}
                  onAddModels={() => openSettings("models")}
                  sendOnEnter={settings.sendOnEnter}
                  voiceAutoSubmit={settings.voiceAutoSubmit}
                  showVoiceWave={settings.betaVoiceWave}
                  placeholder="Ask anything"
                  className="mx-auto"
                />
              </div>

              {/* Adaptive Cards — Hidden for first-time users with 0 chats */}
              {adaptiveCards.length > 0 && (
                <div className="mt-10 grid w-full max-w-[540px] grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {adaptiveCards.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => {
                        if (item.threadId) {
                          handleSelectThread(item.threadId);
                        } else {
                          setDraft(item.prompt);
                        }
                      }}
                      className="group flex flex-col items-start justify-between rounded-card bg-surface p-3.5 text-left shadow-card transition-colors duration-150 hover:bg-hover"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate whitespace-nowrap text-xs font-semibold text-ink">
                          {item.title}
                        </span>
                        <ArrowUpRight className="size-3.5 shrink-0 text-ink-3 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                      </div>
                      <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-2">
                        {item.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </main>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            <main
              ref={chatScrollContainerRef}
              onScroll={updateScrollToBottomVisibility}
              className="flex-1 overflow-y-auto px-4 pb-44 pt-8 sm:px-8"
            >
              <div
                className={`mx-auto flex w-full max-w-2xl flex-col ${
                  settings.density === "compact" ? "gap-4" : "gap-6"
                }`}
              >
                {activeThread.messages.map((msg) => {
                  const isUser = msg.role === "user";
                  return (
                    <article
                      key={msg.id}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      {isUser ? (
                        <div
                          className={`max-w-[85%] rounded-2xl bg-surface text-ink shadow-card ${
                            settings.density === "compact" ? "px-3.5 py-2" : "px-4 py-3"
                          } ${
                            settings.fontScale === "large"
                              ? "text-[15px] leading-relaxed"
                              : "text-sm leading-relaxed"
                          }`}
                        >
                          {msg.attachmentPreviews && msg.attachmentPreviews.length > 0 && (
                            <div className="mb-2.5 flex flex-wrap gap-2">
                              {msg.attachmentPreviews.map((src, idx) => (
                                <button
                                  key={`${msg.id}-att-${idx}`}
                                  type="button"
                                  onClick={() =>
                                    setLightboxGallery({
                                      images: (msg.attachmentPreviews ?? []).map((url, i) => ({
                                        src: url,
                                        alt:
                                          msg.attachmentNames?.[i] ||
                                          `Image ${i + 1}`,
                                      })),
                                      initialIndex: idx,
                                    })
                                  }
                                  className="overflow-hidden rounded-lg border border-line transition-transform hover:scale-[1.03] focus:outline-none"
                                >
                                  <img
                                    src={src}
                                    alt={msg.attachmentNames?.[idx] || "Attachment"}
                                    className="size-20 cursor-zoom-in object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ) : (
                        <AssistantMessageBlock
                          msg={msg}
                          fontScale={settings.fontScale}
                          isDark={settings.isDark}
                          showTraces={settings.betaTraces}
                          speechVolume={settings.volume}
                          onOpenSettings={openSettings}
                          onStop={
                            msg.jobStatus === "running"
                              ? () => void handleStopGeneration(activeThread.id, msg.id, msg.jobId)
                              : undefined
                          }
                        />
                      )}

                      <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] tabular-nums text-ink-3">
                        <span>{isUser ? currentUser?.name ?? "You" : "Nexora"}</span>
                        {msg.model && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{msg.model}</span>
                          </>
                        )}
                        {msg.effort && isUser && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{msg.effort}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{msg.timestamp}</span>
                      </div>
                    </article>
                  );
                })}
                <div ref={scrollEndRef} />
              </div>
            </main>

            {/* Beta Inline Selection Actions Bar */}
            {settings.betaSelectionBar && selectionBar && (
              <div
                data-selection-bar
                style={{
                  top: selectionBar.top,
                  left: selectionBar.left,
                  transform: "translateX(-50%)",
                }}
                className="fixed z-40 flex items-center gap-0.5 rounded-[10px] border border-line bg-surface p-1 shadow-overlay"
              >
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(selectionBar.text).catch(() => {});
                    setSelectionBar(null);
                  }}
                  className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((prev) =>
                      prev.trim()
                        ? `${prev}\n\n> ${selectionBar.text}`
                        : `> ${selectionBar.text}\n\n`
                    );
                    setSelectionBar(null);
                  }}
                  className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink"
                >
                  Quote
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(`Explain this part in detail:\n> ${selectionBar.text}\n\n`);
                    setSelectionBar(null);
                  }}
                  className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors hover:bg-hover-2"
                >
                  Ask follow-up
                </button>
              </div>
            )}

            {/* Bottom Floating PromptInput */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-6 pt-2">
              {showScrollToBottom && (
                <div className="mb-2.5 flex justify-center">
                  <button
                    type="button"
                    onClick={handleScrollToBottom}
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                    className="pointer-events-auto flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-2 shadow-raised transition-all duration-150 hover:bg-hover hover:text-ink active:scale-95"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </div>
              )}
              <div className="flex w-full justify-center">
                <PromptInput
                  value={draft}
                  onChange={setDraft}
                  onSubmit={(val, meta) => void appendMessagePair(val, meta)}
                  models={composerModels}
                  selectedModel={selectedComposerModel}
                  onSelectedModelChange={setSelectedComposerModel}
                  selectedEffort={selectedEffort}
                  onSelectedEffortChange={setSelectedEffort}
                  onAddModels={() => openSettings("models")}
                  sendOnEnter={settings.sendOnEnter}
                  voiceAutoSubmit={settings.voiceAutoSubmit}
                  showVoiceWave={settings.betaVoiceWave}
                  isGenerating={Boolean(activeRunningAssistantMsg)}
                  onStop={() => {
                    if (activeThread && activeRunningAssistantMsg) {
                      void handleStopGeneration(
                        activeThread.id,
                        activeRunningAssistantMsg.id,
                        activeRunningAssistantMsg.jobId
                      );
                    }
                  }}
                  placeholder="Ask anything"
                  className="pointer-events-auto mx-auto"
                />
              </div>
            </div>
          </div>
        )}
        </div>
      </WorkspaceStageContext.Provider>
        </div>
      )}

      {/* Centered Login Modal (Google Firebase Auth + Built-in Email Auth) */}
      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onEmailRegister={handleEmailRegister}
      />

      {/* Horizontal Image Lightbox Gallery */}
      {lightboxGallery && (
        <ImageLightboxGallery
          images={lightboxGallery.images}
          initialIndex={lightboxGallery.initialIndex}
          onClose={() => setLightboxGallery(null)}
        />
      )}
    </>
  );
}

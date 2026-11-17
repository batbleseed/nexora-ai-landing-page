import type { ThinkingVariant } from "../components/ThinkingState";

export interface WorkspaceCodeAttachment {
  filename: string;
  lines: string[];
}

export interface SourceLink {
  title: string;
  url: string;
}

export interface WorkspaceMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  effort?: string;
  timestamp: string;
  attachmentNames?: string[];
  attachmentPreviews?: string[];
  thinkingVariant?: ThinkingVariant;
  thinkingLines?: string[];
  reasoningText?: string;
  thinkingDurationMs?: number;
  sources?: SourceLink[];
  jobId?: string;
  jobStatus?: "running" | "completed" | "error";
  errorMessage?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  createdAt?: number;
}

export interface WorkspaceThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: WorkspaceMessage[];
  pinned?: boolean;
  folderId?: string | null;
}

export interface AdaptivePromptCard {
  title: string;
  prompt: string;
  threadId?: string;
}

// Empty by default — zero fake chat history
export const INITIAL_THREADS: WorkspaceThread[] = [];

/**
 * First-time users (no chat history) see zero suggestion cards.
 * Once the user starts chatting, Nexora adapts quick-start cards
 * from their actual past topics and questions.
 */
export function buildAdaptivePrompts(threads: WorkspaceThread[]): AdaptivePromptCard[] {
  if (threads.length === 0) return [];

  const cards: AdaptivePromptCard[] = [];
  const seen = new Set<string>();

  for (const thread of threads) {
    const lastUser = [...thread.messages].reverse().find((m) => m.role === "user");
    const topic = thread.title.trim();
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());

    cards.push({
      title: `Continue: ${topic}`,
      prompt: lastUser
        ? `Follow up on: ${lastUser.content.slice(0, 90)}`
        : `Continue our discussion about ${topic}`,
      threadId: thread.id,
    });

    if (cards.length >= 4) break;
  }

  return cards;
}

export function extractCodeBlocks(markdown: string): {
  prose: string;
  codeBlocks: WorkspaceCodeAttachment[];
} {
  const codeBlocks: WorkspaceCodeAttachment[] = [];
  const regex = /```([a-zA-Z0-9_.-]*)\n([\s\S]*?)```/g;
  const prose = markdown.replace(regex, (_match, lang: string, body: string) => {
    const cleanLang = (lang || "snippet").trim();
    const ext =
      cleanLang === "typescript" || cleanLang === "ts"
        ? "snippet.ts"
        : cleanLang === "javascript" || cleanLang === "js"
          ? "snippet.js"
          : cleanLang === "python" || cleanLang === "py"
            ? "script.py"
            : cleanLang === "json"
              ? "data.json"
              : `${cleanLang || "code"}.txt`;
    codeBlocks.push({
      filename: ext,
      lines: body.replace(/\n$/, "").split("\n"),
    });
    return "";
  });

  return {
    prose: prose.replace(/\n{3,}/g, "\n\n").trim(),
    codeBlocks,
  };
}

export function runOfflineLocalAssistant(
  prompt: string,
  opts: { isLocalWebGpuReady: boolean; backend: "webgpu" | "cpu" }
): string {
  const clean = prompt.trim();
  const modeLabel = opts.isLocalWebGpuReady
    ? `Nexora Nano (${opts.backend.toUpperCase()})`
    : "Nexora Offline Cache";

  if (!clean) {
    return `${modeLabel} is ready offline. Type a question or reconnect to stream from cloud or BYOK models.`;
  }

  return (
    `[${modeLabel} — Offline Mode]\n\n` +
    `Your prompt ("${clean.slice(0, 140)}${clean.length > 140 ? "…" : ""}") was handled locally without an active network connection. ` +
    (opts.isLocalWebGpuReady
      ? `On-device 300 MB WebGPU cache is active; reconnect anytime to sync this thread and switch to cloud/BYOK models.`
      : `Enable and download the 300 MB WebGPU model in Settings → Beta for on-device inference, or reconnect to stream from Nexora Assistant / BYOK providers.`)
  );
}

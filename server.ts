import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), ".nexora-data");
const STORE_PATH = path.join(DATA_DIR, "workspace.json");
const MAX_SETTINGS_BYTES = 64 * 1024; // 64 KB cap for synced settings JSON

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
}

export interface StoredSession {
  token: string;
  userId: string;
  createdAt: number;
}

export interface StoredSource {
  title: string;
  url: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  effort?: string;
  timestamp: string;
  attachmentNames?: string[];
  attachmentPreviews?: string[];
  thinkingVariant?: "Steps" | "Reasoning" | "Search" | "Coding";
  thinkingLines?: string[];
  reasoningText?: string;
  thinkingDurationMs?: number;
  sources?: StoredSource[];
  jobId?: string;
  jobStatus?: "running" | "completed" | "error";
  errorMessage?: string;
}

export interface StoredFolder {
  id: string;
  name: string;
  createdAt?: number;
}

export interface StoredThread {
  id: string;
  title: string;
  updatedAt: string;
  messages: StoredMessage[];
  pinned?: boolean;
  folderId?: string | null;
}

export interface WorkspaceSnapshot {
  threads: StoredThread[];
  folders?: StoredFolder[];
  settings: Record<string, unknown>;
}

export interface ChatJob {
  id: string;
  ownerKey: string;
  threadId: string;
  assistantMessageId: string;
  model: string;
  effort: string;
  status: "running" | "completed" | "error";
  text: string;
  thinkingLines: string[];
  reasoningText: string;
  thinkingDurationMs: number;
  sources: StoredSource[];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoreFile {
  users: Record<string, StoredUser>;
  sessions: Record<string, StoredSession>;
  workspaces: Record<string, WorkspaceSnapshot>;
  jobs: Record<string, ChatJob>;
}

const store: StoreFile = {
  users: {},
  sessions: {},
  workspaces: {},
  jobs: {},
};

const jobListeners = new Map<string, Set<(job: ChatJob) => void>>();
const jobControllers = new Map<string, AbortController>();
const stoppedJobIds = new Set<string>();
let writeQueue: Promise<void> = Promise.resolve();

async function loadStore(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    if (parsed.users) store.users = parsed.users;
    if (parsed.sessions) store.sessions = parsed.sessions;
    if (parsed.workspaces) store.workspaces = parsed.workspaces;
    if (parsed.jobs) {
      // Any jobs left "running" across a full server process restart are marked interrupted cleanly
      for (const [id, job] of Object.entries(parsed.jobs)) {
        if (job.status === "running") {
          job.status = job.text ? "completed" : "error";
          if (!job.text) {
            job.errorMessage = "Server restarted before generation completed.";
          }
        }
        store.jobs[id] = job;
      }
    }
  } catch {
    // First boot — empty store
  }
}

function persistStore(): Promise<void> {
  const snapshot = JSON.stringify(store);
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${STORE_PATH}.tmp`;
      await fs.writeFile(tmp, snapshot, "utf8");
      await fs.rename(tmp, STORE_PATH);
    })
    .catch((err) => {
      console.error("Failed to persist Nexora workspace store:", err);
    });
  return writeQueue;
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, actualSalt, 64).toString("hex");
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function getAuthenticatedUser(req: Request): StoredUser | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const session = store.sessions[token];
  if (!session) return null;
  return store.users[session.userId] ?? null;
}

function getOwnerKey(req: Request): string {
  const user = getAuthenticatedUser(req);
  if (user) return `user:${user.id}`;
  const rawGuest = String(req.headers["x-workspace-id"] || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  return `guest:${rawGuest || "default"}`;
}

function getOrCreateWorkspace(ownerKey: string): WorkspaceSnapshot {
  if (!store.workspaces[ownerKey]) {
    store.workspaces[ownerKey] = { threads: [], folders: [], settings: {} };
  } else if (!Array.isArray(store.workspaces[ownerKey].folders)) {
    store.workspaces[ownerKey].folders = [];
  }
  return store.workspaces[ownerKey];
}

function notifyJobListeners(job: ChatJob) {
  const listeners = jobListeners.get(job.id);
  if (!listeners) return;
  for (const fn of listeners) {
    fn(job);
  }
}

function syncJobIntoWorkspaceThread(job: ChatJob) {
  const ws = getOrCreateWorkspace(job.ownerKey);
  const thread = ws.threads.find((t) => t.id === job.threadId);
  if (!thread) return;
  const msg = thread.messages.find((m) => m.id === job.assistantMessageId);
  if (!msg) return;
  msg.content = job.text;
  msg.jobStatus = job.status;
  msg.thinkingLines = job.thinkingLines;
  msg.reasoningText = job.reasoningText || undefined;
  msg.thinkingDurationMs = job.thinkingDurationMs;
  msg.thinkingVariant = job.reasoningText ? "Reasoning" : "Steps";
  msg.sources = job.sources.length > 0 ? job.sources : undefined;
  if (job.errorMessage) {
    msg.errorMessage = job.errorMessage;
  }
}

function finalizeStoppedJob(job: ChatJob) {
  if (job.status !== "running") return;
  job.status = "completed";
  if (!job.text.trim()) {
    job.text = "Response stopped.";
  }
  if (job.thinkingDurationMs <= 0) {
    job.thinkingDurationMs = Math.max(100, Date.now() - job.createdAt);
  }
  if (!job.thinkingLines.includes("Generation stopped")) {
    job.thinkingLines = [...job.thinkingLines, "Generation stopped"];
  }
  job.updatedAt = Date.now();
  syncJobIntoWorkspaceThread(job);
  notifyJobListeners(job);
}

interface SavedByokModelServer {
  id?: string;
  preset?: string;
  baseUrl?: string;
  apiKey?: string;
}

interface ByokConfig {
  preset?: string;
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
  selectedModels?: string[];
  savedModels?: SavedByokModelServer[];
}

function resolveByokConfig(byok: ByokConfig, model: string): ByokConfig {
  const saved = Array.isArray(byok.savedModels) ? byok.savedModels : [];
  const match = saved.find((m) => (m.id || "").trim() === model.trim());
  if (match) {
    return {
      preset: match.preset ?? byok.preset,
      baseUrl: match.baseUrl ?? byok.baseUrl,
      apiKey: match.apiKey ?? byok.apiKey,
      modelId: match.id,
      selectedModels: match.id ? [match.id] : byok.selectedModels,
    };
  }
  if (!byok.baseUrl && saved.length > 0 && saved[0]) {
    const first = saved[0];
    return {
      preset: first.preset,
      baseUrl: first.baseUrl,
      apiKey: first.apiKey,
      modelId: first.id,
      selectedModels: first.id ? [first.id] : [],
    };
  }
  return byok;
}

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

interface AttachmentPayload {
  mimeType: string;
  base64Data: string;
}

function createThinkTagSplitter(
  onThought: (delta: string) => void,
  onChunk: (delta: string) => void
) {
  let inThink = false;
  let pending = "";

  const process = (chunk: string) => {
    pending += chunk;
    while (pending.length > 0) {
      if (!inThink) {
        const openIdx = pending.indexOf("<think>");
        if (openIdx !== -1) {
          if (openIdx > 0) onChunk(pending.slice(0, openIdx));
          pending = pending.slice(openIdx + 7);
          inThink = true;
          continue;
        }
        const partialIdx = pending.lastIndexOf("<");
        if (partialIdx !== -1 && "<think>".startsWith(pending.slice(partialIdx))) {
          if (partialIdx > 0) onChunk(pending.slice(0, partialIdx));
          pending = pending.slice(partialIdx);
          return;
        }
        onChunk(pending);
        pending = "";
      } else {
        const closeIdx = pending.indexOf("</think>");
        if (closeIdx !== -1) {
          if (closeIdx > 0) onThought(pending.slice(0, closeIdx));
          pending = pending.slice(closeIdx + 8);
          inThink = false;
          continue;
        }
        const partialIdx = pending.lastIndexOf("<");
        if (partialIdx !== -1 && "</think>".startsWith(pending.slice(partialIdx))) {
          if (partialIdx > 0) onThought(pending.slice(0, partialIdx));
          pending = pending.slice(partialIdx);
          return;
        }
        onThought(pending);
        pending = "";
      }
    }
  };

  const flush = () => {
    if (!pending) return;
    if (inThink) {
      onThought(pending);
    } else {
      onChunk(pending);
    }
    pending = "";
  };

  return { process, flush };
}

function isSafeExternalUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "::1" ||
      host === "[::1]" ||
      /^0\./.test(host) ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^\[?(fc|fd|fe80)/i.test(host)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>)"'\]]+/gi) ?? [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]]+$/, "");
    const parsed = isSafeExternalUrl(cleaned);
    if (!parsed) continue;
    const normalized = parsed.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      valid.push(normalized);
    }
    if (valid.length >= 5) break;
  }
  return valid;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec) || 32));
}

function htmlToReadableText(html: string, fallbackTitle: string): {
  title: string;
  text: string;
} {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const metaDescMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i.exec(html) ||
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i.exec(html);

  const title =
    decodeHtmlEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim()) ||
    fallbackTitle;
  const description = decodeHtmlEntities(
    (metaDescMatch?.[1] ?? "").replace(/\s+/g, " ").trim()
  );

  const bodyOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<(li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const cleanLines = decodeHtmlEntities(bodyOnly)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  const joined = cleanLines.join("\n").slice(0, 10000);
  const combined = description ? `Description: ${description}\n\n${joined}` : joined;
  return { title, text: combined.slice(0, 10500) };
}

async function fetchWebPageContent(
  rawUrl: string,
  signal?: AbortSignal
): Promise<{ url: string; title: string; content: string }> {
  const parsed = isSafeExternalUrl(rawUrl);
  if (!parsed) {
    throw new Error("Blocked or invalid external URL.");
  }
  const timeoutSignal = AbortSignal.timeout(10_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(parsed.toString(), {
    signal: combinedSignal,
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NexoraAssistant/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${parsed.hostname}`);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const rawBody = (await res.text()).slice(0, 350_000);

  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const parsedHtml = htmlToReadableText(rawBody, parsed.hostname);
    return {
      url: res.url || parsed.toString(),
      title: parsedHtml.title,
      content: parsedHtml.text || "(Page returned no readable text.)",
    };
  }

  return {
    url: res.url || parsed.toString(),
    title: parsed.hostname,
    content: rawBody.slice(0, 10_000),
  };
}

async function searchWebInfo(
  searchQuery: string,
  signal?: AbortSignal
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const cleanQuery = searchQuery.trim();
  if (!cleanQuery) return [];

  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const timeoutSignal = AbortSignal.timeout(10_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const res = await fetch(ddgUrl, {
      signal: combinedSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (res.ok) {
      const html = await res.text();
      const linkRegex =
        /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetRegex =
        /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

      const snippets: string[] = [];
      let sMatch: RegExpExecArray | null;
      while ((sMatch = snippetRegex.exec(html)) !== null) {
        snippets.push(
          decodeHtmlEntities(sMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        );
      }

      let lMatch: RegExpExecArray | null;
      let idx = 0;
      while ((lMatch = linkRegex.exec(html)) !== null && results.length < 6) {
        let href = decodeHtmlEntities(lMatch[1]);
        if (href.startsWith("//")) href = `https:${href}`;
        if (href.includes("uddg=")) {
          try {
            const u = new URL(href, "https://html.duckduckgo.com");
            const actual = u.searchParams.get("uddg");
            if (actual) href = actual;
          } catch {
            // keep href
          }
        }
        const safe = isSafeExternalUrl(href);
        if (safe) {
          const title = decodeHtmlEntities(
            lMatch[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          );
          results.push({
            title: title || safe.hostname,
            url: safe.toString(),
            snippet: snippets[idx] ?? "",
          });
        }
        idx += 1;
      }
    }
  } catch {
    // Try Wikipedia API fallback below
  }

  if (results.length === 0) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&format=json&srlimit=5`;
      const res = await fetch(wikiUrl, {
        signal: combinedSignal,
        headers: { "User-Agent": "NexoraAssistant/1.0" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          query?: { search?: Array<{ title: string; snippet: string }> };
        };
        for (const item of data.query?.search ?? []) {
          const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
            item.title.replace(/ /g, "_")
          )}`;
          results.push({
            title: item.title,
            url,
            snippet: decodeHtmlEntities(
              item.snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            ),
          });
        }
      }
    } catch {
      // No results available
    }
  }

  return results;
}

function addJobSources(job: ChatJob, incoming: StoredSource[]) {
  if (!incoming.length) return;
  const seen = new Set(job.sources.map((s) => s.url));
  for (const src of incoming) {
    const safe = isSafeExternalUrl(src.url);
    if (!safe) continue;
    const normalized = safe.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      job.sources.push({
        title: (src.title || safe.hostname).slice(0, 140),
        url: normalized,
      });
    }
    if (job.sources.length >= 12) break;
  }
}

async function runGeminiStream(
  job: ChatJob,
  prompt: string,
  history: HistoryTurn[],
  attachments: AttachmentPayload[],
  geminiModel: string,
  apiKey: string,
  systemInstruction: string,
  signal: AbortSignal,
  onChunk: (delta: string) => void,
  onThought: (delta: string) => void,
  onSources?: (sources: StoredSource[]) => void,
  onThinkingLine?: (line: string) => void,
  enableWebTools = true
) {
  if (signal.aborted) return;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const explicitUrls = enableWebTools ? extractUrlsFromText(prompt) : [];
  if (explicitUrls.length > 0 && onThinkingLine) {
    for (const u of explicitUrls.slice(0, 3)) {
      try {
        onThinkingLine(`Browsing ${new URL(u).hostname}`);
      } catch {
        // ignore invalid url formatting
      }
    }
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    {
      role: "user",
      parts: [
        ...attachments.map((att) => ({
          inlineData: {
            mimeType: att.mimeType,
            data: att.base64Data,
          },
        })),
        { text: prompt || "Analyze the attached image." },
      ],
    },
  ];

  const isGemini3Or4 = /^gemini-[34]/i.test(geminiModel);
  const isGemini25 = /^gemini-2\.5/i.test(geminiModel);
  const thinkingLevel =
    job.effort === "Low"
      ? ThinkingLevel.LOW
      : job.effort === "Max Effort"
        ? ThinkingLevel.HIGH
        : ThinkingLevel.MEDIUM;
  const gemini25ThinkingBudget =
    job.effort === "Low" ? 512 : job.effort === "Max Effort" ? 8192 : 2048;

  const buildStream = (
    withThinking: boolean,
    toolsMode: "search+url" | "search" | "none"
  ) =>
    ai.models.generateContentStream({
      model: geminiModel,
      contents,
      config: {
        systemInstruction,
        abortSignal: signal,
        ...(toolsMode === "search+url"
          ? { tools: [{ googleSearch: {} }, { urlContext: {} }] }
          : toolsMode === "search"
            ? { tools: [{ googleSearch: {} }] }
            : {}),
        ...(withThinking && isGemini3Or4
          ? { thinkingConfig: { includeThoughts: true, thinkingLevel } }
          : withThinking && isGemini25
            ? { thinkingConfig: { includeThoughts: true, thinkingBudget: gemini25ThinkingBudget } }
            : {}),
      },
    });

  const initialTools: "search+url" | "search" | "none" = enableWebTools
    ? "search+url"
    : "none";

  let stream;
  try {
    stream = await buildStream(isGemini3Or4 || isGemini25, initialTools);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!signal.aborted && (enableWebTools || isGemini3Or4 || isGemini25) && /400|tool|urlContext|googleSearch|thinking/i.test(msg)) {
      try {
        stream = await buildStream(
          isGemini3Or4 || isGemini25,
          enableWebTools ? "search" : "none"
        );
      } catch {
        stream = await buildStream(false, "none");
      }
    } else {
      throw err;
    }
  }

  for await (const chunk of stream) {
    if (signal.aborted) break;
    const cand = chunk.candidates?.[0] as
      | {
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          groundingMetadata?: {
            webSearchQueries?: string[];
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          };
          urlContextMetadata?: {
            urlMetadata?: Array<{ retrievedUrl?: string; urlRetrievalStatus?: string }>;
          };
        }
      | undefined;

    const groundingChunks = cand?.groundingMetadata?.groundingChunks ?? [];
    const searchQueries = cand?.groundingMetadata?.webSearchQueries ?? [];
    if (searchQueries.length > 0 && onThinkingLine) {
      onThinkingLine(`Searched: "${searchQueries[0].slice(0, 60)}"`);
    }

    const extractedSources: StoredSource[] = [];
    for (const gc of groundingChunks) {
      if (gc.web?.uri) {
        extractedSources.push({
          title: gc.web.title || gc.web.uri,
          url: gc.web.uri,
        });
      }
    }
    for (const um of cand?.urlContextMetadata?.urlMetadata ?? []) {
      if (um.retrievedUrl) {
        let hostTitle = um.retrievedUrl;
        try {
          hostTitle = new URL(um.retrievedUrl).hostname;
        } catch {
          // keep URL
        }
        extractedSources.push({ title: hostTitle, url: um.retrievedUrl });
      }
    }
    if (extractedSources.length > 0 && onSources) {
      onSources(extractedSources);
    }

    const parts = cand?.content?.parts ?? [];
    if (parts.length > 0) {
      for (const part of parts) {
        if (!part.text) continue;
        if (part.thought) {
          onThought(part.text);
        } else {
          onChunk(part.text);
        }
      }
    } else {
      const delta = chunk.text ?? "";
      if (delta) onChunk(delta);
    }
  }
}

const OPENAI_WEB_TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web for up-to-date facts, news, documentation, or websites.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to run.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_url",
      description:
        "Fetch and read the text content of a public webpage URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full http:// or https:// URL to read.",
          },
        },
        required: ["url"],
      },
    },
  },
];

async function runOpenAICompatibleStream(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  effort: string,
  prompt: string,
  history: HistoryTurn[],
  attachments: AttachmentPayload[],
  extraHeaders: Record<string, string>,
  systemInstruction: string,
  signal: AbortSignal,
  onChunk: (delta: string) => void,
  onThought: (delta: string) => void,
  onSources?: (sources: StoredSource[]) => void,
  onThinkingLine?: (line: string) => void
) {
  if (signal.aborted) return;

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const endpoint = normalizedBase.endsWith("/chat/completions")
    ? normalizedBase
    : `${normalizedBase}/chat/completions`;

  // Pre-fetch any explicit URLs in the prompt so page context is immediately available
  const explicitUrls = extractUrlsFromText(prompt);
  let urlContextBlock = "";
  if (explicitUrls.length > 0) {
    const fetchedSnippets: string[] = [];
    for (const targetUrl of explicitUrls.slice(0, 3)) {
      if (signal.aborted) break;
      try {
        onThinkingLine?.(`Browsing ${new URL(targetUrl).hostname}`);
        const page = await fetchWebPageContent(targetUrl, signal);
        onSources?.([{ title: page.title, url: page.url }]);
        fetchedSnippets.push(
          `[Webpage Content: ${page.title} (${page.url})]\n${page.content}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch URL";
        fetchedSnippets.push(`[Unable to load ${targetUrl}: ${msg}]`);
      }
    }
    if (fetchedSnippets.length > 0) {
      urlContextBlock = `\n\n${fetchedSnippets.join("\n\n")}`;
    }
  }

  const effectivePrompt = `${prompt || "Analyze the attached image."}${urlContextBlock}`;
  const userContent: unknown =
    attachments.length > 0
      ? [
          { type: "text", text: effectivePrompt },
          ...attachments.map((a) => ({
            type: "image_url",
            image_url: { url: `data:${a.mimeType};base64,${a.base64Data}` },
          })),
        ]
      : effectivePrompt;

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemInstruction },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];

  const isReasoningModel = /(^o[134]\b|\/o[134]\b|gpt-5|reasoning|deepseek-r1|qwq|gpt-oss)/i.test(
    modelId
  );
  const mappedReasoningEffort =
    effort === "Low" ? "low" : effort === "Max Effort" ? "high" : "medium";

  const sendPassRequest = (
    passMessages: Array<Record<string, unknown>>,
    withTools: boolean,
    withReasoningEffort: boolean
  ) =>
    fetch(endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        messages: passMessages,
        ...(withReasoningEffort ? { reasoning_effort: mappedReasoningEffort } : {}),
        ...(withTools ? { tools: OPENAI_WEB_TOOLS, tool_choice: "auto" } : {}),
      }),
    });

  const executeStreamPass = async (
    passMessages: Array<Record<string, unknown>>,
    withTools: boolean
  ): Promise<
    Array<{ id: string; name: string; arguments: string }>
  > => {
    let res = await sendPassRequest(passMessages, withTools, isReasoningModel);

    if (!res.ok && isReasoningModel && (res.status === 400 || res.status === 422) && !signal.aborted) {
      res = await sendPassRequest(passMessages, withTools, false);
    }

    if (!res.ok && withTools && (res.status === 400 || res.status === 422) && !signal.aborted) {
      res = await sendPassRequest(passMessages, false, false);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Provider error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Provider did not return a readable stream.");

    const onAbort = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const decoder = new TextDecoder();
    let buffer = "";
    const splitter = createThinkTagSplitter(onThought, onChunk);
    const toolCallsByIdx = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done || signal.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (signal.aborted) break;
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") {
            splitter.flush();
            return Array.from(toolCallsByIdx.values());
          }
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                  reasoning_content?: string;
                  reasoning?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              }>;
            };
            const deltaObj = parsed.choices?.[0]?.delta;
            const reasoningDelta = deltaObj?.reasoning_content ?? deltaObj?.reasoning;
            if (reasoningDelta) {
              onThought(reasoningDelta);
            }
            if (deltaObj?.content) {
              splitter.process(deltaObj.content);
            }
            for (const tc of deltaObj?.tool_calls ?? []) {
              const idx = tc.index ?? 0;
              const existing = toolCallsByIdx.get(idx) ?? {
                id: tc.id || `call_${idx}`,
                name: "",
                arguments: "",
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              toolCallsByIdx.set(idx, existing);
            }
          } catch {
            // Ignore partial SSE comment frames
          }
        }
      }
      splitter.flush();
      return Array.from(toolCallsByIdx.values());
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };

  const pendingCalls = await executeStreamPass(messages, true);
  if (pendingCalls.length > 0 && !signal.aborted) {
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: pendingCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments || "{}" },
      })),
    });

    for (const tc of pendingCalls) {
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.arguments || "{}") as Record<string, string>;
      } catch {
        args = {};
      }
      let toolResult = "";
      if (tc.name === "browse_url" && args.url) {
        try {
          onThinkingLine?.(`Browsing ${new URL(args.url).hostname}`);
          const page = await fetchWebPageContent(args.url, signal);
          onSources?.([{ title: page.title, url: page.url }]);
          toolResult = JSON.stringify(page);
        } catch (err) {
          toolResult = JSON.stringify({
            error: err instanceof Error ? err.message : "Failed to load URL",
          });
        }
      } else if (tc.name === "web_search" && args.query) {
        onThinkingLine?.(`Searching: "${args.query.slice(0, 60)}"`);
        const results = await searchWebInfo(args.query, signal);
        if (results.length > 0) {
          onSources?.(results.map((r) => ({ title: r.title, url: r.url })));
        }
        toolResult = JSON.stringify({ results });
      } else {
        toolResult = JSON.stringify({ error: "Unsupported tool call." });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }

    await executeStreamPass(messages, false);
  }
}

async function runAnthropicStream(
  baseUrl: string,
  apiKey: string,
  modelId: string,
  effort: string,
  prompt: string,
  history: HistoryTurn[],
  attachments: AttachmentPayload[],
  systemInstruction: string,
  signal: AbortSignal,
  onChunk: (delta: string) => void,
  onThought: (delta: string) => void,
  onSources?: (sources: StoredSource[]) => void,
  onThinkingLine?: (line: string) => void
) {
  if (signal.aborted) return;

  const normalizedBase = (baseUrl || "https://api.anthropic.com/v1").replace(/\/+$/, "");
  const endpoint = normalizedBase.endsWith("/messages")
    ? normalizedBase
    : `${normalizedBase}/messages`;

  const explicitUrls = extractUrlsFromText(prompt);
  let urlContextBlock = "";
  if (explicitUrls.length > 0) {
    const fetchedSnippets: string[] = [];
    for (const targetUrl of explicitUrls.slice(0, 3)) {
      if (signal.aborted) break;
      try {
        onThinkingLine?.(`Browsing ${new URL(targetUrl).hostname}`);
        const page = await fetchWebPageContent(targetUrl, signal);
        onSources?.([{ title: page.title, url: page.url }]);
        fetchedSnippets.push(
          `[Webpage Content: ${page.title} (${page.url})]\n${page.content}`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch URL";
        fetchedSnippets.push(`[Unable to load ${targetUrl}: ${msg}]`);
      }
    }
    if (fetchedSnippets.length > 0) {
      urlContextBlock = `\n\n${fetchedSnippets.join("\n\n")}`;
    }
  }

  const userContent = [
    ...attachments.map((a) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: a.mimeType,
        data: a.base64Data,
      },
    })),
    { type: "text", text: `${prompt || "Analyze the attached image."}${urlContextBlock}` },
  ];

  const supportsThinking = /(claude-3-7|claude-sonnet-4|claude-opus-4|claude-haiku-4|claude-4)/i.test(
    modelId
  );
  const enableThinking = supportsThinking && effort !== "Low";
  const budgetTokens = effort === "Max Effort" ? 6144 : 2048;

  const sendAnthropic = (withThinking: boolean) =>
    fetch(endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: withThinking ? Math.max(4096, budgetTokens + 2048) : 2048,
        stream: true,
        system: systemInstruction,
        ...(withThinking ? { thinking: { type: "enabled", budget_tokens: budgetTokens } } : {}),
        messages: [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: userContent },
        ],
      }),
    });

  let res = await sendAnthropic(enableThinking);
  if (!res.ok && enableThinking && res.status === 400 && !signal.aborted) {
    res = await sendAnthropic(false);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Anthropic did not return a readable stream.");

  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (signal.aborted) break;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string; thinking?: string };
          };
          if (parsed.type === "content_block_delta") {
            if (parsed.delta?.type === "thinking_delta" && parsed.delta.thinking) {
              onThought(parsed.delta.thinking);
            } else if (parsed.delta?.text) {
              onChunk(parsed.delta.text);
            }
          }
        } catch {
          // Ignore keepalive frames
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function getDefaultModelForPreset(preset: string): string {
  switch (preset) {
    case "gemini":
      return "gemini-4-hydrogen";
    case "claude":
      return "claude-sonnet-4-20250514";
    case "openrouter":
      return "openai/gpt-4o";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "openai":
      return "gpt-4o";
    default:
      return "";
  }
}

async function runJobInBackground(
  job: ChatJob,
  prompt: string,
  history: HistoryTurn[],
  attachments: AttachmentPayload[],
  byok: ByokConfig,
  language: string
) {
  const controller = new AbortController();
  jobControllers.set(job.id, controller);

  let lastFlush = 0;
  const startedAt = job.createdAt;
  let firstAnswerAt: number | null = null;
  const languageDirective =
    language && !language.toLowerCase().startsWith("english")
      ? `Respond in ${language} unless the user explicitly asks for another language.`
      : "";
  const effortDirective =
    job.effort === "Low"
      ? "4. REASONING DEPTH (Low): Prioritize speed and conciseness. Give direct, clear answers without lengthy deliberation."
      : job.effort === "Max Effort"
        ? "4. REASONING DEPTH (Max Effort): Think deeply and methodically before answering. Double-check logic, calculations, code edge cases, and retrieved facts, and provide a thorough, high-precision response."
        : "4. REASONING DEPTH (Medium): Provide a well-balanced, clear, and practical response with appropriate explanation.";
  const systemInstruction = [
    "You are Nexora Assistant, a clear, concise, and practical AI workspace assistant.",
    "Always structure your explanations using clean Markdown (headings, lists, tables, bold, and inline code where helpful).",
    "You have two distinct HTML output modes depending on the user's intent:",
    "1. INLINE INTERACTIVE PREVIEW (view-only visual result — no source code is shown to the user): Whenever a chart, graph, business/analytics card grid, diagram, timeline, interactive calculator, unit converter, live comparison widget, or visual UI demonstration communicates better than plain text or a static table—or whenever the user asks to show/visualize data, a chart, or an interactive view—output normal Markdown prose before and/or after an embedded fenced block with the exact info string ```nexora-preview (closed with ```). Keep everything inside ```nexora-preview strictly self-contained using inline HTML, CSS, SVG, or Canvas with vanilla JavaScript (avoid external CDNs so previews render instantaneously). Make layouts responsive at 100% width with balanced padding (e.g., 12px-18px) and style them cleanly using the workspace CSS variables var(--surface), var(--inset), var(--ink), var(--ink-2), var(--ink-3), var(--line), var(--accent), var(--green), var(--orange), and var(--red) so light and dark themes look native.",
    "2. HTML SOURCE CODE BLOCK: Use a normal ```html fenced code block only when the user explicitly wants HTML source code, asks for an HTML file/template to copy or download, or asks how HTML is written.",
    "3. WEBSITE BROWSING & LIVE WEB SEARCH: You have real-time web browsing and search tools enabled (URL reading via urlContext/browse_url and live web search via googleSearch/web_search). Whenever the user shares a URL (http:// or https://), asks you to read, summarize, or verify a webpage, or asks about current events, live prices, recent releases, documentation updates, or real-world facts, actively browse the URL or search the web rather than claiming you cannot access the internet. Ground your answer in the retrieved findings and cite the source links clearly.",
    effortDirective,
    languageDirective,
  ]
    .filter(Boolean)
    .join("\n\n");

  const flushDebounced = () => {
    const now = Date.now();
    if (now - lastFlush > 400) {
      lastFlush = now;
      void persistStore();
    }
  };

  const addThinkingLine = (line: string) => {
    const clean = line.trim();
    if (!clean || job.thinkingLines.includes(clean)) return;
    job.thinkingLines = [...job.thinkingLines.slice(-14), clean];
    job.updatedAt = Date.now();
    syncJobIntoWorkspaceThread(job);
    notifyJobListeners(job);
  };

  const appendSources = (sources: StoredSource[]) => {
    const prevCount = job.sources.length;
    addJobSources(job, sources);
    if (job.sources.length !== prevCount) {
      job.updatedAt = Date.now();
      syncJobIntoWorkspaceThread(job);
      notifyJobListeners(job);
    }
  };

  const appendThought = (delta: string) => {
    if (controller.signal.aborted || stoppedJobIds.has(job.id) || job.status !== "running") {
      return;
    }
    job.reasoningText += delta;
    job.thinkingDurationMs = Math.max(100, Date.now() - startedAt);
    job.updatedAt = Date.now();
    syncJobIntoWorkspaceThread(job);
    notifyJobListeners(job);
    flushDebounced();
  };

  const appendDelta = (delta: string) => {
    if (controller.signal.aborted || stoppedJobIds.has(job.id) || job.status !== "running") {
      return;
    }
    if (firstAnswerAt === null) {
      firstAnswerAt = Date.now();
      if (job.reasoningText.trim().length > 0) {
        job.thinkingDurationMs = Math.max(100, firstAnswerAt - startedAt);
      }
      if (!job.thinkingLines.includes("Streaming response")) {
        job.thinkingLines = [...job.thinkingLines, "Streaming response"];
      }
    }
    job.text += delta;
    job.updatedAt = Date.now();
    syncJobIntoWorkspaceThread(job);
    notifyJobListeners(job);
    flushDebounced();
  };

  try {
    const model = job.model;
    const effectiveByok = resolveByokConfig(byok, model);
    const baseUrl = (effectiveByok.baseUrl || "").trim();
    const apiKey = (effectiveByok.apiKey || "").trim();
    const preset = (effectiveByok.preset || "").trim().toLowerCase();
    const configuredByokModel =
      (effectiveByok.selectedModels?.[0] || "").trim() ||
      (effectiveByok.modelId || "").trim() ||
      getDefaultModelForPreset(preset);

    const geminiServerKey = process.env.GEMINI_API_KEY?.trim() || "";
    const hasServerGeminiKey =
      Boolean(geminiServerKey) && geminiServerKey !== "MY_GEMINI_API_KEY";

    if (model === "Nexora Assistant" && hasServerGeminiKey && !apiKey) {
      await runGeminiStream(
        job,
        prompt,
        history,
        attachments,
        "gemini-4-hydrogen",
        geminiServerKey,
        systemInstruction,
        controller.signal,
        appendDelta,
        appendThought,
        appendSources,
        addThinkingLine,
        true
      );
    } else {
      const targetModel =
        model === "Nexora Assistant" ? configuredByokModel : model.trim() || configuredByokModel;

      if (!baseUrl || !targetModel) {
        throw new Error(
          "Configure your Base URL, API key, and Model selection in Settings → Models before sending."
        );
      }

      const isLocalUrl =
        baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
      if (!apiKey && !isLocalUrl) {
        throw new Error(
          `Add your BYOK API key in Settings → Models to use ${targetModel}.`
        );
      }

      if (preset === "claude" || baseUrl.includes("anthropic.com")) {
        await runAnthropicStream(
          baseUrl,
          apiKey,
          targetModel,
          job.effort,
          prompt,
          history,
          attachments,
          systemInstruction,
          controller.signal,
          appendDelta,
          appendThought,
          appendSources,
          addThinkingLine
        );
      } else if (
        preset === "gemini" ||
        baseUrl.includes("generativelanguage.googleapis.com")
      ) {
        const cleanGeminiModel = targetModel
          .replace(/^models\//, "")
          .replace(/^gemini-2\.5-flash$/, "gemini-4-hydrogen");

        try {
          await runGeminiStream(
            job,
            prompt,
            history,
            attachments,
            cleanGeminiModel,
            apiKey,
            systemInstruction,
            controller.signal,
            appendDelta,
            appendThought,
            appendSources,
            addThinkingLine,
            true
          );
        } catch (geminiErr) {
          const errStr = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
          const isModelNotFound =
            /404|NOT_FOUND|no longer available|not found/i.test(errStr);
          if (!isModelNotFound || job.text.length > 0 || controller.signal.aborted) {
            throw geminiErr;
          }

          const fallbacks = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-4-hydrogen"].filter(
            (candidate) => candidate !== cleanGeminiModel
          );
          let succeeded = false;
          let lastErr: unknown = geminiErr;
          for (const fallbackModel of fallbacks) {
            if (controller.signal.aborted) break;
            try {
              await runGeminiStream(
                job,
                prompt,
                history,
                attachments,
                fallbackModel,
                apiKey,
                systemInstruction,
                controller.signal,
                appendDelta,
                appendThought,
                appendSources,
                addThinkingLine,
                true
              );
              succeeded = true;
              break;
            } catch (retryErr) {
              lastErr = retryErr;
            }
          }
          if (!succeeded) {
            throw lastErr;
          }
        }
      } else {
        const extraHeaders: Record<string, string> =
          preset === "openrouter" || baseUrl.includes("openrouter.ai")
            ? { "X-Title": "Nexora" }
            : {};
        await runOpenAICompatibleStream(
          baseUrl,
          apiKey,
          targetModel,
          job.effort,
          prompt,
          history,
          attachments,
          extraHeaders,
          systemInstruction,
          controller.signal,
          appendDelta,
          appendThought,
          appendSources,
          addThinkingLine
        );
      }
    }

    if (stoppedJobIds.has(job.id) || controller.signal.aborted) {
      finalizeStoppedJob(job);
      await persistStore();
      return;
    }

    job.status = "completed";
    if (!job.text.trim()) {
      job.text = "No response text was returned by the model.";
    }
    if (job.thinkingDurationMs <= 0) {
      job.thinkingDurationMs = Math.max(100, Date.now() - startedAt);
    }
    if (job.thinkingLines.length === 0) {
      job.thinkingLines = [`Connected to ${job.model}`, "Response completed"];
    } else if (!job.thinkingLines.includes("Response completed")) {
      job.thinkingLines = [...job.thinkingLines.slice(-14), "Response completed"];
    }
    job.updatedAt = Date.now();
    syncJobIntoWorkspaceThread(job);
    notifyJobListeners(job);
    await persistStore();
  } catch (err) {
    if (
      stoppedJobIds.has(job.id) ||
      controller.signal.aborted ||
      (err as { name?: string })?.name === "AbortError"
    ) {
      finalizeStoppedJob(job);
      await persistStore();
      return;
    }
    const message = err instanceof Error ? err.message : "Failed to generate response.";
    job.status = "error";
    job.errorMessage = message;
    if (job.thinkingDurationMs <= 0) {
      job.thinkingDurationMs = Math.max(100, Date.now() - startedAt);
    }
    if (!job.text.trim()) {
      job.text = message;
    }
    job.updatedAt = Date.now();
    syncJobIntoWorkspaceThread(job);
    notifyJobListeners(job);
    await persistStore();
  } finally {
    jobControllers.delete(job.id);
    stoppedJobIds.delete(job.id);
  }
}

async function startServer() {
  await loadStore();

  const app = express();
  app.use(express.json({ limit: "12mb" }));

  // --- Health check ---
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // --- Fetch available models from BYOK Base URL ---
  app.post("/api/byok/models", async (req: Request, res: Response) => {
    const preset = String(req.body?.preset || "").trim().toLowerCase();
    const rawBaseUrl = String(req.body?.baseUrl || "").trim();
    const apiKey = String(req.body?.apiKey || "").trim();

    if (!rawBaseUrl) {
      return res.status(400).json({ error: "Enter a Base URL before fetching models." });
    }

    const isLocalUrl =
      rawBaseUrl.includes("localhost") || rawBaseUrl.includes("127.0.0.1");
    if (!apiKey && !isLocalUrl) {
      return res.status(400).json({ error: "Enter an API key to fetch models from this provider." });
    }

    const normalized = rawBaseUrl
      .replace(/\/+$/, "")
      .replace(/\/chat\/completions$/, "")
      .replace(/\/messages$/, "");

    try {
      if (preset === "gemini" || normalized.includes("generativelanguage.googleapis.com")) {
        const googleRoot = normalized.replace(/\/openai$/, "");
        const modelsUrl = `${googleRoot}/models`;
        const upstream = await fetch(modelsUrl, {
          headers: {
            "x-goog-api-key": apiKey,
          },
        });
        if (!upstream.ok) {
          const text = await upstream.text().catch(() => upstream.statusText);
          return res.status(upstream.status).json({
            error: `Provider returned ${upstream.status}: ${text.slice(0, 220)}`,
          });
        }
        const data = (await upstream.json()) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        };
        const list = (data.models ?? [])
          .filter(
            (m) =>
              !m.supportedGenerationMethods ||
              m.supportedGenerationMethods.includes("generateContent")
          )
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter(Boolean);
        return res.json({ models: Array.from(new Set(list)) });
      }

      if (preset === "claude" || normalized.includes("anthropic.com")) {
        const modelsUrl = `${normalized}/models`;
        const upstream = await fetch(modelsUrl, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!upstream.ok) {
          const text = await upstream.text().catch(() => upstream.statusText);
          return res.status(upstream.status).json({
            error: `Provider returned ${upstream.status}: ${text.slice(0, 220)}`,
          });
        }
        const data = (await upstream.json()) as {
          data?: Array<{ id?: string }>;
        };
        const list = (data.data ?? [])
          .map((m) => String(m.id || ""))
          .filter(Boolean);
        return res.json({ models: Array.from(new Set(list)) });
      }

      // OpenAI, OpenRouter, Groq, or Custom OpenAI-compatible
      const modelsUrl = normalized.endsWith("/models")
        ? normalized
        : `${normalized}/models`;
      const upstream = await fetch(modelsUrl, {
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => upstream.statusText);
        return res.status(upstream.status).json({
          error: `Provider returned ${upstream.status}: ${text.slice(0, 220)}`,
        });
      }
      const data = (await upstream.json()) as
        | { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> }
        | Array<{ id?: string; name?: string }>;

      const rawItems = Array.isArray(data)
        ? data
        : data.data ?? data.models ?? [];
      const list = rawItems
        .map((m) => String(m.id || m.name || ""))
        .filter(Boolean);

      return res.json({ models: Array.from(new Set(list)) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reach provider URL.";
      return res.status(502).json({ error: msg });
    }
  });

  // --- Auth Routes (Real Accounts, zero mock users) ---
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const guestWorkspaceId = String(req.body?.guestWorkspaceId || "").replace(/[^a-zA-Z0-9_-]/g, "");

    if (!name || !email || !email.includes("@")) {
      return res.status(400).json({ error: "Enter a valid name and email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = Object.values(store.users).find((u) => u.email === email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const id = crypto.randomUUID();
    const { salt, hash } = hashPassword(password);
    const user: StoredUser = {
      id,
      name,
      email,
      initials: makeInitials(name),
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: Date.now(),
    };
    store.users[id] = user;

    // Migrate guest threads/folders/settings into the newly created account if non-empty
    if (guestWorkspaceId) {
      const guestWs = store.workspaces[`guest:${guestWorkspaceId}`];
      if (
        guestWs &&
        (guestWs.threads.length > 0 ||
          (guestWs.folders && guestWs.folders.length > 0) ||
          Object.keys(guestWs.settings).length > 0)
      ) {
        store.workspaces[`user:${id}`] = {
          threads: guestWs.threads,
          folders: guestWs.folders ?? [],
          settings: guestWs.settings,
        };
      }
    }

    const token = crypto.randomBytes(32).toString("hex");
    store.sessions[token] = { token, userId: id, createdAt: Date.now() };
    await persistStore();

    return res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, initials: user.initials },
    });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = Object.values(store.users).find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    store.sessions[token] = { token, userId: user.id, createdAt: Date.now() };
    await persistStore();

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, initials: user.initials },
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: "Not signed in." });
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, initials: user.initials },
    });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      delete store.sessions[token];
      await persistStore();
    }
    res.json({ ok: true });
  });

  // --- Workspace Sync Routes ---
  app.get("/api/workspace", (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const ws = getOrCreateWorkspace(ownerKey);
    const activeJobs = Object.values(store.jobs).filter(
      (j) => j.ownerKey === ownerKey && (j.status === "running" || Date.now() - j.updatedAt < 60_000)
    );
    res.json({
      threads: ws.threads,
      folders: ws.folders ?? [],
      settings: ws.settings,
      activeJobs,
      maxSettingsBytes: MAX_SETTINGS_BYTES,
    });
  });

  app.put("/api/workspace/threads", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const ws = getOrCreateWorkspace(ownerKey);
    const threads = Array.isArray(req.body?.threads) ? (req.body.threads as StoredThread[]) : [];
    ws.threads = threads;
    await persistStore();
    res.json({ ok: true, count: ws.threads.length });
  });

  app.put("/api/workspace/folders", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const ws = getOrCreateWorkspace(ownerKey);
    const folders = Array.isArray(req.body?.folders) ? (req.body.folders as StoredFolder[]) : [];
    ws.folders = folders;
    await persistStore();
    res.json({ ok: true, count: ws.folders.length });
  });

  app.delete("/api/workspace/threads", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const ws = getOrCreateWorkspace(ownerKey);
    ws.threads = [];
    await persistStore();
    res.json({ ok: true });
  });

  app.put("/api/workspace/settings", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const settings = req.body?.settings;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "Invalid settings payload." });
    }
    const payloadBytes = Buffer.byteLength(JSON.stringify(settings), "utf8");
    if (payloadBytes > MAX_SETTINGS_BYTES) {
      return res.status(413).json({
        error: `Settings payload (${Math.ceil(payloadBytes / 1024)} KB) exceeds the 64 KB sync limit.`,
      });
    }
    const ws = getOrCreateWorkspace(ownerKey);
    ws.settings = settings as Record<string, unknown>;
    await persistStore();
    res.json({ ok: true, bytes: payloadBytes, maxBytes: MAX_SETTINGS_BYTES });
  });

  // --- Durable Background AI Chat Job Routes ---
  app.post("/api/chat/jobs", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const threadId = String(req.body?.threadId || "");
    const threadTitle = String(req.body?.threadTitle || "New chat");
    const userMessage = req.body?.userMessage as StoredMessage | undefined;
    const assistantMessageId = String(req.body?.assistantMessageId || "");
    const model = String(req.body?.model || "Nexora Assistant");
    const effort = String(req.body?.effort || "Medium");
    const prompt = String(req.body?.prompt || "");
    const history = Array.isArray(req.body?.history) ? (req.body.history as HistoryTurn[]) : [];
    const attachments = Array.isArray(req.body?.attachments)
      ? (req.body.attachments as AttachmentPayload[])
      : [];
    const byok = (req.body?.byok || {}) as ByokConfig;
    const language = String(req.body?.language || "English (US)");

    if (!threadId || !assistantMessageId || !userMessage) {
      return res.status(400).json({ error: "Missing required chat job parameters." });
    }

    const jobId = crypto.randomUUID();
    const now = Date.now();
    const job: ChatJob = {
      id: jobId,
      ownerKey,
      threadId,
      assistantMessageId,
      model,
      effort,
      status: "running",
      text: "",
      thinkingLines: [`Connecting to ${model}`],
      reasoningText: "",
      thinkingDurationMs: 0,
      sources: [],
      createdAt: now,
      updatedAt: now,
    };
    store.jobs[jobId] = job;

    const ws = getOrCreateWorkspace(ownerKey);
    let thread = ws.threads.find((t) => t.id === threadId);
    const placeholderAssistant: StoredMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      model,
      effort,
      timestamp: userMessage.timestamp,
      thinkingVariant: "Steps",
      thinkingLines: job.thinkingLines,
      reasoningText: "",
      thinkingDurationMs: 0,
      jobId,
      jobStatus: "running",
    };

    if (!thread) {
      thread = {
        id: threadId,
        title: threadTitle,
        updatedAt: "Just now",
        messages: [userMessage, placeholderAssistant],
      };
      ws.threads = [thread, ...ws.threads];
    } else {
      thread.updatedAt = "Just now";
      thread.messages = [...thread.messages, userMessage, placeholderAssistant];
    }

    await persistStore();

    // Launch generation detached from request lifecycle so closing the tab won't stop it
    void runJobInBackground(job, prompt, history, attachments, byok, language);

    return res.status(202).json({ jobId, threadId, assistantMessageId });
  });

  app.get("/api/chat/jobs/:jobId", (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const job = store.jobs[String(req.params.jobId)];
    if (!job || job.ownerKey !== ownerKey) {
      return res.status(404).json({ error: "Job not found." });
    }
    return res.json({ job });
  });

  app.post("/api/chat/jobs/:jobId/stop", async (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const job = store.jobs[String(req.params.jobId)];
    if (!job || job.ownerKey !== ownerKey) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.status === "running") {
      stoppedJobIds.add(job.id);
      jobControllers.get(job.id)?.abort();
      finalizeStoppedJob(job);
      await persistStore();
    }
    return res.json({ ok: true, job });
  });

  app.get("/api/chat/jobs/:jobId/stream", (req: Request, res: Response) => {
    const ownerKey = getOwnerKey(req);
    const job = store.jobs[String(req.params.jobId)];
    if (!job || job.ownerKey !== ownerKey) {
      return res.status(404).json({ error: "Job not found." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendSnapshot = (j: ChatJob) => {
      res.write(
        `data: ${JSON.stringify({
          status: j.status,
          text: j.text,
          thinkingLines: j.thinkingLines,
          reasoningText: j.reasoningText || undefined,
          thinkingDurationMs: j.thinkingDurationMs,
          thinkingVariant: j.reasoningText ? "Reasoning" : "Steps",
          sources: j.sources.length > 0 ? j.sources : undefined,
          errorMessage: j.errorMessage,
        })}\n\n`
      );
    };

    sendSnapshot(job);
    if (job.status !== "running") {
      res.end();
      return;
    }

    const listener = (updated: ChatJob) => {
      sendSnapshot(updated);
      if (updated.status !== "running") {
        cleanup();
        res.end();
      }
    };

    let set = jobListeners.get(job.id);
    if (!set) {
      set = new Set();
      jobListeners.set(job.id, set);
    }
    set.add(listener);

    const cleanup = () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        jobListeners.delete(job.id);
      }
    };

    // Important: closing SSE connection only unsubscribes THIS browser tab; background AI generation keeps running!
    req.on("close", cleanup);
  });

  app.post("/api/chat/title", async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt || "").trim();
    const assistantText = String(req.body?.assistantText || "").trim();
    const model = String(req.body?.model || "Nexora Assistant").trim();
    const byok = (req.body?.byok || {}) as ByokConfig;
    const effectiveByok = resolveByokConfig(byok, model);
    const language = String(req.body?.language || "English (US)").trim();

    if (!prompt && !assistantText) {
      return res.json({ title: null });
    }

    const baseUrl = (effectiveByok.baseUrl || "").trim();
    const apiKey = (effectiveByok.apiKey || "").trim();
    const preset = (effectiveByok.preset || "").trim().toLowerCase();
    const configuredByokModel =
      (effectiveByok.selectedModels?.[0] || "").trim() ||
      (effectiveByok.modelId || "").trim() ||
      getDefaultModelForPreset(preset);

    const geminiServerKey = process.env.GEMINI_API_KEY?.trim() || "";
    const hasServerGeminiKey =
      Boolean(geminiServerKey) && geminiServerKey !== "MY_GEMINI_API_KEY";

    const titleSystemPrompt = `Create a short, natural conversation title in 2 to 5 words (${language}). Return ONLY the plain title text with no quotes, no markdown formatting, no prefixes like "Title:", and no trailing punctuation.`;
    const titleInput = [
      prompt ? `User message:\n${prompt.slice(0, 600)}` : "",
      assistantText ? `Assistant response:\n${assistantText.slice(0, 600)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      let rawTitle = "";
      const appendDelta = (delta: string) => {
        rawTitle += delta;
      };
      const noopThought = () => {};
      const tempJob: ChatJob = {
        id: "title-gen",
        ownerKey: "title",
        threadId: "title",
        assistantMessageId: "title",
        model,
        effort: "Low",
        status: "running",
        text: "",
        thinkingLines: [],
        reasoningText: "",
        thinkingDurationMs: 0,
        sources: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (model === "Nexora Assistant" && hasServerGeminiKey && !apiKey) {
        await runGeminiStream(
          tempJob,
          titleInput,
          [],
          [],
          "gemini-4-hydrogen",
          geminiServerKey,
          titleSystemPrompt,
          controller.signal,
          appendDelta,
          noopThought,
          undefined,
          undefined,
          false
        );
      } else {
        const targetModel =
          model === "Nexora Assistant" || model === "Nexora Nano (Local)"
            ? configuredByokModel || (hasServerGeminiKey ? "gemini-4-hydrogen" : "")
            : model || configuredByokModel;

        if (!apiKey && hasServerGeminiKey) {
          await runGeminiStream(
            tempJob,
            titleInput,
            [],
            [],
            "gemini-4-hydrogen",
            geminiServerKey,
            titleSystemPrompt,
            controller.signal,
            appendDelta,
            noopThought,
            undefined,
            undefined,
            false
          );
        } else if (baseUrl && targetModel && (apiKey || baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))) {
          if (preset === "claude" || baseUrl.includes("anthropic.com")) {
            await runAnthropicStream(
              baseUrl,
              apiKey,
              targetModel,
              "Low",
              titleInput,
              [],
              [],
              titleSystemPrompt,
              controller.signal,
              appendDelta,
              noopThought
            );
          } else if (
            preset === "gemini" ||
            baseUrl.includes("generativelanguage.googleapis.com")
          ) {
            const cleanGeminiModel = targetModel
              .replace(/^models\//, "")
              .replace(/^gemini-2\.5-flash$/, "gemini-4-hydrogen");
            await runGeminiStream(
              tempJob,
              titleInput,
              [],
              [],
              cleanGeminiModel,
              apiKey,
              titleSystemPrompt,
              controller.signal,
              appendDelta,
              noopThought,
              undefined,
              undefined,
              false
            );
          } else {
            const extraHeaders: Record<string, string> =
              preset === "openrouter" || baseUrl.includes("openrouter.ai")
                ? { "X-Title": "Nexora" }
                : {};
            await runOpenAICompatibleStream(
              baseUrl,
              apiKey,
              targetModel,
              "Low",
              titleInput,
              [],
              [],
              extraHeaders,
              titleSystemPrompt,
              controller.signal,
              appendDelta,
              noopThought
            );
          }
        }
      }

      const firstLine =
        rawTitle
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean) ?? "";
      const cleaned = firstLine
        .replace(/^title\s*:\s*/i, "")
        .replace(/^[#*`"'“”‘’\-\s]+/, "")
        .replace(/[*`"'“”‘’.!?\s]+$/, "")
        .replace(/\s+/g, " ")
        .trim();

      const finalTitle =
        cleaned.length > 52 ? `${cleaned.slice(0, 52).trim()}…` : cleaned;
      return res.json({ title: finalTitle || null });
    } catch {
      return res.json({ title: null });
    } finally {
      clearTimeout(timer);
    }
  });

  const httpServer = http.createServer(app);

  // --- Vite / Static Frontend Serving ---
  if (process.env.NODE_ENV === "production") {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr:
          process.env.DISABLE_HMR === "true"
            ? false
            : { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexora server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

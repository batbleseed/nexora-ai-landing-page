import type { ChatFolder, WorkspaceThread } from "../data/workspaceThreads";

const DB_NAME = "nexora_offline_db";
const DB_VERSION = 1;
const STORE_KV = "kv";

export interface AuthSessionSnapshot {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    initials: string;
  };
}

export type ByokProviderPreset =
  | "gemini"
  | "openai"
  | "claude"
  | "openrouter"
  | "groq"
  | "custom";

export interface ByokPresetOption {
  id: ByokProviderPreset;
  label: string;
  baseUrl: string;
  placeholderKey: string;
  placeholderModel: string;
}

export const BYOK_PRESETS: ByokPresetOption[] = [
  {
    id: "gemini",
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    placeholderKey: "AIza...",
    placeholderModel: "gemini-4-hydrogen",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    placeholderKey: "sk-...",
    placeholderModel: "gpt-4o",
  },
  {
    id: "claude",
    label: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    placeholderKey: "sk-ant-...",
    placeholderModel: "claude-sonnet-4-20250514",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    placeholderKey: "sk-or-...",
    placeholderModel: "openai/gpt-4o",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    placeholderKey: "gsk_...",
    placeholderModel: "llama-3.3-70b-versatile",
  },
  {
    id: "custom",
    label: "Custom",
    baseUrl: "",
    placeholderKey: "Bearer token",
    placeholderModel: "model-id",
  },
];

export interface SavedByokModel {
  id: string;
  preset: ByokProviderPreset;
  baseUrl: string;
  apiKey: string;
}

export interface ByokConfig {
  preset: ByokProviderPreset;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  selectedModels: string[];
  fetchedModels: string[];
  savedModels?: SavedByokModel[];
}

export interface WorkspaceSettingsSnapshot {
  isDark: boolean;
  sendOnEnter: boolean;
  autoScroll: boolean;
  language: string;
  density: "comfortable" | "compact";
  fontScale: "default" | "large";
  completionChime: boolean;
  spokenStatusUpdates: boolean;
  voiceAutoSubmit: boolean;
  soundProfile: "chime" | "click" | "muted";
  volume: number;
  betaTraces: boolean;
  betaSelectionBar: boolean;
  betaVoiceWave: boolean;
  betaCommandSearch: boolean;
  localModelEnabled: boolean;
  localModelReady: boolean;
  localBackend: "webgpu" | "cpu";
}

export const DEFAULT_SETTINGS: WorkspaceSettingsSnapshot = {
  isDark: false,
  sendOnEnter: true,
  autoScroll: true,
  language: "English (US)",
  density: "comfortable",
  fontScale: "default",
  completionChime: true,
  spokenStatusUpdates: false,
  voiceAutoSubmit: false,
  soundProfile: "chime",
  volume: 70,
  betaTraces: true,
  betaSelectionBar: true,
  betaVoiceWave: true,
  betaCommandSearch: true,
  localModelEnabled: false,
  localModelReady: false,
  localBackend:
    typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "cpu",
};

export const DEFAULT_BYOK: ByokConfig = {
  preset: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  modelId: "",
  selectedModels: [],
  fetchedModels: [],
  savedModels: [],
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_KV, "readonly");
      const store = tx.objectStore(STORE_KV);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`nexora:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

function stripHeavyAttachmentsForLocalStorage(
  threads: WorkspaceThread[]
): WorkspaceThread[] {
  return threads.map((t) => ({
    ...t,
    messages: t.messages.map((m) =>
      m.attachmentPreviews && m.attachmentPreviews.length > 0
        ? { ...m, attachmentPreviews: undefined }
        : m
    ),
  }));
}

function writeLocalStorageSafely<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`nexora:${key}`, JSON.stringify(value));
  } catch {
    if (key === "threads" && Array.isArray(value)) {
      try {
        const compact = stripHeavyAttachmentsForLocalStorage(
          value as WorkspaceThread[]
        );
        localStorage.setItem(`nexora:${key}`, JSON.stringify(compact));
      } catch {
        // Ignore if even compact threads exceed quota
      }
    }
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  writeLocalStorageSafely(key, value);
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_KV, "readwrite");
      const store = tx.objectStore(STORE_KV);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // localStorage fallback already written
  }
}

export function getOrCreateGuestWorkspaceId(): string {
  const key = "nexora:guest_workspace_id";
  try {
    let existing = localStorage.getItem(key);
    if (!existing) {
      existing =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `ws-${Date.now()}`;
      localStorage.setItem(key, existing);
    }
    return existing;
  } catch {
    return "default";
  }
}

export function loadLocalThreadsSync(): WorkspaceThread[] {
  try {
    const raw = localStorage.getItem("nexora:threads");
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as WorkspaceThread[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalThreadsSync(threads: WorkspaceThread[]): void {
  writeLocalStorageSafely("threads", threads);
}

export function loadLocalFoldersSync(): ChatFolder[] {
  try {
    const raw = localStorage.getItem("nexora:folders");
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as ChatFolder[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalFoldersSync(folders: ChatFolder[]): void {
  writeLocalStorageSafely("folders", folders);
}

export function loadLocalSettingsSync(): WorkspaceSettingsSnapshot {
  try {
    const raw = localStorage.getItem("nexora:settings");
    const parsed = raw ? (JSON.parse(raw) as Partial<WorkspaceSettingsSnapshot>) : null;
    return { ...DEFAULT_SETTINGS, ...(parsed ?? {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveLocalSettingsSync(settings: WorkspaceSettingsSnapshot): void {
  writeLocalStorageSafely("settings", settings);
}

export async function loadOfflineThreads(): Promise<WorkspaceThread[]> {
  const fromIdb = await idbGet<WorkspaceThread[]>("threads");
  if (Array.isArray(fromIdb) && fromIdb.length > 0) return fromIdb;
  return loadLocalThreadsSync();
}

export async function saveOfflineThreads(threads: WorkspaceThread[]): Promise<void> {
  await idbSet("threads", threads);
}

export async function loadOfflineFolders(): Promise<ChatFolder[]> {
  const fromIdb = await idbGet<ChatFolder[]>("folders");
  if (Array.isArray(fromIdb) && fromIdb.length > 0) return fromIdb;
  return loadLocalFoldersSync();
}

export async function saveOfflineFolders(folders: ChatFolder[]): Promise<void> {
  await idbSet("folders", folders);
}

export async function loadOfflineSettings(): Promise<WorkspaceSettingsSnapshot> {
  const saved = await idbGet<Partial<WorkspaceSettingsSnapshot>>("settings");
  if (saved) return { ...DEFAULT_SETTINGS, ...saved };
  return loadLocalSettingsSync();
}

export async function saveOfflineSettings(settings: WorkspaceSettingsSnapshot): Promise<void> {
  await idbSet("settings", settings);
}

export interface UiSessionSnapshot {
  activeThreadId: string | null;
  activeView: "landing" | "chat" | "settings";
  settingsTab: "general" | "appearance" | "models" | "sound" | "shortcuts" | "account" | "beta";
  draft: string;
  selectedComposerModel: string;
  selectedEffort?: string;
  sidebarCollapsed?: boolean;
}

export function loadUiSession(): UiSessionSnapshot | null {
  try {
    const raw = localStorage.getItem("nexora:ui_session");
    if (!raw) return null;
    return JSON.parse(raw) as UiSessionSnapshot;
  } catch {
    return null;
  }
}

export function saveUiSession(session: UiSessionSnapshot): void {
  try {
    localStorage.setItem("nexora:ui_session", JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

export function loadAuthSession(): AuthSessionSnapshot | null {
  try {
    const raw = localStorage.getItem("nexora:auth_session");
    return raw ? (JSON.parse(raw) as AuthSessionSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSessionSnapshot | null): void {
  try {
    if (!session) {
      localStorage.removeItem("nexora:auth_session");
    } else {
      localStorage.setItem("nexora:auth_session", JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors
  }
}

function normalizeSavedModels(
  raw: unknown,
  fallbackPreset: ByokProviderPreset,
  fallbackBaseUrl: string
): SavedByokModel[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, SavedByokModel>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Partial<SavedByokModel>;
    const rawId = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!rawId) continue;
    const id =
      rawId === "gemini-2.5-flash" || rawId === "models/gemini-2.5-flash"
        ? "gemini-4-hydrogen"
        : rawId;
    byId.set(id, {
      id,
      preset: (obj.preset as ByokProviderPreset) || fallbackPreset,
      baseUrl: typeof obj.baseUrl === "string" ? obj.baseUrl.trim() : fallbackBaseUrl,
      apiKey: typeof obj.apiKey === "string" ? obj.apiKey.trim() : "",
    });
  }
  return Array.from(byId.values());
}

export function loadByokConfig(): ByokConfig {
  try {
    const raw = localStorage.getItem("nexora:byok");
    if (!raw) return DEFAULT_BYOK;
    const parsed = JSON.parse(raw) as Partial<ByokConfig>;
    const normalizeModel = (m: string) =>
      m.trim() === "gemini-2.5-flash" || m.trim() === "models/gemini-2.5-flash"
        ? "gemini-4-hydrogen"
        : m.trim();
    const fetchedModels = Array.isArray(parsed.fetchedModels)
      ? Array.from(
          new Set(
            parsed.fetchedModels
              .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
              .map(normalizeModel)
          )
        )
      : [];
    const rawSelected = Array.isArray(parsed.selectedModels)
      ? parsed.selectedModels
          .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
          .map(normalizeModel)
      : [];
    const legacyModel =
      typeof parsed.modelId === "string" ? normalizeModel(parsed.modelId) : "";
    const selectedModels =
      rawSelected.length > 0
        ? Array.from(new Set(rawSelected))
        : legacyModel
          ? [legacyModel]
          : [];

    const preset = (parsed.preset as ByokProviderPreset) || DEFAULT_BYOK.preset;
    const baseUrl =
      typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : DEFAULT_BYOK.baseUrl;
    const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "";

    let savedModels = normalizeSavedModels(parsed.savedModels, preset, baseUrl);
    // Migrate legacy single-provider selectedModels if savedModels hasn't been initialized yet
    if (
      savedModels.length === 0 &&
      !Array.isArray(parsed.savedModels) &&
      selectedModels.length > 0 &&
      baseUrl
    ) {
      savedModels = selectedModels.map((id) => ({
        id,
        preset,
        baseUrl,
        apiKey,
      }));
    }

    return {
      ...DEFAULT_BYOK,
      ...parsed,
      preset,
      baseUrl,
      apiKey,
      modelId: legacyModel || selectedModels[0] || "",
      fetchedModels,
      selectedModels,
      savedModels,
    };
  } catch {
    return DEFAULT_BYOK;
  }
}

export function saveByokConfig(byok: ByokConfig): void {
  try {
    const savedModels = normalizeSavedModels(
      byok.savedModels,
      byok.preset,
      byok.baseUrl
    );
    const clean: ByokConfig = {
      ...byok,
      fetchedModels: Array.from(
        new Set(byok.fetchedModels.map((m) => m.trim()).filter(Boolean))
      ),
      selectedModels: Array.from(
        new Set(byok.selectedModels.map((m) => m.trim()).filter(Boolean))
      ),
      savedModels,
    };
    localStorage.setItem("nexora:byok", JSON.stringify(clean));
  } catch {
    // Ignore storage errors
  }
}

export function resolveByokForModel(byok: ByokConfig, model: string): ByokConfig {
  const matched = (byok.savedModels ?? []).find((m) => m.id === model);
  if (!matched) return byok;
  return {
    ...byok,
    preset: matched.preset,
    baseUrl: matched.baseUrl,
    apiKey: matched.apiKey,
    modelId: matched.id,
    selectedModels: [matched.id],
  };
}

export interface PendingJobRecord {
  jobId: string;
  threadId: string;
  assistantMessageId: string;
}

export function loadPendingJobs(): PendingJobRecord[] {
  try {
    const raw = localStorage.getItem("nexora:pending_jobs");
    return raw ? (JSON.parse(raw) as PendingJobRecord[]) : [];
  } catch {
    return [];
  }
}

export function savePendingJobs(jobs: PendingJobRecord[]): void {
  try {
    localStorage.setItem("nexora:pending_jobs", JSON.stringify(jobs));
  } catch {
    // Ignore storage errors
  }
}

"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  BYOK_PRESETS,
  DEFAULT_BYOK,
  type ByokConfig,
  type SavedByokModel,
  type WorkspaceSettingsSnapshot,
} from "../lib/offlineStore";
import type { SidebarAccount } from "./SidebarNav";

export type SettingsTab =
  | "general"
  | "appearance"
  | "models"
  | "sound"
  | "shortcuts"
  | "account"
  | "beta";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "models", label: "Models" },
  { id: "sound", label: "Sound" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "account", label: "Account" },
  { id: "beta", label: "Beta" },
];

function SettingToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${
        checked ? "bg-ink" : "bg-hover-2"
      }`}
    >
      <span
        className={`inline-block size-3.5 rounded-full bg-surface shadow-xs transition-transform duration-150 ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function SettingsSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-medium text-ink-2">{title}</h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="divide-y divide-line rounded-[14px] border border-line/60 bg-canvas/75 px-5 dark:bg-inset">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-ink">{title}</div>
        {description && (
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
            {description}
          </div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function SettingsSelect({
  ariaLabel,
  value,
  onChange,
  children,
}: {
  ariaLabel: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[152px] appearance-none rounded-[10px] border border-line-strong/80 bg-surface pl-3.5 pr-9 text-[13px] font-medium text-ink shadow-xs outline-none transition-colors hover:border-ink-3 focus:border-ink"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
    </div>
  );
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((keyLabel, idx) => (
        <span key={`${keyLabel}-${idx}`} className="inline-flex items-center gap-1">
          {idx > 0 && <span className="text-[11px] text-ink-3">+</span>}
          <kbd className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-[7px] border border-line-strong/80 bg-surface px-2 font-mono text-[11.5px] font-medium text-ink shadow-xs">
            {keyLabel}
          </kbd>
        </span>
      ))}
    </div>
  );
}

export type LocalModelStatus = "idle" | "downloading" | "ready";
export type LocalBackend = "webgpu" | "cpu";

export default function SettingsView({
  initialTab = "general",
  currentUser,
  authProviderLabel,
  onOpenAuth,
  onSignOut,
  settings,
  onUpdateSettings,
  byok,
  onUpdateByok,
  threadCount,
  onExportAllChats,
  onClearAllChats,
  onTestSound,
  onSyncNow,
  localModelStatus,
  localDownloadProgress,
  localStatusText,
  localError,
  onDownloadLocalModel,
  onClearLocalModel,
  onUseLocalModel,
}: {
  initialTab?: SettingsTab;
  currentUser: SidebarAccount | null;
  authProviderLabel?: string | null;
  onOpenAuth: () => void;
  onSignOut: () => Promise<void>;
  settings: WorkspaceSettingsSnapshot;
  onUpdateSettings: (patch: Partial<WorkspaceSettingsSnapshot>) => void;
  byok: ByokConfig;
  onUpdateByok: (patch: Partial<ByokConfig>) => void;
  threadCount: number;
  onExportAllChats: () => void;
  onClearAllChats: () => void;
  onTestSound: () => void;
  onSyncNow: () => Promise<void>;
  localModelStatus: LocalModelStatus;
  localDownloadProgress: number;
  localStatusText?: string | null;
  localError?: string | null;
  onDownloadLocalModel: () => void;
  onClearLocalModel: () => void;
  onUseLocalModel?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;

  const [confirmClear, setConfirmClear] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [draftByok, setDraftByok] = useState<ByokConfig>(() => ({
    preset: DEFAULT_BYOK.preset,
    baseUrl: DEFAULT_BYOK.baseUrl,
    apiKey: "",
    modelId: "",
    fetchedModels: [],
    selectedModels: [],
    savedModels: byok.savedModels ?? [],
  }));
  const [savedCountNotice, setSavedCountNotice] = useState<number | null>(null);
  const [byokJustSaved, setByokJustSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncedNotice, setSyncedNotice] = useState(false);

  const savedModels = byok.savedModels ?? [];
  const activePreset =
    BYOK_PRESETS.find((p) => p.id === draftByok.preset) ?? BYOK_PRESETS[1];
  const uniqueFetchedModels = Array.from(new Set(draftByok.fetchedModels));
  const filteredFetchedModels = modelFilter.trim()
    ? uniqueFetchedModels.filter((m) =>
        m.toLowerCase().includes(modelFilter.trim().toLowerCase())
      )
    : uniqueFetchedModels;

  const settingsBytes = new TextEncoder().encode(JSON.stringify(settings)).length;
  const hasDraftByok = Boolean(
    draftByok.apiKey.trim() ||
      draftByok.modelId.trim() ||
      draftByok.selectedModels.length > 0 ||
      draftByok.fetchedModels.length > 0 ||
      customModelDraft.trim()
  );

  const isByokDirty = Boolean(
    draftByok.apiKey.trim() ||
      draftByok.selectedModels.length > 0 ||
      customModelDraft.trim() ||
      draftByok.fetchedModels.length > 0
  );

  const updateDraftByok = (patch: Partial<ByokConfig>) => {
    setByokJustSaved(false);
    setSavedCountNotice(null);
    setSaveError(null);
    setDraftByok((prev) => {
      const next = { ...prev, ...patch };
      return {
        ...next,
        fetchedModels: Array.from(
          new Set(next.fetchedModels.map((m) => m.trim()).filter(Boolean))
        ),
        selectedModels: Array.from(
          new Set(next.selectedModels.map((m) => m.trim()).filter(Boolean))
        ),
      };
    });
  };

  const toggleSelectedModel = (id: string) => {
    const exists = draftByok.selectedModels.includes(id);
    const next = exists
      ? draftByok.selectedModels.filter((m) => m !== id)
      : [...draftByok.selectedModels, id];
    updateDraftByok({
      selectedModels: next,
      modelId: next[0] ?? "",
    });
  };

  const selectAllFilteredModels = () => {
    if (filteredFetchedModels.length === 0) return;
    const merged = Array.from(
      new Set([...draftByok.selectedModels, ...filteredFetchedModels])
    );
    updateDraftByok({
      selectedModels: merged,
      modelId: merged[0] ?? "",
    });
  };

  const clearSelectedModels = () => {
    updateDraftByok({
      selectedModels: [],
      modelId: "",
    });
  };

  const handleAddCustomModel = () => {
    const trimmed = customModelDraft.trim();
    if (!trimmed) return;
    const next = draftByok.selectedModels.includes(trimmed)
      ? draftByok.selectedModels
      : [...draftByok.selectedModels, trimmed];
    updateDraftByok({
      selectedModels: next,
      modelId: next[0] ?? trimmed,
    });
    setCustomModelDraft("");
  };

  const handleSaveByok = () => {
    const typedCustom = customModelDraft.trim();
    const modelsToSave = Array.from(
      new Set(
        [...draftByok.selectedModels, ...(typedCustom ? [typedCustom] : [])]
          .map((m) => m.trim())
          .filter(Boolean)
      )
    );
    if (modelsToSave.length === 0) {
      setSaveError("Select fetched models or enter a Model ID before saving.");
      return;
    }

    const cleanBaseUrl = draftByok.baseUrl.trim();
    const cleanApiKey = draftByok.apiKey.trim();
    const mergedMap = new Map<string, SavedByokModel>();
    for (const existing of savedModels) {
      mergedMap.set(existing.id, existing);
    }
    for (const id of modelsToSave) {
      mergedMap.set(id, {
        id,
        preset: draftByok.preset,
        baseUrl: cleanBaseUrl,
        apiKey: cleanApiKey,
      });
    }
    const nextSavedModels = Array.from(mergedMap.values());

    // Reset provider template, base URL, API key, and selection draft for next entry
    const resetConfig: ByokConfig = {
      ...DEFAULT_BYOK,
      savedModels: nextSavedModels,
    };
    setDraftByok(resetConfig);
    onUpdateByok(resetConfig);
    setCustomModelDraft("");
    setModelFilter("");
    setFetchError(null);
    setSaveError(null);
    setShowApiKey(false);
    setSavedCountNotice(modelsToSave.length);
    setByokJustSaved(true);
  };

  const handleDeleteSavedModel = (id: string) => {
    const nextSavedModels = savedModels.filter((m) => m.id !== id);
    onUpdateByok({
      savedModels: nextSavedModels,
    });
    setDraftByok((prev) => ({
      ...prev,
      savedModels: nextSavedModels,
    }));
  };

  const handleClearAllSavedModels = () => {
    onUpdateByok({
      savedModels: [],
      selectedModels: [],
      modelId: "",
    });
    setDraftByok((prev) => ({
      ...prev,
      savedModels: [],
    }));
  };

  const handleFetchModels = async () => {
    setFetchError(null);
    setFetchingModels(true);
    try {
      const res = await fetch("/api/byok/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: draftByok.preset,
          baseUrl: draftByok.baseUrl.trim(),
          apiKey: draftByok.apiKey.trim(),
        }),
      });
      const data = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok || !Array.isArray(data.models)) {
        throw new Error(data.error || "Could not fetch models from endpoint.");
      }
      if (data.models.length === 0) {
        throw new Error("The endpoint returned an empty model list.");
      }
      const nextSelected =
        draftByok.selectedModels.length > 0
          ? draftByok.selectedModels
          : draftByok.modelId.trim()
            ? [draftByok.modelId.trim()]
            : [data.models[0]];
      updateDraftByok({
        fetchedModels: data.models,
        selectedModels: nextSelected,
        modelId: nextSelected[0] ?? "",
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch models.");
    } finally {
      setFetchingModels(false);
    }
  };

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? "Settings";

  return (
    <div className="flex h-full w-full flex-col bg-page">
      {/* Top Header (no X button) */}
      <div className="flex h-13 shrink-0 items-center border-b border-line px-4 sm:h-14 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight text-ink sm:text-[20px]">
          Settings
        </h1>
      </div>

      {/* Body Split */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* Left Navigation Rail */}
        <nav
          aria-label="Settings sections"
          className="no-scrollbar flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-line px-3 py-2 sm:w-56 sm:flex-col sm:border-r sm:border-b-0 sm:p-4"
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setConfirmClear(false);
                }}
                className={`flex h-9 shrink-0 items-center rounded-[9px] px-3 text-left text-[13.5px] whitespace-nowrap transition-colors duration-100 ${
                  active
                    ? "bg-hover-2 font-medium text-ink"
                    : "text-ink-2 hover:bg-hover hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right Content Pane */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
          <div className="max-w-2xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-[22px] font-semibold tracking-tight text-ink">
                {activeTabLabel}
              </h2>
              {activeTab === "models" && hasDraftByok && (
                <button
                  type="button"
                  onClick={() => {
                    setFetchError(null);
                    setSaveError(null);
                    setModelFilter("");
                    setCustomModelDraft("");
                    setByokJustSaved(false);
                    setSavedCountNotice(null);
                    setDraftByok({
                      ...DEFAULT_BYOK,
                      savedModels,
                    });
                  }}
                  className="h-8 shrink-0 whitespace-nowrap rounded-[9px] border border-line-strong/80 bg-surface px-3 text-[12px] font-medium text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
                >
                  Reset form
                </button>
              )}
            </div>

            {activeTab === "general" && (
              <div className="flex flex-col gap-7">
                <SettingsSection title="Preferences">
                  <SettingsRow title="Appearance">
                    <SettingsSelect
                      ariaLabel="Appearance"
                      value={settings.isDark ? "dark" : "light"}
                      onChange={(next) => onUpdateSettings({ isDark: next === "dark" })}
                    >
                      <option value="light">Light Mode</option>
                      <option value="dark">Dark Mode</option>
                    </SettingsSelect>
                  </SettingsRow>

                  <SettingsRow
                    title="Language"
                    description="Used for prompts, dates, and code annotations."
                  >
                    <SettingsSelect
                      ariaLabel="Language"
                      value={settings.language}
                      onChange={(language) => onUpdateSettings({ language })}
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="English (UK)">English (UK)</option>
                      <option value="Japanese">Japanese</option>
                      <option value="German">German</option>
                      <option value="French">French</option>
                      <option value="Spanish">Spanish</option>
                    </SettingsSelect>
                  </SettingsRow>

                  <SettingsRow
                    title="Send with Enter"
                    description="Press Enter to submit prompts; Shift+Enter adds a new line."
                  >
                    <SettingToggle
                      checked={settings.sendOnEnter}
                      onChange={(sendOnEnter) => onUpdateSettings({ sendOnEnter })}
                      label="Send with Enter"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Auto-scroll responses"
                    description="Keep the active thread pinned to the latest streamed output."
                  >
                    <SettingToggle
                      checked={settings.autoScroll}
                      onChange={(autoScroll) => onUpdateSettings({ autoScroll })}
                      label="Auto-scroll responses"
                    />
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection title="History & Storage">
                  <SettingsRow
                    title="Chat history"
                    description={
                      threadCount === 0
                        ? "No conversations saved."
                        : `${threadCount} conversation${threadCount === 1 ? "" : "s"} synced (${Math.max(1, Math.round(settingsBytes / 1024))} KB / 64 KB settings cap).`
                    }
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={threadCount === 0}
                        onClick={onExportAllChats}
                        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Download className="size-3.5" />
                        <span>Export</span>
                      </button>
                      {confirmClear ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmClear(false)}
                            className="h-9 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3 text-[12.5px] font-medium text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClearAllChats();
                              setConfirmClear(false);
                            }}
                            className="h-9 whitespace-nowrap rounded-[10px] bg-red-tint px-3 text-[12.5px] font-medium text-red shadow-xs transition-opacity hover:opacity-90"
                          >
                            Confirm clear
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={threadCount === 0}
                          onClick={() => setConfirmClear(true)}
                          className="h-9 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-red shadow-xs transition-colors hover:bg-red-tint disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Clear all chats
                        </button>
                      )}
                    </div>
                  </SettingsRow>

                  <div className="py-1">
                    <button
                      type="button"
                      aria-expanded={advancedOpen}
                      onClick={() => setAdvancedOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-2 py-3 text-left text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
                    >
                      <span>Sync budget &amp; storage details</span>
                      <ChevronRight
                        className={`size-4 shrink-0 transition-transform duration-150 ${
                          advancedOpen ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    {advancedOpen && (
                      <div className="flex flex-col gap-2 pb-3.5 text-[12.5px] leading-relaxed text-ink-2">
                        <div>
                          <strong className="font-medium text-ink">
                            Settings sync cap (64 KB max):
                          </strong>{" "}
                          Synced workspace preferences stay compact (typically 1–4 KB, hard-capped
                          at 64 KB) for instant offline and cloud replication.
                        </div>
                        <div>
                          <strong className="font-medium text-ink">On-device cache:</strong>{" "}
                          Threads and the 300 MB WebGPU model stay cached locally in IndexedDB/Cache
                          Storage so they never bloat synced settings.
                        </div>
                      </div>
                    )}
                  </div>
                </SettingsSection>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="flex flex-col gap-7">
                <SettingsSection title="Theme">
                  <div className="py-4">
                    <div className="text-[13.5px] font-medium text-ink">Workspace surface</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-2">
                      Choose how Nexora renders panels, typography, and contrast.
                    </div>

                    <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ isDark: false })}
                        className={`flex items-center justify-between rounded-[11px] border p-3.5 text-left transition-colors ${
                          !settings.isDark
                            ? "border-ink bg-surface shadow-xs"
                            : "border-line bg-surface/55 hover:bg-surface"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-[8px] border border-line bg-page text-ink">
                            <Sun className="size-4" />
                          </span>
                          <div>
                            <div className="text-[13px] font-medium text-ink">Light Mode</div>
                            <div className="text-[11.5px] text-ink-3">Cool near-white canvas</div>
                          </div>
                        </div>
                        {!settings.isDark && <Check className="size-4 shrink-0 text-ink" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ isDark: true })}
                        className={`flex items-center justify-between rounded-[11px] border p-3.5 text-left transition-colors ${
                          settings.isDark
                            ? "border-ink bg-surface shadow-xs"
                            : "border-line bg-surface/55 hover:bg-surface"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-[8px] border border-line bg-page text-ink">
                            <Moon className="size-4" />
                          </span>
                          <div>
                            <div className="text-[13px] font-medium text-ink">Dark Mode</div>
                            <div className="text-[11.5px] text-ink-3">Low-glare charcoal</div>
                          </div>
                        </div>
                        {settings.isDark && <Check className="size-4 shrink-0 text-ink" />}
                      </button>
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection title="Layout & Typography">
                  <SettingsRow
                    title="Message density"
                    description="Adjust vertical spacing between turns and cards."
                  >
                    <SettingsSelect
                      ariaLabel="Message density"
                      value={settings.density}
                      onChange={(next) =>
                        onUpdateSettings({ density: next as "comfortable" | "compact" })
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </SettingsSelect>
                  </SettingsRow>

                  <SettingsRow
                    title="Reader scale"
                    description="Set typography size for streamed responses."
                  >
                    <SettingsSelect
                      ariaLabel="Reader scale"
                      value={settings.fontScale}
                      onChange={(next) =>
                        onUpdateSettings({ fontScale: next as "default" | "large" })
                      }
                    >
                      <option value="default">Default</option>
                      <option value="large">Large</option>
                    </SettingsSelect>
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}

            {activeTab === "models" && (
              <div className="flex flex-col gap-7">
                <SettingsSection title="Built-in Assistant">
                  <SettingsRow
                    title="Nexora Assistant · Generic"
                    description="Built-in workspace assistant handled by the Nexora server."
                  >
                    <span className="inline-flex h-8 items-center rounded-[9px] border border-line-strong/80 bg-surface px-3 text-[12px] font-medium text-ink-2 shadow-xs">
                      Default
                    </span>
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection
                  title="Custom Provider (BYOK)"
                  action={<span className="text-[12px] text-ink-3">Stored on this device</span>}
                >
                  <div className="py-4">
                    <div className="text-[13.5px] font-medium text-ink">Provider template</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-2">
                      Select a provider preset or define a custom OpenAI-compatible base URL.
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {BYOK_PRESETS.map((preset) => {
                        const active = draftByok.preset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setFetchError(null);
                              setModelFilter("");
                              const isBuiltInBase = BYOK_PRESETS.some(
                                (p) => p.baseUrl && p.baseUrl === draftByok.baseUrl
                              );
                              updateDraftByok({
                                preset: preset.id,
                                baseUrl:
                                  preset.id === "custom"
                                    ? isBuiltInBase
                                      ? ""
                                      : draftByok.baseUrl
                                    : preset.baseUrl,
                                fetchedModels: [],
                              });
                            }}
                            className={`flex h-9 items-center justify-center rounded-[10px] border px-2 text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                              active
                                ? "border-ink bg-surface text-ink shadow-xs"
                                : "border-line bg-surface/55 text-ink-2 hover:bg-surface hover:text-ink"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3.5 py-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-medium text-ink">Base URL</span>
                      <input
                        type="url"
                        value={draftByok.baseUrl}
                        onChange={(e) => updateDraftByok({ baseUrl: e.target.value })}
                        placeholder="https://api.openai.com/v1"
                        className="h-9 rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[13px] text-ink shadow-xs outline-none transition-colors placeholder:text-ink-3 focus:border-ink"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="flex items-center justify-between text-[12.5px] font-medium text-ink">
                        <span>API Key</span>
                        <span className="text-[11.5px] font-normal text-ink-3">
                          {draftByok.apiKey.trim() ? "Configured" : "Not set"}
                        </span>
                      </span>
                      <div className="relative flex items-center">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={draftByok.apiKey}
                          onChange={(e) => updateDraftByok({ apiKey: e.target.value })}
                          placeholder={activePreset.placeholderKey}
                          className="h-9 w-full rounded-[10px] border border-line-strong/80 bg-surface pl-3.5 pr-10 text-[13px] text-ink shadow-xs outline-none transition-colors placeholder:text-ink-3 focus:border-ink"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((v) => !v)}
                          aria-label={showApiKey ? "Hide API key" : "Show API key"}
                          className="absolute right-1.5 flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                        >
                          {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col gap-3.5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-ink">Model selection</div>
                        <div className="mt-0.5 text-[12.5px] text-ink-2">
                          Fetch models from the provider endpoint and select any to use in chat.
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={fetchingModels}
                        onClick={() => void handleFetchModels()}
                        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`size-3.5 ${fetchingModels ? "animate-spin" : ""}`}
                        />
                        <span>{fetchingModels ? "Fetching…" : "Fetch models"}</span>
                      </button>
                    </div>

                    {fetchError && (
                      <div className="rounded-[10px] bg-red-tint px-3.5 py-2.5 text-[12.5px] font-medium text-red">
                        {fetchError}
                      </div>
                    )}

                    {draftByok.fetchedModels.length > 0 && (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] font-medium text-ink-2">
                            {draftByok.selectedModels.length} selected ·{" "}
                            {draftByok.fetchedModels.length} fetched
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={selectAllFilteredModels}
                              className="text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
                            >
                              {modelFilter.trim() ? "Select matching" : "Select all"}
                            </button>
                            {draftByok.selectedModels.length > 0 && (
                              <button
                                type="button"
                                onClick={clearSelectedModels}
                                className="text-[12px] font-medium text-red transition-opacity hover:opacity-80"
                              >
                                Clear selection
                              </button>
                            )}
                          </div>
                        </div>

                        {draftByok.fetchedModels.length > 6 && (
                          <input
                            type="text"
                            value={modelFilter}
                            onChange={(e) => setModelFilter(e.target.value)}
                            placeholder={`Filter ${draftByok.fetchedModels.length} fetched models…`}
                            aria-label="Filter fetched models"
                            className="h-9 rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-ink"
                          />
                        )}

                        <div
                          role="group"
                          aria-label="Fetched models"
                          className="max-h-56 divide-y divide-line overflow-y-auto rounded-[10px] border border-line-strong/80 bg-surface"
                        >
                          {filteredFetchedModels.length === 0 ? (
                            <div className="px-3.5 py-4 text-center text-[12.5px] text-ink-3">
                              No fetched models match &ldquo;{modelFilter.trim()}&rdquo;.
                            </div>
                          ) : (
                            filteredFetchedModels.map((id) => {
                              const checked = draftByok.selectedModels.includes(id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={checked}
                                  onClick={() => toggleSelectedModel(id)}
                                  className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-[12.5px] transition-colors ${
                                    checked
                                      ? "bg-hover font-medium text-ink"
                                      : "text-ink-2 hover:bg-hover/60 hover:text-ink"
                                  }`}
                                >
                                  <span className="min-w-0 truncate">{id}</span>
                                  <span
                                    className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                                      checked
                                        ? "border-ink bg-ink text-page"
                                        : "border-line-strong bg-transparent"
                                    }`}
                                  >
                                    {checked && <Check className="size-3" strokeWidth={2.5} />}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12.5px] font-medium text-ink-2">
                        Add custom Model ID
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customModelDraft}
                          onChange={(e) => setCustomModelDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomModel();
                            }
                          }}
                          placeholder={activePreset.placeholderModel}
                          className="h-9 min-w-0 flex-1 rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[13px] text-ink shadow-xs outline-none placeholder:text-ink-3 focus:border-ink"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomModel}
                          disabled={!customModelDraft.trim()}
                          className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover disabled:opacity-45"
                        >
                          <Plus className="size-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>

                    {draftByok.selectedModels.length > 0 && (
                      <div className="flex flex-col gap-2 pt-0.5">
                        <span className="text-[12px] font-medium text-ink-2">
                          Selected models ({draftByok.selectedModels.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {draftByok.selectedModels.map((id) => (
                            <span
                              key={id}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-[8px] border border-line-strong/80 bg-surface px-2.5 py-1 text-[12px] font-medium text-ink shadow-xs"
                            >
                              <span className="truncate">{id}</span>
                              <button
                                type="button"
                                onClick={() => toggleSelectedModel(id)}
                                aria-label={`Remove ${id}`}
                                className="flex size-3.5 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <span
                      className={`text-[12.5px] ${saveError ? "font-medium text-red" : "text-ink-2"}`}
                    >
                      {saveError
                        ? saveError
                        : byokJustSaved && savedCountNotice
                          ? `Saved ${savedCountNotice} model${savedCountNotice === 1 ? "" : "s"}. Provider & API key reset for your next entry.`
                          : isByokDirty
                            ? "Ready to save selected models."
                            : "Select models or enter a custom ID, then save."}
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveByok}
                      className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-ink px-4 text-[12.5px] font-medium text-surface transition-opacity hover:opacity-90"
                    >
                      {byokJustSaved && <Check className="size-3.5" />}
                      <span>{byokJustSaved ? "Saved" : "Save"}</span>
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection
                  title={`Saved Models${savedModels.length > 0 ? ` (${savedModels.length})` : ""}`}
                  action={
                    savedModels.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleClearAllSavedModels}
                        className="text-[12px] font-medium text-red transition-opacity hover:opacity-80"
                      >
                        Delete all
                      </button>
                    ) : undefined
                  }
                >
                  {savedModels.length === 0 ? (
                    <div className="py-4 text-[12.5px] text-ink-3">
                      No custom models saved yet. Add a provider, API key, and models above.
                    </div>
                  ) : (
                    savedModels.map((item) => {
                      const presetLabel =
                        BYOK_PRESETS.find((p) => p.id === item.preset)?.label ?? "Custom";
                      let hostLabel = item.baseUrl;
                      try {
                        hostLabel = item.baseUrl ? new URL(item.baseUrl).hostname : "";
                      } catch {
                        // Keep raw baseUrl
                      }
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 py-3.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13.5px] font-medium text-ink">
                                {item.id}
                              </span>
                              <span className="shrink-0 rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
                                {presetLabel}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[12px] text-ink-3">
                              {hostLabel ? `${hostLabel} · ` : ""}
                              {item.apiKey ? "API key saved" : "No API key"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedModel(item.id)}
                            aria-label={`Delete ${item.id}`}
                            title={`Delete ${item.id}`}
                            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line-strong/70 bg-surface text-ink-3 shadow-xs transition-colors hover:border-red/40 hover:bg-red-tint hover:text-red"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </SettingsSection>
              </div>
            )}

            {activeTab === "sound" && (
              <div className="flex flex-col gap-7">
                <SettingsSection title="Notifications & Voice">
                  <SettingsRow
                    title="Response completion tone"
                    description="Play a subtle tone when a streamed reply settles."
                  >
                    <SettingToggle
                      checked={settings.completionChime}
                      onChange={(completionChime) => onUpdateSettings({ completionChime })}
                      label="Response completion tone"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Spoken status updates"
                    description="Speak brief audio cues when generation starts, completes, or encounters an error."
                  >
                    <SettingToggle
                      checked={settings.spokenStatusUpdates}
                      onChange={(spokenStatusUpdates) =>
                        onUpdateSettings({ spokenStatusUpdates })
                      }
                      label="Spoken status updates"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Auto-submit voice input"
                    description="Send dictated prompts automatically when recording stops."
                  >
                    <SettingToggle
                      checked={settings.voiceAutoSubmit}
                      onChange={(voiceAutoSubmit) => onUpdateSettings({ voiceAutoSubmit })}
                      label="Auto-submit voice input"
                    />
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Audio Profile">
                  <SettingsRow
                    title="Feedback style"
                    description="Choose the cue played for actions and confirmations."
                  >
                    <SettingsSelect
                      ariaLabel="Feedback style"
                      value={settings.soundProfile}
                      onChange={(next) =>
                        onUpdateSettings({
                          soundProfile: next as "chime" | "click" | "muted",
                        })
                      }
                    >
                      <option value="chime">Soft chime</option>
                      <option value="click">Click</option>
                      <option value="muted">Muted</option>
                    </SettingsSelect>
                  </SettingsRow>

                  <SettingsRow
                    title={
                      <span className="inline-flex items-center gap-2">
                        {settings.soundProfile === "muted" || settings.volume === 0 ? (
                          <VolumeX className="size-4 text-ink-3" />
                        ) : (
                          <Volume2 className="size-4 text-ink-2" />
                        )}
                        <span>Output level</span>
                      </span>
                    }
                    description={
                      <span className="tabular-nums">
                        {settings.soundProfile === "muted"
                          ? "Muted"
                          : `Volume at ${settings.volume}%`}
                      </span>
                    }
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        aria-label="Output volume"
                        disabled={settings.soundProfile === "muted"}
                        value={settings.soundProfile === "muted" ? 0 : settings.volume}
                        onChange={(e) => onUpdateSettings({ volume: Number(e.target.value) })}
                        className="h-1.5 w-32 accent-ink disabled:opacity-40 sm:w-36"
                      />
                      <button
                        type="button"
                        disabled={settings.soundProfile === "muted" || settings.volume === 0}
                        onClick={onTestSound}
                        className="h-9 shrink-0 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Test sound
                      </button>
                    </div>
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}

            {activeTab === "shortcuts" && (
              <div className="flex flex-col gap-7">
                <SettingsSection
                  title="Workspace & Navigation"
                  action={
                    <span className="text-[12px] text-ink-3">⌘ also supported on macOS</span>
                  }
                >
                  <SettingsRow
                    title="New chat"
                    description="Start a fresh conversation and focus the prompt composer."
                  >
                    <ShortcutKeys keys={["Ctrl", "N"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Quick search"
                    description="Open chat search to quickly find and jump to any thread."
                  >
                    <ShortcutKeys keys={["Ctrl", "K"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Toggle sidebar"
                    description="Expand or collapse the left workspace sidebar."
                  >
                    <ShortcutKeys keys={["Ctrl", "/"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Toggle settings"
                    description="Open Settings or return to your active conversation."
                  >
                    <ShortcutKeys keys={["Ctrl", ","]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Toggle theme"
                    description="Switch between Light Mode and Dark Mode."
                  >
                    <ShortcutKeys keys={["Ctrl", "Shift", "L"]} />
                  </SettingsRow>
                </SettingsSection>

                <SettingsSection title="Composer & Generation">
                  <SettingsRow
                    title="Focus prompt input"
                    description="Return to chat and place focus directly inside the composer."
                  >
                    <ShortcutKeys keys={["Shift", "Esc"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Send message"
                    description={
                      settings.sendOnEnter
                        ? "Currently set to send immediately on Enter."
                        : "Currently set to require a modifier while Enter adds a new line."
                    }
                  >
                    <ShortcutKeys keys={settings.sendOnEnter ? ["Enter"] : ["Ctrl", "Enter"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="New line"
                    description="Insert a line break inside the prompt composer without sending."
                  >
                    <ShortcutKeys keys={settings.sendOnEnter ? ["Shift", "Enter"] : ["Enter"]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Stop response generation"
                    description="Cancel an active streamed assistant response."
                  >
                    <ShortcutKeys keys={["Ctrl", "."]} />
                  </SettingsRow>

                  <SettingsRow
                    title="Close menus & dialogs"
                    description="Dismiss open search popovers, dropdown menus, or modals."
                  >
                    <ShortcutKeys keys={["Esc"]} />
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}

            {activeTab === "account" && (
              <div className="flex flex-col gap-7">
                {currentUser ? (
                  <>
                    <SettingsSection title="Profile">
                      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                        <div className="flex min-w-0 items-center gap-3.5">
                          {currentUser.avatarUrl &&
                          failedAvatarUrl !== currentUser.avatarUrl ? (
                            <span className="size-11 shrink-0 overflow-hidden rounded-full bg-surface shadow-hairline">
                              <img
                                src={currentUser.avatarUrl}
                                alt={currentUser.name}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedAvatarUrl(currentUser.avatarUrl ?? null)
                                }
                                className="size-full object-cover"
                              />
                            </span>
                          ) : (
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-surface">
                              {currentUser.initials}
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium text-ink">
                              {currentUser.name}
                            </div>
                            <div className="mt-0.5 truncate text-[12.5px] text-ink-2">
                              {currentUser.email}
                              {authProviderLabel ? ` · ${authProviderLabel}` : ""}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onSignOut()}
                          className="h-9 shrink-0 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover"
                        >
                          Sign out
                        </button>
                      </div>
                    </SettingsSection>

                    <SettingsSection title="Cloud Synchronization">
                      <SettingsRow
                        title="Workspace sync"
                        description={`${threadCount} conversation${threadCount === 1 ? "" : "s"} · ${
                          syncedNotice
                            ? "Synced just now"
                            : "Chats, preferences, and adaptive prompts stay synced across reloads."
                        }`}
                      >
                        <button
                          type="button"
                          disabled={syncingNow}
                          onClick={() => {
                            setSyncingNow(true);
                            setSyncedNotice(false);
                            void onSyncNow()
                              .then(() => setSyncedNotice(true))
                              .finally(() => setSyncingNow(false));
                          }}
                          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-xs transition-colors hover:bg-hover disabled:opacity-50"
                        >
                          <RefreshCw className={`size-3.5 ${syncingNow ? "animate-spin" : ""}`} />
                          <span>{syncingNow ? "Syncing…" : "Sync now"}</span>
                        </button>
                      </SettingsRow>
                    </SettingsSection>
                  </>
                ) : (
                  <SettingsSection title="Profile">
                    <SettingsRow
                      title="Sign in to Nexora"
                      description="Sync your chat history, Firebase cloud backup, and workspace preferences with Google or email."
                    >
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="h-9 shrink-0 whitespace-nowrap rounded-[10px] bg-ink px-4 text-[12.5px] font-medium text-surface transition-opacity hover:opacity-90"
                      >
                        Login / Create account
                      </button>
                    </SettingsRow>
                  </SettingsSection>
                )}
              </div>
            )}

            {activeTab === "beta" && (
              <div className="flex flex-col gap-7">
                <SettingsSection title="On-Device AI">
                  <SettingsRow
                    title="Local AI model (WebGPU)"
                    description="Run an on-device ~300 MB quantized model directly in your browser using WebGPU (works offline)."
                  >
                    <SettingToggle
                      checked={settings.localModelEnabled}
                      onChange={(next) => {
                        onUpdateSettings({ localModelEnabled: next });
                        if (!next) onClearLocalModel();
                      }}
                      label="Local AI model with WebGPU"
                    />
                  </SettingsRow>

                  {settings.localModelEnabled && (
                    <div className="flex flex-col gap-3.5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-ink">
                            SmolLM2 360M (4-bit quantized WebGPU)
                          </div>
                          <div className="mt-0.5 text-[12.5px] tabular-nums text-ink-2">
                            ~300 MB weights ·{" "}
                            {hasWebGpu
                              ? "WebGPU API detected"
                              : "WebGPU not supported in this browser"}
                          </div>
                        </div>

                        {localModelStatus === "idle" && (
                          <button
                            type="button"
                            onClick={onDownloadLocalModel}
                            className="h-9 shrink-0 whitespace-nowrap rounded-[10px] bg-ink px-3.5 text-[12.5px] font-medium text-surface transition-opacity hover:opacity-90"
                          >
                            Download (~300 MB)
                          </button>
                        )}

                        {localModelStatus === "ready" && (
                          <div className="flex items-center gap-2">
                            {onUseLocalModel && (
                              <button
                                type="button"
                                onClick={onUseLocalModel}
                                className="h-9 shrink-0 whitespace-nowrap rounded-[10px] bg-ink px-3.5 text-[12.5px] font-medium text-surface transition-opacity hover:opacity-90"
                              >
                                Use in chat
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={onClearLocalModel}
                              className="h-9 shrink-0 whitespace-nowrap rounded-[10px] border border-line-strong/80 bg-surface px-3 text-[12.5px] font-medium text-ink-2 shadow-xs transition-colors hover:bg-hover hover:text-ink"
                            >
                              Remove cache
                            </button>
                          </div>
                        )}
                      </div>

                      {localError && (
                        <div className="rounded-[10px] bg-red-tint px-3.5 py-2.5 text-[12.5px] text-red">
                          {localError}
                        </div>
                      )}

                      {localModelStatus === "downloading" && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums text-ink-2">
                            <span className="truncate">
                              {localStatusText || "Downloading & compiling WebGPU shaders…"}
                            </span>
                            <span className="shrink-0">{localDownloadProgress}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover-2">
                            <div
                              className="h-full rounded-full bg-ink transition-[width] duration-150 ease-out"
                              style={{ width: `${localDownloadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {localModelStatus === "ready" && (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="text-[12.5px] text-ink-2">
                            Cached on device · Active as{" "}
                            <span className="font-medium text-ink">Nexora Nano (Local)</span> in the
                            composer
                          </div>

                          <SettingsSelect
                            ariaLabel="Execution backend"
                            value={settings.localBackend}
                            onChange={(next) =>
                              onUpdateSettings({ localBackend: next as LocalBackend })
                            }
                          >
                            <option value="webgpu">WebGPU</option>
                            <option value="cpu">Fallback (CPU)</option>
                          </SettingsSelect>
                        </div>
                      )}
                    </div>
                  )}
                </SettingsSection>

                <SettingsSection
                  title="Experimental Features"
                  action={<span className="text-[12px] text-ink-3">Preview builds</span>}
                >
                  <SettingsRow
                    title="Reasoning & search traces"
                    description="Expandable step-by-step trace shown during generation."
                  >
                    <SettingToggle
                      checked={settings.betaTraces}
                      onChange={(betaTraces) => onUpdateSettings({ betaTraces })}
                      label="Reasoning and search traces"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Inline selection actions"
                    description="Floating edit actions when text selection tools are active."
                  >
                    <SettingToggle
                      checked={settings.betaSelectionBar}
                      onChange={(betaSelectionBar) => onUpdateSettings({ betaSelectionBar })}
                      label="Inline selection actions"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Live voice visualizer"
                    description="Animated microphone waveform inside the prompt composer."
                  >
                    <SettingToggle
                      checked={settings.betaVoiceWave}
                      onChange={(betaVoiceWave) => onUpdateSettings({ betaVoiceWave })}
                      label="Live voice visualizer"
                    />
                  </SettingsRow>

                  <SettingsRow
                    title="Collapsed command search"
                    description="Floating live-filtered chat search popover when the sidebar is closed."
                  >
                    <SettingToggle
                      checked={settings.betaCommandSearch}
                      onChange={(betaCommandSearch) => onUpdateSettings({ betaCommandSearch })}
                      label="Collapsed command search"
                    />
                  </SettingsRow>
                </SettingsSection>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

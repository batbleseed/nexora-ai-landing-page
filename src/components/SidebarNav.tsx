"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { ChatFolder } from "../data/workspaceThreads";
import {
  IconArrowBoxLeft,
  IconChevronDownSmall,
  IconCrossSmall,
  IconEditBig,
  IconMagnifyingGlass,
  IconSettingsGear1,
  IconSidebarLeftArrow,
} from "./icons/CentralIcons";
import { NexoraLogo } from "./icons/NexoraLogo";
import GlideMenu from "./primitives/GlideMenu";

/* ─────────────────────────────────────────────────────────
 * SIDEBAR NAV
 * Compact workspace header, New chat action, Pinned threads,
 * collapsible Folder groups, searchable chat history, and
 * an account menu with real auth, settings, and theme toggle.
 * ───────────────────────────────────────────────────────── */

const WORKSPACE = { key: "nexora", name: "Nexora" };

export type SidebarRecent = {
  id: string;
  label: string;
  prompt?: string;
  pinned?: boolean;
  folderId?: string | null;
};

export type SidebarAccount = {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl?: string;
};

function ProfileAvatar({
  user,
  sizeClass,
  fallbackClass,
}: {
  user: SidebarAccount | null;
  sizeClass: string;
  fallbackClass: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [user?.avatarUrl]);

  if (user?.avatarUrl && !imgFailed) {
    return (
      <span className={`relative shrink-0 overflow-hidden bg-inset ${sizeClass}`}>
        <img
          src={user.avatarUrl}
          alt={user.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="size-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center font-semibold ${sizeClass} ${fallbackClass}`}>
      {user ? user.initials : "G"}
    </span>
  );
}

type SidebarNavProps = {
  activeThreadId?: string | null;
  activeTitle?: string | null;
  className?: string;
  fill?: boolean;
  isMobile?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  searchTrigger?: number;
  onNewChat?: () => void;
  onPick?: (id: string, label: string, prompt?: string) => void;
  recents?: SidebarRecent[];
  folders?: ChatFolder[];
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (folderId: string, name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onTogglePin?: (threadId: string) => void;
  currentUser?: SidebarAccount | null;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  variant?: string;
};

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 0,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

const CHAT_SEARCH_MOTION = {
  duration: 180,
  closedWidth: 28,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

function GlideGroup({ children }: { children: ReactNode }) {
  return (
    <GlideMenu
      rowSelector="[data-row]"
      highlightClassName="sidebar-glide-highlight rounded-[7px] bg-hover-2"
      className="group/glide flex flex-col gap-px"
    >
      {children}
    </GlideMenu>
  );
}

function RailButton({
  icon,
  label,
  active = false,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  count?: string;
  onClick?: () => void;
}) {
  return (
    <button
      data-row
      type="button"
      onClick={onClick}
      className={`sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] px-2 text-left
        transition-[width,background-color,color,transform] duration-150 active:scale-[0.98]
        ${active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""}`}
    >
      <span className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-ink" : "text-ink-2"}`}>
        {icon}
      </span>
      <span className={`sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium ${active ? "text-ink" : "text-ink-2"}`}>
        {label}
      </span>
      {count && (
        <span className="sidebar-copy mr-2 shrink-0 text-[12px] font-medium tabular-nums text-ink-3">
          {count}
        </span>
      )}
    </button>
  );
}

function ThemeIcon({ isDark }: { isDark: boolean }) {
  return isDark ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function AccountMenu({
  position,
  currentUser,
  isDark,
  onOpenAuth,
  onSignOut,
  onToggleTheme,
  onOpenSettings,
  onClose,
}: {
  position: { bottom: number; left: number };
  currentUser: SidebarAccount | null;
  isDark: boolean;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      data-account-menu
      className="fixed z-[60] w-64 rounded-[14px] bg-surface p-1.5 shadow-overlay"
      style={{
        bottom: position.bottom,
        left:
          typeof window !== "undefined"
            ? Math.max(12, Math.min(position.left, window.innerWidth - 268))
            : position.left,
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        transformOrigin: "bottom left",
      }}
    >
      <GlideMenu className="flex flex-col gap-px" highlightClassName="inset-x-0 rounded-[8px] bg-hover-2">
        {currentUser ? (
          <div className="flex items-center gap-2.5 px-2 py-2">
            <ProfileAvatar
              user={currentUser}
              sizeClass="size-8 rounded-full text-[11px]"
              fallbackClass="bg-hover-2 text-ink ring-1 ring-line"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium leading-tight text-ink">
                {currentUser.name}
              </div>
              <div className="truncate text-[11px] leading-tight text-ink-3">
                {currentUser.email}
              </div>
            </div>
          </div>
        ) : (
          <button
            data-menu-row
            type="button"
            onClick={() => {
              onOpenAuth?.();
              onClose();
            }}
            className="relative z-10 flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-hover-2 text-[11px] font-semibold text-ink ring-1 ring-line">
              N
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
              Sign in / Create account
            </span>
          </button>
        )}

        <div className="my-1 h-px bg-line" />

        <button
          data-menu-row
          type="button"
          onClick={() => {
            onToggleTheme?.();
            onClose();
          }}
          className="relative z-10 flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
            <ThemeIcon isDark={isDark} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
            {isDark ? "Light mode" : "Dark mode"}
          </span>
        </button>

        <button
          data-menu-row
          type="button"
          onClick={() => {
            onOpenSettings?.();
            onClose();
          }}
          className="relative z-10 flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
            <IconSettingsGear1 size={16} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">Settings</span>
        </button>

        {currentUser && (
          <>
            <div className="my-1 h-px bg-line" />
            <button
              data-menu-row
              type="button"
              onClick={() => {
                onSignOut?.();
                onClose();
              }}
              className="relative z-10 flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left"
            >
              <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                <IconArrowBoxLeft size={16} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">Sign out</span>
            </button>
          </>
        )}
      </GlideMenu>
    </div>,
    document.body
  );
}

export default function SidebarNav({
  activeThreadId,
  activeTitle,
  className = "",
  fill = false,
  isMobile: controlledMobile,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  searchTrigger = 0,
  onNewChat,
  onPick,
  recents = [],
  folders = [],
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onTogglePin,
  currentUser = null,
  onOpenAuth,
  onSignOut,
  isDark = false,
  onToggleTheme,
  onOpenSettings,
}: SidebarNavProps) {
  const [detectedMobile, setDetectedMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );

  useEffect(() => {
    if (controlledMobile !== undefined || typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => setDetectedMobile(e.matches);
    setDetectedMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [controlledMobile]);

  const isMobile = controlledMobile ?? detectedMobile;

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (controlledCollapsed === undefined) setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  const [demoActiveTitle, setDemoActiveTitle] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountPosition, setAccountPosition] = useState({ bottom: 0, left: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("nexora:collapsed_folders");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState("");
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newFolderFormRef = useRef<HTMLFormElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const newFolderNameRef = useRef(newFolderName);
  newFolderNameRef.current = newFolderName;

  const cancelPendingFolderIfEmpty = () => {
    if (creatingFolder && !newFolderNameRef.current.trim()) {
      setCreatingFolder(false);
      setNewFolderName("");
    }
  };

  const selectedTitle = activeTitle === undefined ? demoActiveTitle : activeTitle;
  const trimmedQuery = query.trim().toLowerCase();
  const visibleRecents = recents.filter((item) =>
    item.label.toLowerCase().includes(trimmedQuery)
  );

  const folderIdSet = new Set(folders.map((f) => f.id));
  const pinnedRecents = visibleRecents.filter((item) => Boolean(item.pinned));
  const unpinnedRecents = visibleRecents.filter((item) => !item.pinned);
  const ungroupedRecents = unpinnedRecents.filter(
    (item) => !item.folderId || !folderIdSet.has(item.folderId)
  );

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = { ...prev, [folderId]: !prev[folderId] };
      try {
        localStorage.setItem("nexora:collapsed_folders", JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  };

  useEffect(() => {
    if (!creatingFolder) return;
    newFolderInputRef.current?.focus();

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (newFolderFormRef.current?.contains(target)) return;
      if (target?.closest("[data-new-folder-trigger]")) return;
      if (!newFolderNameRef.current.trim()) {
        setCreatingFolder(false);
        setNewFolderName("");
      }
    };

    document.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [creatingFolder]);

  useEffect(() => {
    if (searchTrigger > 0) {
      setSearchOpen(true);
      const timer = window.setTimeout(() => searchRef.current?.focus(), 140);
      return () => window.clearTimeout(timer);
    }
  }, [searchTrigger]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !target.closest("[data-account-trigger]") &&
        !target.closest("[data-account-menu]")
      ) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAccountOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const collapse = () => {
    cancelPendingFolderIfEmpty();
    setCollapsed(true);
    setAccountOpen(false);
    setSearchOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!isMobile || collapsed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !accountOpen) {
        collapse();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMobile, collapsed, accountOpen]);

  if (isMobile && collapsed) {
    return null;
  }

  const sidebarBody = (
    <div className={`flex min-h-0 shrink-0 flex-col py-2 ${isMobile ? "w-full flex-1" : "w-[224px]"}`}>
        <div className="relative mb-1 h-14 shrink-0">
          <button
            type="button"
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              cancelPendingFolderIfEmpty();
              if (activeTitle === undefined) setDemoActiveTitle(null);
              onNewChat?.();
              if (isMobile) collapse();
            }}
            className="sidebar-workspace-control absolute left-2 top-3 flex h-8 w-[164px] items-center rounded-[8px] px-2 text-left transition-[background-color,transform] duration-100 hover:bg-hover-2 active:scale-[0.99]"
          >
            <span className="sidebar-logo flex size-5 shrink-0 items-center justify-center text-ink">
              <NexoraLogo size={18} />
            </span>
            <span className="sidebar-copy ml-1.5 min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
              {WORKSPACE.name}
            </span>
          </button>

          <button
            type="button"
            aria-label={isMobile ? "Close menu" : "Collapse sidebar"}
            tabIndex={collapsed ? -1 : 0}
            onClick={collapse}
            className="sidebar-collapse-control absolute right-2 top-3 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color] duration-150 hover:bg-hover-2 hover:text-ink"
          >
            {isMobile ? <IconCrossSmall size={18} /> : <IconSidebarLeftArrow size={18} />}
          </button>
        </div>

        <GlideGroup>
          <RailButton
            icon={<IconEditBig size={18} />}
            label="New chat"
            onClick={() => {
              cancelPendingFolderIfEmpty();
              if (activeTitle === undefined) setDemoActiveTitle(null);
              onNewChat?.();
              if (isMobile) collapse();
            }}
          />
        </GlideGroup>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {/* Pinned Section */}
          {pinnedRecents.length > 0 && (
            <div className="mb-3">
              <div className="sidebar-copy mx-2 mb-1 flex h-7 items-center justify-between px-2 text-[12px] font-medium text-ink-3">
                <span className="flex items-center gap-1.5">
                  <Pin className="size-3.5" aria-hidden="true" />
                  <span>Pinned</span>
                </span>
                <span className="tabular-nums text-[11px]">{pinnedRecents.length}</span>
              </div>
              <GlideGroup>
                {pinnedRecents.map((item) => {
                  const active = activeThreadId
                    ? item.id === activeThreadId
                    : item.label === selectedTitle;
                  return (
                    <div
                      key={item.id}
                      data-row
                      className={`group/row sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] transition-[background-color,color] duration-150 ${
                        active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""
                      }`}
                    >
                      <button
                        type="button"
                        title={item.label}
                        onClick={() => {
                          cancelPendingFolderIfEmpty();
                          if (activeTitle === undefined) setDemoActiveTitle(item.label);
                          onPick?.(item.id, item.label, item.prompt);
                          if (isMobile) collapse();
                        }}
                        className="flex h-full min-w-0 flex-1 items-center px-2 text-left active:scale-[0.98]"
                      >
                        <span
                          className={`sidebar-copy min-w-0 flex-1 truncate text-[13.5px] font-medium ${
                            active ? "text-ink" : "text-ink-2"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                      {onTogglePin && (
                        <button
                          type="button"
                          aria-label="Unpin chat"
                          title="Unpin chat"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(item.id);
                          }}
                          className="sidebar-copy mr-1 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover/row:opacity-100 focus-visible:opacity-100"
                        >
                          <PinOff className="size-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </GlideGroup>
            </div>
          )}

          {/* Folders Section */}
          {(folders.length > 0 || onCreateFolder) && (
            <div className="mb-3">
              <div className="sidebar-copy mx-2 mb-1 flex h-7 items-center justify-between px-2 text-[12px] font-medium text-ink-3">
                <span>Folders</span>
                {onCreateFolder && (
                  <button
                    type="button"
                    data-new-folder-trigger
                    aria-label="New folder"
                    title="New folder"
                    onClick={() => {
                      if (creatingFolder) {
                        setCreatingFolder(false);
                        setNewFolderName("");
                      } else {
                        setCreatingFolder(true);
                      }
                    }}
                    className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
                  >
                    <FolderPlus className="size-3.5" />
                  </button>
                )}
              </div>

              {creatingFolder && onCreateFolder && (
                <form
                  ref={newFolderFormRef}
                  onBlur={(e) => {
                    if (
                      !e.currentTarget.contains(e.relatedTarget as Node | null) &&
                      !newFolderName.trim()
                    ) {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = newFolderName.trim();
                    if (clean) {
                      onCreateFolder(clean);
                    }
                    setNewFolderName("");
                    setCreatingFolder(false);
                  }}
                  className="sidebar-copy mx-2 mb-1.5 flex items-center gap-1 rounded-[8px] border border-line bg-field px-2 py-1"
                >
                  <input
                    ref={newFolderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setCreatingFolder(false);
                        setNewFolderName("");
                      }
                    }}
                    placeholder="Folder name…"
                    aria-label="New folder name"
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
                  />
                  <button
                    type="submit"
                    aria-label="Save folder"
                    className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-ink-2 hover:bg-hover-2 hover:text-ink"
                  >
                    <Check className="size-3.5" />
                  </button>
                </form>
              )}

              {folders.map((folder) => {
                const folderThreads = unpinnedRecents.filter(
                  (item) => item.folderId === folder.id
                );
                const isCollapsed = trimmedQuery
                  ? false
                  : Boolean(collapsedFolders[folder.id]);
                const isRenaming = renamingFolderId === folder.id;

                return (
                  <div key={folder.id} className="mb-1">
                    {isRenaming && onRenameFolder ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const clean = renameFolderDraft.trim();
                          if (clean) onRenameFolder(folder.id, clean);
                          setRenamingFolderId(null);
                        }}
                        className="sidebar-copy mx-2 flex h-8 items-center gap-1 rounded-[8px] border border-line bg-field px-2"
                      >
                        <input
                          autoFocus
                          value={renameFolderDraft}
                          onChange={(e) => setRenameFolderDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setRenamingFolderId(null);
                          }}
                          aria-label="Rename folder"
                          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Confirm folder name"
                          className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-ink-2 hover:bg-hover-2 hover:text-ink"
                        >
                          <Check className="size-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="group/folder sidebar-copy mx-2 flex h-8 items-center rounded-[8px] transition-colors hover:bg-hover-2">
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          onClick={() => toggleFolderCollapsed(folder.id)}
                          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left"
                        >
                          <ChevronRight
                            className={`size-3.5 shrink-0 text-ink-3 transition-transform duration-150 ${
                              isCollapsed ? "" : "rotate-90"
                            }`}
                            aria-hidden="true"
                          />
                          {isCollapsed ? (
                            <Folder className="size-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                          ) : (
                            <FolderOpen className="size-3.5 shrink-0 text-ink-2" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2">
                            {folder.name}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
                            {folderThreads.length}
                          </span>
                        </button>

                        {(onRenameFolder || onDeleteFolder) && (
                          <div className="mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/folder:opacity-100 focus-within:opacity-100">
                            {onRenameFolder && (
                              <button
                                type="button"
                                aria-label={`Rename ${folder.name}`}
                                title="Rename folder"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingFolderId(folder.id);
                                  setRenameFolderDraft(folder.name);
                                }}
                                className="flex size-5 items-center justify-center rounded-[5px] text-ink-3 hover:bg-hover hover:text-ink"
                              >
                                <Pencil className="size-3" />
                              </button>
                            )}
                            {onDeleteFolder && (
                              <button
                                type="button"
                                aria-label={`Delete ${folder.name}`}
                                title="Delete folder"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteFolder(folder.id);
                                }}
                                className="flex size-5 items-center justify-center rounded-[5px] text-ink-3 hover:bg-hover hover:text-red"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!isCollapsed && (
                      <div className="mt-0.5 pl-3">
                        {folderThreads.length > 0 ? (
                          <GlideGroup>
                            {folderThreads.map((item) => {
                              const active = activeThreadId
                                ? item.id === activeThreadId
                                : item.label === selectedTitle;
                              return (
                                <div
                                  key={item.id}
                                  data-row
                                  className={`group/row sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] transition-[background-color,color] duration-150 ${
                                    active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""
                                  }`}
                                >
                                  <button
                                    type="button"
                                    title={item.label}
                                    onClick={() => {
                                      if (activeTitle === undefined) setDemoActiveTitle(item.label);
                                      onPick?.(item.id, item.label, item.prompt);
                                      if (isMobile) collapse();
                                    }}
                                    className="flex h-full min-w-0 flex-1 items-center px-2 text-left active:scale-[0.98]"
                                  >
                                    <span
                                      className={`sidebar-copy min-w-0 flex-1 truncate text-[13.5px] font-medium ${
                                        active ? "text-ink" : "text-ink-2"
                                      }`}
                                    >
                                      {item.label}
                                    </span>
                                  </button>
                                  {onTogglePin && (
                                    <button
                                      type="button"
                                      aria-label="Pin chat"
                                      title="Pin chat"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onTogglePin(item.id);
                                      }}
                                      className="sidebar-copy mr-1 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover/row:opacity-100 focus-visible:opacity-100"
                                    >
                                      <Pin className="size-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </GlideGroup>
                        ) : (
                          <div className="sidebar-copy mx-2 px-2 py-1 text-[11.5px] text-ink-3">
                            Empty folder
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chats Section (Ungrouped) */}
          <div className="sidebar-copy relative mx-2 mb-1 h-8">
            <div
              aria-hidden={searchOpen}
              className={`absolute inset-0 flex items-center gap-1.5 px-2 text-[12.5px] font-medium text-ink-3 transition-[opacity,transform] ${
                searchOpen ? "pointer-events-none -translate-x-1 opacity-0" : "translate-x-0 opacity-100"
              }`}
              style={{
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
              }}
            >
              <IconChevronDownSmall size={16} />
              <span>Chats</span>
            </div>

            <button
              type="button"
              aria-label="Search chats"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(true)}
              className={`absolute right-0 top-0 z-10 flex size-8 items-center justify-center rounded-[8px] text-ink-3 transition-[opacity,background-color,color,transform] hover:bg-hover-2 hover:text-ink active:scale-[0.96] ${
                searchOpen ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
              style={{ transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms` }}
            >
              <IconMagnifyingGlass size={16} />
            </button>

            <div
              className={`absolute right-0 top-0 z-20 flex h-8 items-center overflow-hidden rounded-[8px] bg-field text-ink-3 shadow-hairline transition-[width,opacity] focus-within:text-ink-2 ${
                searchOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              style={{
                width: searchOpen ? "100%" : CHAT_SEARCH_MOTION.closedWidth,
                transitionDuration: `${CHAT_SEARCH_MOTION.duration}ms`,
                transitionTimingFunction: CHAT_SEARCH_MOTION.easing,
              }}
            >
              <span className="ml-2 flex shrink-0 items-center justify-center">
                <IconMagnifyingGlass size={15} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setQuery("");
                  }
                }}
                placeholder="Search chats"
                aria-label="Search chat history"
                className="ml-1.5 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                aria-label="Close chat search"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
              >
                <IconCrossSmall size={16} />
              </button>
            </div>
          </div>

          <GlideGroup>
            {ungroupedRecents.map((item) => {
              const active = activeThreadId
                ? item.id === activeThreadId
                : item.label === selectedTitle;
              return (
                <div
                  key={item.id}
                  data-row
                  className={`group/row sidebar-row relative z-10 mx-2 flex h-8 items-center rounded-[8px] transition-[background-color,color] duration-150 ${
                    active ? "bg-hover-2 group-hover/glide:bg-transparent" : ""
                  }`}
                >
                  <button
                    type="button"
                    title={item.label}
                    onClick={() => {
                      cancelPendingFolderIfEmpty();
                      if (activeTitle === undefined) setDemoActiveTitle(item.label);
                      onPick?.(item.id, item.label, item.prompt);
                      if (isMobile) collapse();
                    }}
                    className="flex h-full min-w-0 flex-1 items-center px-2 text-left active:scale-[0.98]"
                  >
                    <span
                      className={`sidebar-copy min-w-0 flex-1 truncate text-[14px] font-medium ${
                        active ? "text-ink" : "text-ink-2"
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                  {onTogglePin && (
                    <button
                      type="button"
                      aria-label="Pin chat"
                      title="Pin chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(item.id);
                      }}
                      className="sidebar-copy mr-1 flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover/row:opacity-100 focus-visible:opacity-100"
                    >
                      <Pin className="size-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {query && visibleRecents.length === 0 && (
              <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">No chats found</div>
            )}
            {!query && recents.length === 0 && (
              <div className="sidebar-copy mx-2 px-2 py-2 text-[12.5px] text-ink-3">No chats yet</div>
            )}
          </GlideGroup>
        </div>

        {/* Account Footer Button + Dropdown (clean, no divider line, circular avatar) */}
        <div className="mt-2 pt-1">
          <div className="sidebar-row mx-2 flex items-center gap-1">
            <button
              ref={accountButtonRef}
              data-account-trigger
              type="button"
              aria-expanded={accountOpen}
              aria-label="Account menu"
              tabIndex={collapsed ? -1 : 0}
              onClick={() => {
                if (!accountOpen && accountButtonRef.current) {
                  const rect = accountButtonRef.current.getBoundingClientRect();
                  setAccountPosition({
                    bottom: window.innerHeight - rect.top + 6,
                    left: rect.left,
                  });
                }
                setAccountOpen((open) => !open);
              }}
              className={`relative z-10 flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition-[background-color,transform] duration-150 hover:bg-hover-2 active:scale-[0.98] ${
                accountOpen ? "bg-hover-2" : ""
              }`}
            >
              <ProfileAvatar
                user={currentUser}
                sizeClass="size-8 rounded-full text-[11px]"
                fallbackClass="bg-hover-2 text-ink ring-1 ring-line"
              />
              <span className="sidebar-copy min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-ink">
                  {currentUser ? currentUser.name : "Guest session"}
                </span>
                <span className="block truncate text-[11px] leading-tight text-ink-3">
                  {currentUser ? currentUser.email : "Sign in to sync"}
                </span>
              </span>
            </button>

            {onOpenSettings && (
              <button
                type="button"
                aria-label="Settings"
                title="Settings"
                tabIndex={collapsed ? -1 : 0}
                onClick={() => {
                  onOpenSettings();
                  if (isMobile) collapse();
                }}
                className="sidebar-copy flex size-8 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-hover-2 hover:text-ink"
              >
                <IconSettingsGear1 size={16} />
              </button>
            )}
          </div>

          {accountOpen && (
            <AccountMenu
              position={accountPosition}
              currentUser={currentUser}
              isDark={isDark}
              onOpenAuth={() => {
                onOpenAuth?.();
                if (isMobile) collapse();
              }}
              onSignOut={() => {
                onSignOut?.();
                if (isMobile) collapse();
              }}
              onToggleTheme={onToggleTheme}
              onOpenSettings={() => {
                onOpenSettings?.();
                if (isMobile) collapse();
              }}
              onClose={() => setAccountOpen(false)}
            />
          )}
        </div>
      </div>
  );

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-stretch justify-start" role="dialog" aria-modal="true" aria-label="Workspace navigation">
        <div
          aria-hidden="true"
          onClick={collapse}
          className="fixed inset-0 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-150"
        />
        <aside
          data-sidebar-collapsed="false"
          aria-label="Workspace navigation"
          style={{
            animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
            transformOrigin: "top left",
          }}
          className={`relative z-10 m-3 flex w-[min(288px,calc(100vw-24px))] flex-col overflow-hidden rounded-[18px] border border-line bg-surface shadow-overlay ${className}`}
        >
          {sidebarBody}
        </aside>
      </div>,
      document.body
    );
  }

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Workspace navigation"
      aria-hidden={collapsed}
      className={`relative flex shrink-0 overflow-hidden transition-[width] ${fill ? "h-full" : "h-[600px]"} bg-canvas ${className}`}
      style={{
        width: collapsed ? SIDEBAR_MOTION.collapsedWidth : SIDEBAR_MOTION.expandedWidth,
        transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
        transitionTimingFunction: SIDEBAR_MOTION.easing,
        "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
        "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
        "--sidebar-easing": SIDEBAR_MOTION.easing,
      } as CSSProperties}
    >
      {sidebarBody}
    </aside>
  );
}

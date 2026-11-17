"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileDown,
  Folder,
  FolderPlus,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { ChatFolder, WorkspaceThread } from "../data/workspaceThreads";

interface ChatTitleMenuProps {
  thread: WorkspaceThread;
  folders: ChatFolder[];
  onRename: (newTitle: string) => void;
  onTogglePin: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onCreateFolderAndMove: (folderName: string) => void;
  onExportPdf?: () => void;
  onDelete: () => void;
}

export default function ChatTitleMenu({
  thread,
  folders,
  onRename,
  onTogglePin,
  onMoveToFolder,
  onCreateFolderAndMove,
  onExportPdf,
  onDelete,
}: ChatTitleMenuProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename" | "folders" | "confirm-delete">("menu");
  const [renameDraft, setRenameDraft] = useState(thread.title);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 56, left: 16 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const currentFolder = folders.find((f) => f.id === thread.folderId) ?? null;

  useEffect(() => {
    setRenameDraft(thread.title);
  }, [thread.id, thread.title]);

  useEffect(() => {
    if (!open) {
      setMode("menu");
      setCreatingFolder(false);
      setNewFolderName("");
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - 272));
      setMenuPos({
        top: rect.bottom + 6,
        left,
      });
    };

    updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode !== "menu") {
          setMode("menu");
          setCreatingFolder(false);
        } else {
          setOpen(false);
        }
      }
    };

    window.addEventListener("resize", updatePosition);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, mode]);

  useEffect(() => {
    if (open && mode === "rename") {
      window.setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 20);
    }
  }, [open, mode]);

  useEffect(() => {
    if (open && mode === "folders" && creatingFolder) {
      window.setTimeout(() => {
        newFolderInputRef.current?.focus();
      }, 20);
    }
  }, [open, mode, creatingFolder]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex max-w-full items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-left text-[13.5px] font-medium text-ink transition-colors active:scale-[0.99] sm:max-w-[300px] md:max-w-[420px] ${
          open ? "bg-hover-2" : "hover:bg-hover-2"
        }`}
      >
        {thread.pinned && (
          <Pin className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">{thread.title}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-ink-3 transition-transform duration-150 ${
            open ? "rotate-180 text-ink" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Chat actions"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "top left",
            }}
            className="fixed z-50 w-64 rounded-[14px] border border-line bg-surface p-1.5 shadow-overlay"
          >
            {mode === "rename" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = renameDraft.trim();
                  if (clean) {
                    onRename(clean);
                  }
                  setOpen(false);
                }}
                className="flex flex-col gap-2 p-1.5"
              >
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setMode("menu")}
                    className="flex size-5 items-center justify-center rounded-[5px] text-ink-3 hover:bg-hover-2 hover:text-ink"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <span>Rename chat</span>
                </div>
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  placeholder="Chat name…"
                  maxLength={120}
                  className="h-8 w-full rounded-[8px] border border-line bg-field px-2.5 text-[13px] text-ink outline-none focus:border-ink-3"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="rounded-[7px] px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-hover-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-[7px] bg-ink px-2.5 py-1 text-[12px] font-medium text-surface transition-opacity hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : mode === "folders" ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between px-2 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("menu");
                      setCreatingFolder(false);
                    }}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
                  >
                    <ArrowLeft className="size-3.5" />
                    <span>Move to folder</span>
                  </button>
                  <button
                    type="button"
                    aria-label="New folder"
                    title="New folder"
                    onClick={() => setCreatingFolder((v) => !v)}
                    className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 hover:bg-hover-2 hover:text-ink"
                  >
                    <FolderPlus className="size-3.5" />
                  </button>
                </div>

                {creatingFolder && (
                  <form
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
                        onCreateFolderAndMove(clean);
                        setOpen(false);
                      } else {
                        setCreatingFolder(false);
                        setNewFolderName("");
                      }
                    }}
                    className="mx-1 mb-1 flex items-center gap-1 rounded-[8px] border border-line bg-field px-2 py-1"
                  >
                    <input
                      ref={newFolderInputRef}
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name…"
                      maxLength={60}
                      className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
                    />
                    <button
                      type="submit"
                      aria-label="Create and move"
                      className="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-ink-2 hover:bg-hover-2 hover:text-ink"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </form>
                )}

                <div className="max-h-48 overflow-y-auto">
                  {folders.length === 0 ? (
                    <div className="px-2.5 py-2 text-[12px] text-ink-3">
                      No folders yet. Create one above.
                    </div>
                  ) : (
                    folders.map((folder) => {
                      const active = thread.folderId === folder.id;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onMoveToFolder(active ? null : folder.id);
                            setOpen(false);
                          }}
                          className={`flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] transition-colors hover:bg-hover-2 ${
                            active ? "font-medium text-ink" : "text-ink-2"
                          }`}
                        >
                          <Folder className="size-4 shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                          {active && <Check className="size-3.5 shrink-0 text-ink" />}
                        </button>
                      );
                    })
                  )}
                </div>

                {thread.folderId && (
                  <>
                    <div className="my-0.5 h-px bg-line" />
                    <button
                      type="button"
                      onClick={() => {
                        onMoveToFolder(null);
                        setOpen(false);
                      }}
                      className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-hover-2 hover:text-ink"
                    >
                      Remove from folder
                    </button>
                  </>
                )}
              </div>
            ) : mode === "confirm-delete" ? (
              <div className="flex flex-col gap-2 p-2">
                <p className="text-[12.5px] font-medium text-ink">
                  Delete &ldquo;{thread.title}&rdquo;?
                </p>
                <p className="text-[11.5px] text-ink-3">
                  This conversation will be removed from your history.
                </p>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="rounded-[7px] px-2.5 py-1 text-[12px] font-medium text-ink-2 hover:bg-hover-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setOpen(false);
                    }}
                    className="rounded-[7px] bg-red px-2.5 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRenameDraft(thread.title);
                    setMode("rename");
                  }}
                  className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-ink transition-colors hover:bg-hover-2"
                >
                  <Pencil className="size-4 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">Rename</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onTogglePin();
                    setOpen(false);
                  }}
                  className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-ink transition-colors hover:bg-hover-2"
                >
                  {thread.pinned ? (
                    <>
                      <PinOff className="size-4 shrink-0 text-ink-2" />
                      <span className="min-w-0 flex-1 truncate">Unpin chat</span>
                    </>
                  ) : (
                    <>
                      <Pin className="size-4 shrink-0 text-ink-2" />
                      <span className="min-w-0 flex-1 truncate">Pin chat</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMode("folders")}
                  className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-ink transition-colors hover:bg-hover-2"
                >
                  <Folder className="size-4 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex-1 truncate">Move to folder</span>
                  {currentFolder && (
                    <span className="max-w-[76px] truncate text-[11.5px] text-ink-3">
                      {currentFolder.name}
                    </span>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-ink-3" />
                </button>

                {onExportPdf && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onExportPdf();
                      setOpen(false);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-ink transition-colors hover:bg-hover-2"
                  >
                    <FileDown className="size-4 shrink-0 text-ink-2" />
                    <span className="min-w-0 flex-1 truncate">Download PDF</span>
                  </button>
                )}

                <div className="my-1 h-px bg-line" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setMode("confirm-delete")}
                  className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13.5px] text-red transition-colors hover:bg-hover-2"
                >
                  <Trash2 className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">Delete</span>
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

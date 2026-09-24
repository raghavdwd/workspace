"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LoaderCircleIcon,
  Eye,
  Edit3,
  Trash2,
  CircleArrowLeft,
  CheckSquare,
  Sparkles,
  Share2,
  Lock,
} from "lucide-react";
import { toggleTodo } from "@/lib/todo-parser";
import { toast } from "sonner";
import { ShareNotebookModal } from "@/components/share-notebook-modal";
import { NotebookTab } from "@/interface/notebook";
import { NotebookTabsBar } from "@/components/notebook-tabs-bar";

// Types

interface NotebookData {
  id: number;
  title: string;
  subtitle: string | null;
  icon: string | null;
  content: string;
  tabs?: NotebookTab[];
  updatedAt: string | null;
  userRole?: "owner" | "editor" | "viewer";
}

interface Props {
  notebookId: number;
  onBack?: () => void;
  onDelete?: (id: number) => void;
}

// Helpers

function relativeTime(date: string | null): string {
  if (!date) return "";
  try {
    const diffMs = Date.now() - new Date(date).getTime();
    if (diffMs < 0) return "just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch {
    return "";
  }
}

export default function NotebookEditor({
  notebookId,
  onBack,
  onDelete,
}: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tabs, setTabs] = useState<NotebookTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const activeTabIdRef = useRef<number | null>(null);

  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialized, setInitialized] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Fetch notebook
  const { data, isLoading, isError } = useQuery<{ data: NotebookData }>({
    queryKey: ["notebook", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      if (!res.ok) throw new Error("Failed to load notebook");
      return res.json();
    },
  });

  const { data: userData } = useQuery<{
    data: { openrouterApiKey: string | null };
  }>({
    queryKey: ["user"],
    queryFn: async () => {
      const res = await fetch("/api/user");
      if (!res.ok) throw new Error("Failed to load user");
      return res.json();
    },
  });

  const userRole = data?.data?.userRole ?? "owner";
  const isReadOnly = userRole === "viewer";
  const isOwner = userRole === "owner";

  // Tab save mutation
  const saveTabMutation = useMutation({
    mutationFn: async ({
      tabId,
      updates,
    }: {
      tabId: number;
      updates: Record<string, unknown>;
    }) => {
      if (isReadOnly) return;
      const res = await fetch(`/api/notebooks/${notebookId}/tabs/${tabId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save tab");
      return res.json();
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      queryClient.invalidateQueries({ queryKey: ["notebook", notebookId] });
    },
    onError: () => setSaving(false),
  });

  // Notebook metadata save mutation (title, subtitle, icon)
  const saveNotebookMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (isReadOnly) return;
      const res = await fetch(`/api/notebooks/${notebookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to save notebook");
      return res.json();
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      queryClient.invalidateQueries({ queryKey: ["notebook", notebookId] });
    },
    onError: () => setSaving(false),
  });

  const scheduleSaveTab = useCallback(
    (tabId: number | null, updates: Record<string, unknown>) => {
      if (isReadOnly || !tabId) return;
      setSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTabMutation.mutate({ tabId, updates });
      }, 1200);
    },
    [saveTabMutation, isReadOnly],
  );

  const scheduleSaveNotebook = useCallback(
    (updates: Record<string, unknown>) => {
      if (isReadOnly) return;
      setSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveNotebookMutation.mutate(updates);
      }, 1200);
    },
    [saveNotebookMutation, isReadOnly],
  );

  // Tab switching with pending save flush
  const handleSelectTab = useCallback(
    (newTabId: number, currentTabs?: NotebookTab[]) => {
      if (newTabId === activeTabIdRef.current) return;

      // Flush any pending save for current tab
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (activeTabIdRef.current) {
          saveTabMutation.mutate({
            tabId: activeTabIdRef.current,
            updates: { content: contentRef.current },
          });
        }
      }

      const list = currentTabs || tabs;
      const targetTab = list.find((t) => t.id === newTabId);
      if (targetTab) {
        setActiveTabId(newTabId);
        activeTabIdRef.current = newTabId;
        setContent(targetTab.content);
        contentRef.current = targetTab.content;
      }
    },
    [tabs, saveTabMutation],
  );

  // Add tab mutation
  const addTabMutation = useMutation({
    mutationFn: async (tabTitle?: string) => {
      if (isReadOnly) return;
      const res = await fetch(`/api/notebooks/${notebookId}/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tabTitle || `Tab ${tabs.length + 1}`,
          icon: "📄",
          content: "",
        }),
      });
      if (!res.ok) throw new Error("Failed to create tab");
      return res.json();
    },
    onSuccess: (res) => {
      const newTab: NotebookTab = res.data;
      setTabs((prev) => {
        const nextTabs = [...prev, newTab];
        setTimeout(() => handleSelectTab(newTab.id, nextTabs), 0);
        return nextTabs;
      });
      toast.success(`Created tab "${newTab.title}"`);
      queryClient.invalidateQueries({ queryKey: ["notebook", notebookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Rename tab mutation
  const renameTabMutation = useMutation({
    mutationFn: async ({ tabId, title }: { tabId: number; title: string }) => {
      if (isReadOnly) return;
      const res = await fetch(`/api/notebooks/${notebookId}/tabs/${tabId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to rename tab");
      return res.json();
    },
    onSuccess: (_, variables) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === variables.tabId ? { ...t, title: variables.title } : t,
        ),
      );
      toast.success("Tab renamed");
      queryClient.invalidateQueries({ queryKey: ["notebook", notebookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Delete tab mutation
  const deleteTabMutation = useMutation({
    mutationFn: async (tabId: number) => {
      if (isReadOnly) return;
      const res = await fetch(`/api/notebooks/${notebookId}/tabs/${tabId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete tab");
      }
      return res.json();
    },
    onSuccess: (_, deletedTabId) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== deletedTabId);
        if (activeTabIdRef.current === deletedTabId && remaining.length > 0) {
          setTimeout(() => handleSelectTab(remaining[0].id, remaining), 0);
        }
        return remaining;
      });
      toast.success("Tab deleted");
      queryClient.invalidateQueries({ queryKey: ["notebook", notebookId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleDuplicateTab = (tabId: number) => {
    const sourceTab = tabs.find((t) => t.id === tabId);
    if (!sourceTab) return;
    addTabMutation.mutate(`${sourceTab.title} (Copy)`);
  };

  useEffect(() => {
    if (data?.data) {
      setTitle(data.data.title);
      const loadedTabs = data.data.tabs || [];
      setTabs(loadedTabs);

      if (loadedTabs.length > 0) {
        const currentActive = activeTabIdRef.current;
        const targetTab =
          loadedTabs.find((t) => t.id === currentActive) || loadedTabs[0];
        setActiveTabId(targetTab.id);
        activeTabIdRef.current = targetTab.id;
        setContent(targetTab.content);
        contentRef.current = targetTab.content;
      } else {
        setContent(data.data.content || "");
        contentRef.current = data.data.content || "";
      }

      setInitialized(true);
      if (data.data.userRole === "viewer") {
        setPreview(true);
      }
    }
  }, [data]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    scheduleSaveNotebook({ title: newTitle });
  };

  const replaceUploadedPlaceholder = (
    placeholder: string,
    replacement: string,
  ) => {
    setContent((current) => {
      const updated = current.replace(placeholder, replacement);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabIdRef.current ? { ...t, content: updated } : t,
        ),
      );
      scheduleSaveTab(activeTabIdRef.current, { content: updated });
      return updated;
    });
  };

  async function uploadPastedImage(
    file: File,
    placeholder: string,
    name: string,
  ) {
    const formData = new FormData();
    formData.append("file", file, name);
    formData.append("notebookId", String(notebookId));
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Image upload failed");
      const blob = (await response.json()) as { url: string };
      replaceUploadedPlaceholder(placeholder, `![${name}](${blob.url})`);
    } catch {
      const failed = `![Upload failed — ${name}](uploading)`;
      replaceUploadedPlaceholder(placeholder, failed);
      toast.error(`Upload failed for ${name}`);
    }
  }

  const handleImagePaste = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    if (isReadOnly) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;

    event.preventDefault();
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    const timestamp = Date.now();
    const placeholders = files.map(
      (_, index) =>
        `![Uploading pasted-image-${timestamp}-${index}…](uploading)`,
    );
    const inserted = placeholders.join("\n");
    const nextContent = content.slice(0, start) + inserted + content.slice(end);
    setContent(nextContent);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabIdRef.current ? { ...t, content: nextContent } : t,
      ),
    );
    scheduleSaveTab(activeTabIdRef.current, { content: nextContent });

    await Promise.all(
      files.map((file, index) => {
        const name = file.name || `pasted-image-${timestamp}-${index}.png`;
        return uploadPastedImage(file, placeholders[index], name);
      }),
    );
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const newContent = e.target.value;
    setContent(newContent);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabIdRef.current ? { ...t, content: newContent } : t,
      ),
    );
    scheduleSaveTab(activeTabIdRef.current, { content: newContent });
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const insertCheckbox = () => {
    if (isReadOnly) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const newContent = before + "- [ ] " + after;
    setContent(newContent);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabIdRef.current ? { ...t, content: newContent } : t,
      ),
    );
    scheduleSaveTab(activeTabIdRef.current, { content: newContent });

    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + 6;
      textarea.selectionStart = textarea.selectionEnd = pos;
    });
  };

  let checkboxIdx = 0;
  const toggleCheckbox = useCallback(
    (targetIdx: number) => {
      if (isReadOnly) return;
      const currentContent = contentRef.current;
      const lines = currentContent.split("\n");
      let idx = 0;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^- \[( |x)\]/);
        if (match) {
          if (idx === targetIdx) {
            const newContent = toggleTodo(currentContent, i);
            setContent(newContent);
            setTabs((prev) =>
              prev.map((t) =>
                t.id === activeTabIdRef.current ? { ...t, content: newContent } : t,
              ),
            );
            scheduleSaveTab(activeTabIdRef.current, { content: newContent });
            return;
          }
          idx++;
        }
      }
    },
    [scheduleSaveTab, isReadOnly],
  );

  const polishMutation = useMutation({
    mutationFn: async () => {
      const apiKey = userData?.data?.openrouterApiKey;
      if (!apiKey) throw new Error("No API key configured in Settings.");
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to polish note");
      return res.json();
    },
    onSuccess: (result) => {
      const polished = result.data.polished;
      if (window.confirm("Accept polished version?")) {
        setContent(polished);
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabIdRef.current ? { ...t, content: polished } : t,
          ),
        );
        scheduleSaveTab(activeTabIdRef.current, { content: polished });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete notebook");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      onDelete?.(notebookId);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <p>Failed to load notebook</p>
        <button
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ["notebook", notebookId],
            })
          }
          className="text-sm text-primary underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const notebook = data.data;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Read-Only Notice Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <Lock className="size-3.5" />
            You are viewing a read-only copy of this notebook.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
            title="Back"
          >
            <CircleArrowLeft className="size-4" />
          </button>
        )}
        <span className="text-lg leading-none">{notebook.icon || "📝"}</span>

        {/* Todo & Polish buttons — hidden in read-only mode */}
        {!preview && !isReadOnly && (
          <>
            <button
              onClick={insertCheckbox}
              className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
              title="Insert checkbox"
            >
              <CheckSquare className="size-4" />
            </button>
            <button
              onClick={() => polishMutation.mutate()}
              disabled={polishMutation.isPending}
              className="size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
              title="Polish note"
            >
              <Sparkles className="size-4" />
            </button>
          </>
        )}

        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1">
              <LoaderCircleIcon className="size-3 animate-spin" />
              Saving...
            </span>
          )}
          {!saving && initialized && (
            <span>Saved {relativeTime(notebook.updatedAt)}</span>
          )}
        </span>

        {/* Share Button */}
        <button
          onClick={() => setIsShareModalOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border bg-background hover:bg-muted transition-colors cursor-pointer"
          title="Share notebook"
        >
          <Share2 className="size-3.5 text-primary" />
          <span>Share</span>
        </button>

        {/* Preview / Edit Toggle */}
        {!isReadOnly && (
          <button
            onClick={() => setPreview(!preview)}
            className={`size-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
              preview ? "bg-accent" : "hover:bg-muted"
            }`}
            title={preview ? "Edit" : "Preview"}
          >
            {preview ? <Edit3 className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}

        {/* Delete (Owner only) */}
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="size-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-destructive transition-colors cursor-pointer"
              title="Delete"
            >
              <Trash2 className="size-4" />
            </button>
            {showDeleteConfirm && (
              <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-3 z-10 w-48">
                <p className="text-sm mb-2">Delete this notebook?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 text-xs px-2 py-1 rounded-md border hover:bg-muted transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      deleteMutation.mutate();
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex-1 text-xs px-2 py-1 rounded-md bg-destructive text-destructive-foreground hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document Tabs Bar */}
      {tabs.length > 0 && (
        <NotebookTabsBar
          tabs={tabs}
          activeTabId={activeTabId ?? tabs[0]?.id ?? 0}
          onSelectTab={(tabId) => handleSelectTab(tabId)}
          onAddTab={() => addTabMutation.mutate()}
          onRenameTab={(tabId, newTitle) =>
            renameTabMutation.mutate({ tabId, title: newTitle })
          }
          onDuplicateTab={handleDuplicateTab}
          onDeleteTab={(tabId) => deleteTabMutation.mutate(tabId)}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Editor body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-3xl mx-auto w-full px-8 py-6 flex-1 flex flex-col min-h-0">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            disabled={isReadOnly}
            placeholder="Untitled"
            className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-6 shrink-0 disabled:opacity-90"
          />

          <div className="flex-1 overflow-y-auto">
            {preview || isReadOnly ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    input: (props) => {
                      if (props.type === "checkbox") {
                        const idx = checkboxIdx;
                        checkboxIdx++;
                        return (
                          <input
                            type="checkbox"
                            checked={props.checked ?? false}
                            disabled={isReadOnly}
                            onChange={() => toggleCheckbox(idx)}
                            className="cursor-pointer"
                          />
                        );
                      }
                      return <input {...props} />;
                    },
                  }}
                >
                  {content || "*No content yet*"}
                </ReactMarkdown>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onPaste={handleImagePaste}
                placeholder="Start writing in markdown..."
                className="w-full min-h-full bg-transparent border-none outline-none resize-none leading-relaxed sm:leading-7 text-[15px] sm:text-base font-mono text-foreground placeholder:text-muted-foreground/35 selection:bg-primary/20"
              />
            )}
          </div>
        </div>
      </div>

      {/* Editor Status Bar */}
      <div className="border-t bg-muted/20 px-6 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
          <span>•</span>
          <span>{content.length} characters</span>
        </div>
        <div className="flex items-center gap-2">
          {tabs.length > 1 && (
            <span>
              Tab {Math.max(1, tabs.findIndex((t) => t.id === activeTabId) + 1)} of {tabs.length}
            </span>
          )}
        </div>
      </div>

      {/* Share Modal Component */}
      <ShareNotebookModal
        notebookId={notebookId}
        notebookTitle={title}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
}

"use client";

import { use, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LoaderCircleIcon,
  Lock,
  Globe,
  PanelLeftClose,
  PanelLeft,
  Search,
  Check,
  Copy,
  Plus,
  FileText,
  Clock,
  Eye,
  Edit3,
  ExternalLink,
  Menu,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SharedTab {
  id: number;
  notebookId: number;
  title: string;
  icon: string | null;
  content: string;
  orderIndex: number;
  updatedAt?: string | null;
}

interface SharedNotebookData {
  id: number;
  title: string;
  subtitle: string | null;
  icon: string | null;
  content: string;
  tabs: SharedTab[];
  publicAccess: "viewer" | "editor";
  role: "viewer" | "editor";
  updatedAt: string | null;
  owner: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

function extractHeadings(markdown: string) {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ level, text, id });
  }
  return headings;
}

function CodeBlock({
  className,
  children,
  ...props
}: React.ComponentProps<"code">) {
  const [copied, setCopied] = useState(false);
  const codeText = String(children).replace(/\n$/, "");
  const isInline = !className && !codeText.includes("\n");

  if (isInline) {
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Code copied to clipboard");
  };

  const language = className?.replace("language-", "") || "text";

  return (
    <div className="relative group my-4 rounded-xl border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/60 text-xs text-muted-foreground font-mono">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed">
        <code {...props}>{children}</code>
      </div>
    </div>
  );
}

export default function PublicSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const queryClient = useQueryClient();

  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [tabContent, setTabContent] = useState<string>("");
  const [tabsState, setTabsState] = useState<SharedTab[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  const tabContentRef = useRef<string>("");

  useEffect(() => {
    tabContentRef.current = tabContent;
  }, [tabContent]);

  const { data, isLoading, isError, error } = useQuery<{
    data: SharedNotebookData;
  }>({
    queryKey: ["public-notebook", token],
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Shared notebook not found");
      }
      return res.json();
    },
  });

  const notebook = data?.data;
  const isEditor = notebook?.role === "editor";

  // Initialize tabs from query
  useEffect(() => {
    if (notebook) {
      const loadedTabs = notebook.tabs || [];
      setTabsState(loadedTabs);

      if (loadedTabs.length > 0) {
        const currentActive = activeTabIdRef.current;
        const targetTab =
          loadedTabs.find((t) => t.id === currentActive) || loadedTabs[0];
        setActiveTabId(targetTab.id);
        activeTabIdRef.current = targetTab.id;
        setTabContent(targetTab.content);
        tabContentRef.current = targetTab.content;
      } else {
        setTabContent(notebook.content || "");
        tabContentRef.current = notebook.content || "";
      }
    }
  }, [notebook]);

  // Tab Save Mutation for Public Editor
  const saveTabMutation = useMutation({
    mutationFn: async ({
      tabId,
      content,
    }: {
      tabId: number;
      content: string;
    }) => {
      if (!isEditor) return;
      const res = await fetch(`/api/share/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId, content }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      return res.json();
    },
    onSuccess: () => {
      setSaving(false);
    },
    onError: (err: Error) => {
      setSaving(false);
      toast.error(err.message);
    },
  });

  const scheduleSave = useCallback(
    (tabId: number | null, newContent: string) => {
      if (!isEditor || !tabId) return;
      setSaving(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTabMutation.mutate({ tabId, content: newContent });
      }, 1200);
    },
    [isEditor, saveTabMutation],
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea height to fit content seamlessly like document canvas
  useEffect(() => {
    if (isEditMode && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.max(500, textareaRef.current.scrollHeight)}px`;
    }
  }, [tabContent, isEditMode]);

  // Rename Tab Mutation for Public Editor
  const renameTabMutation = useMutation({
    mutationFn: async ({ tabId, title }: { tabId: number; title: string }) => {
      if (!isEditor) return;
      const res = await fetch(`/api/share/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId, title }),
      });
      if (!res.ok) throw new Error("Failed to rename tab");
      return res.json();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleRenameTab = (tabId: number, newTitle: string) => {
    if (!isEditor || !tabId) return;
    setTabsState((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)),
    );
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      renameTabMutation.mutate({ tabId, title: newTitle });
    }, 800);
  };

  // Add Tab Mutation for Public Editor
  const addTabMutation = useMutation({
    mutationFn: async () => {
      if (!isEditor) return;
      const res = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Tab ${tabsState.length + 1}`,
          icon: "📄",
          content: "",
        }),
      });
      if (!res.ok) throw new Error("Failed to create tab");
      return res.json();
    },
    onSuccess: (res) => {
      const newTab: SharedTab = res.data;
      setTabsState((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      activeTabIdRef.current = newTab.id;
      setTabContent("");
      tabContentRef.current = "";
      setIsEditMode(true);
      toast.success(`Created tab "${newTab.title}"`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSelectTab = (tabId: number) => {
    if (tabId === activeTabIdRef.current) return;

    // Flush any pending save
    if (saveTimer.current && activeTabIdRef.current && isEditor) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      saveTabMutation.mutate({
        tabId: activeTabIdRef.current,
        content: tabContentRef.current,
      });
    }

    const targetTab = tabsState.find((t) => t.id === tabId);
    if (targetTab) {
      setActiveTabId(tabId);
      activeTabIdRef.current = tabId;
      setTabContent(targetTab.content);
      tabContentRef.current = targetTab.content;
      setMobileDrawerOpen(false);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isEditor) return;
    const newContent = e.target.value;
    setTabContent(newContent);
    tabContentRef.current = newContent;
    setTabsState((prev) =>
      prev.map((t) =>
        t.id === activeTabIdRef.current ? { ...t, content: newContent } : t,
      ),
    );
    scheduleSave(activeTabIdRef.current, newContent);
  };

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Share link copied to clipboard");
    }
  };

  // Filtered tabs by search query
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabsState;
    return tabsState.filter((tab) =>
      tab.title.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [tabsState, searchQuery]);

  const activeTab = useMemo(() => {
    return tabsState.find((t) => t.id === activeTabId) || tabsState[0];
  }, [tabsState, activeTabId]);

  // Headings for active tab
  const headings = useMemo(() => {
    return extractHeadings(tabContent);
  }, [tabContent]);

  // Stats
  const wordCount = useMemo(() => {
    return tabContent.trim() ? tabContent.trim().split(/\s+/).length : 0;
  }, [tabContent]);

  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <LoaderCircleIcon className="size-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">
          Loading shared notebook...
        </p>
      </div>
    );
  }

  if (isError || !notebook) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center space-y-4">
        <div className="size-14 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
          <Lock className="size-7" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h1 className="text-xl font-bold">Access Restricted</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "This notebook is private or the share link has expired."}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors inline-block"
        >
          Go to Workspace
        </Link>
      </div>
    );
  }

  const renderTabsList = () => (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tabs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-muted/50 border rounded-lg text-xs placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tabs Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
          <span>Document Tabs ({tabsState.length})</span>
          {isEditor && (
            <button
              onClick={() => addTabMutation.mutate()}
              className="text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5 cursor-pointer"
              title="Add tab"
            >
              <Plus className="size-3.5" />
              <span>New</span>
            </button>
          )}
        </div>

        {filteredTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const tabWords = tab.content.trim()
            ? tab.content.trim().split(/\s+/).length
            : 0;

          return (
            <button
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all text-left cursor-pointer ${
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <span className="text-sm shrink-0">
                {tab.icon || <FileText className="size-3.5" />}
              </span>
              <span className="truncate flex-1 font-medium">{tab.title}</span>
              {tabWords > 0 && (
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {tabWords}w
                </span>
              )}
            </button>
          );
        })}

        {filteredTabs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No tabs match &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* Owner Info & Access Footer */}
      <div className="p-3 border-t bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
            {notebook.owner.username[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">
              {notebook.owner.displayName || notebook.owner.username}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              Author • Public {notebook.role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur px-4 sm:px-6 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Drawer Trigger */}
          <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
            <SheetTrigger asChild>
              <button
                className="lg:hidden p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                title="Open tabs navigation"
              >
                <Menu className="size-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span>{notebook.icon || "📝"}</span>
                  <span className="truncate">{notebook.title}</span>
                </SheetTitle>
              </SheetHeader>
              {renderTabsList()}
            </SheetContent>
          </Sheet>

          {/* Desktop Sidebar Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={sidebarOpen ? "Hide tabs sidebar" : "Show tabs sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeft className="size-4" />
            )}
          </button>

          {/* Logo & Notebook Title Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <img src="/grid.png" alt="Workspace" className="size-6 shrink-0" />
            <span className="font-semibold text-sm hidden sm:inline">
              Workspace
            </span>
            <span className="text-muted-foreground/40 hidden sm:inline">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base shrink-0">
                {notebook.icon || "📝"}
              </span>
              <span className="font-semibold text-sm truncate max-w-[140px] sm:max-w-xs">
                {notebook.title}
              </span>
            </div>
          </div>

          {/* Public Access Badge */}
          <span className="hidden md:flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <Globe className="size-3" />
            {isEditor ? "Collaborative Editor" : "Public Viewer"}
          </span>
        </div>

        {/* Right Action Bar */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Edit / Preview Mode Switcher (Editor Only) */}
          {isEditor && (
            <div className="flex items-center bg-muted p-0.5 rounded-lg border text-xs">
              <button
                onClick={() => setIsEditMode(false)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  !isEditMode
                    ? "bg-background text-foreground shadow-xs font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Preview"
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
              <button
                onClick={() => setIsEditMode(true)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  isEditMode
                    ? "bg-background text-foreground shadow-xs font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Edit"
              >
                <Edit3 className="size-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            </div>
          )}

          {/* Copy Share Link Button */}
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
            title="Copy share link"
          >
            {copiedLink ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          {/* Open in Workspace CTA */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-3.5 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shadow-xs"
          >
            <span>Open in App</span>
            <ExternalLink className="size-3 hidden sm:inline" />
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar (Collapsible) */}
        {sidebarOpen && (
          <aside className="hidden lg:flex flex-col w-64 border-r bg-muted/10 shrink-0">
            {renderTabsList()}
          </aside>
        )}

        {/* Center Content Document Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Tab Header Banner */}
            <div className="pb-4 border-b space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-2xl shrink-0">{activeTab?.icon || "📄"}</span>
                  {isEditor && isEditMode ? (
                    <input
                      type="text"
                      value={activeTab?.title || ""}
                      onChange={(e) =>
                        handleRenameTab(activeTabIdRef.current || 0, e.target.value)
                      }
                      placeholder="Untitled Tab"
                      className="w-full text-2xl sm:text-3xl font-bold tracking-tight bg-transparent border-none outline-none placeholder:text-muted-foreground/30 focus:outline-none"
                    />
                  ) : (
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                      {activeTab?.title || "Untitled Tab"}
                    </h1>
                  )}
                </div>

                {/* Status / Reading Stats */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  {saving && (
                    <span className="flex items-center gap-1 text-primary font-medium">
                      <LoaderCircleIcon className="size-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                  {!saving && isEditor && (
                    <span className="flex items-center gap-1 text-muted-foreground/70">
                      <Check className="size-3 text-emerald-500" />
                      All changes saved
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {readingMinutes} min read
                  </span>
                  <span>•</span>
                  <span>{wordCount} words</span>
                </div>
              </div>

              {notebook.subtitle && (
                <p className="text-sm text-muted-foreground">
                  {notebook.subtitle}
                </p>
              )}
            </div>

            {/* Content Area: View or Edit */}
            {isEditor && isEditMode ? (
              <div className="w-full pt-1">
                <textarea
                  ref={textareaRef}
                  value={tabContent}
                  onChange={handleContentChange}
                  className="w-full min-h-[500px] bg-transparent border-none outline-none resize-none leading-relaxed sm:leading-7 text-[15px] sm:text-base font-mono text-foreground placeholder:text-muted-foreground/35 selection:bg-primary/20 overflow-hidden"
                  placeholder="Start writing in markdown..."
                />
              </div>
            ) : (
              <div className="prose prose-neutral dark:prose-invert max-w-none pt-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: CodeBlock,
                    h1: ({ children }) => {
                      const text = String(children);
                      const id = text
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, "")
                        .replace(/\s+/g, "-");
                      return (
                        <h1 id={id} className="scroll-mt-20 font-bold">
                          {children}
                        </h1>
                      );
                    },
                    h2: ({ children }) => {
                      const text = String(children);
                      const id = text
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, "")
                        .replace(/\s+/g, "-");
                      return (
                        <h2 id={id} className="scroll-mt-20 font-semibold">
                          {children}
                        </h2>
                      );
                    },
                    h3: ({ children }) => {
                      const text = String(children);
                      const id = text
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, "")
                        .replace(/\s+/g, "-");
                      return (
                        <h3 id={id} className="scroll-mt-20 font-medium">
                          {children}
                        </h3>
                      );
                    },
                  }}
                >
                  {tabContent || "*No content in this tab yet*"}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </main>

        {/* Right Table of Contents (TOC) for Desktop */}
        {headings.length > 0 && !isEditMode && (
          <aside className="hidden xl:block w-60 border-l p-6 shrink-0 overflow-y-auto">
            <div className="sticky top-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On This Page
              </p>
              <nav className="space-y-1.5 text-xs">
                {headings.map((h, i) => (
                  <a
                    key={`${h.id}-${i}`}
                    href={`#${h.id}`}
                    className={`block text-muted-foreground hover:text-foreground transition-colors truncate ${
                      h.level === 1
                        ? "font-medium"
                        : h.level === 2
                          ? "pl-3 text-muted-foreground/90"
                          : "pl-6 text-muted-foreground/70"
                    }`}
                  >
                    {h.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>

      {/* Editor & Document Status Bar */}
      <footer className="border-t bg-muted/20 px-6 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{tabContent.length} characters</span>
          <span>•</span>
          <span>{readingMinutes} min read</span>
        </div>
        <div className="flex items-center gap-2">
          {tabsState.length > 1 && (
            <span>
              Tab {Math.max(1, tabsState.findIndex((t) => t.id === activeTabId) + 1)} of {tabsState.length}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

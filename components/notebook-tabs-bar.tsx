"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  FileText,
  Check,
  X,
} from "lucide-react";
import { NotebookTab } from "@/interface/notebook";

interface NotebookTabsBarProps {
  tabs: NotebookTab[];
  activeTabId: number;
  onSelectTab: (tabId: number) => void;
  onAddTab: () => void;
  onRenameTab: (tabId: number, newTitle: string) => void;
  onDuplicateTab?: (tabId: number) => void;
  onDeleteTab: (tabId: number) => void;
  isReadOnly?: boolean;
}

export function NotebookTabsBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onRenameTab,
  onDuplicateTab,
  onDeleteTab,
  isReadOnly = false,
}: NotebookTabsBarProps) {
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [menuOpenTabId, setMenuOpenTabId] = useState<number | null>(null);
  const [tabToDelete, setTabToDelete] = useState<NotebookTab | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingTabId !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTabId]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuOpenTabId !== null) {
        setMenuOpenTabId(null);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [menuOpenTabId]);

  const startRename = (tab: NotebookTab) => {
    if (isReadOnly) return;
    setEditingTabId(tab.id);
    setEditingTitle(tab.title);
    setMenuOpenTabId(null);
  };

  const commitRename = (tabId: number) => {
    const trimmed = editingTitle.trim();
    if (trimmed && trimmed !== tabs.find((t) => t.id === tabId)?.title) {
      onRenameTab(tabId, trimmed);
    }
    setEditingTabId(null);
  };

  const cancelRename = () => {
    setEditingTabId(null);
  };

  return (
    <div className="flex items-center border-b bg-muted/40 px-2 shrink-0 select-none overflow-x-auto no-scrollbar">
      <div
        ref={tabsContainerRef}
        className="flex items-center gap-1 py-1 flex-1 min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              className={`group relative flex items-center h-8 px-2.5 rounded-md text-xs transition-all cursor-pointer max-w-[200px] border ${
                isActive
                  ? "bg-background text-foreground font-medium shadow-xs border-border border-b-transparent"
                  : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground border-transparent"
              }`}
              onClick={() => {
                if (!isEditing) onSelectTab(tab.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(tab);
              }}
              title={tab.title}
            >
              {/* Tab Icon */}
              <span className="mr-1.5 text-xs flex-shrink-0">
                {tab.icon || <FileText className="size-3.5" />}
              </span>

              {/* Title or Inline Edit Input */}
              {isEditing ? (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(tab.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={() => commitRename(tab.id)}
                    className="w-24 bg-background border px-1 py-0.5 rounded text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => commitRename(tab.id)}
                    className="size-4 flex items-center justify-center text-primary hover:bg-muted rounded"
                  >
                    <Check className="size-3" />
                  </button>
                  <button
                    onClick={cancelRename}
                    className="size-4 flex items-center justify-center text-muted-foreground hover:bg-muted rounded"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <span className="truncate pr-1">{tab.title}</span>
              )}

              {/* Tab Context Action Menu Trigger (Visible on hover or active) */}
              {!isReadOnly && !isEditing && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenTabId(menuOpenTabId === tab.id ? null : tab.id);
                  }}
                  className={`size-4 ml-1 flex items-center justify-center rounded hover:bg-muted transition-opacity ${
                    isActive ? "opacity-70 group-hover:opacity-100" : "opacity-0 group-hover:opacity-70"
                  }`}
                  title="Tab options"
                >
                  <MoreHorizontal className="size-3" />
                </button>
              )}

              {/* Context Dropdown Menu */}
              {menuOpenTabId === tab.id && (
                <div
                  className="absolute left-0 top-full mt-1 w-36 rounded-md border bg-popover p-1 shadow-md z-50 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => startRename(tab)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground hover:bg-muted cursor-pointer"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                    Rename
                  </button>

                  {onDuplicateTab && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenTabId(null);
                        onDuplicateTab(tab.id);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-popover-foreground hover:bg-muted cursor-pointer"
                    >
                      <Copy className="size-3 text-muted-foreground" />
                      Duplicate
                    </button>
                  )}

                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenTabId(null);
                        setTabToDelete(tab);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer"
                    >
                      <Trash2 className="size-3" />
                      Delete tab
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Tab Button */}
        {!isReadOnly && (
          <button
            type="button"
            onClick={onAddTab}
            className="flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
            title="Add tab"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Add tab</span>
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {tabToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setTabToDelete(null)}
        >
          <div
            className="bg-background rounded-lg border shadow-lg p-4 max-w-sm w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-sm">Delete tab &quot;{tabToDelete.title}&quot;?</h3>
            <p className="text-xs text-muted-foreground">
              This will permanently remove this tab and its contents from the notebook.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTabToDelete(null)}
                className="px-3 py-1.5 rounded-md border text-xs hover:bg-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteTab(tabToDelete.id);
                  setTabToDelete(null);
                }}
                className="px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs hover:opacity-90 cursor-pointer"
              >
                Delete tab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

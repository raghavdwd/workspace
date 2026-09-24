import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/db";
import { notebookTabsTable } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { updateTabSchema } from "@/interface/notebook";
import { getUserIdFromRequest, getNotebookWithRole } from "@/lib/notebook-auth";

// PATCH /api/notebooks/[id]/tabs/[tabId] — update tab details or content
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tabId: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request);
    const { id, tabId: rawTabId } = await params;
    const notebookId = Number(id);
    const tabId = Number(rawTabId);

    if (isNaN(notebookId) || isNaN(tabId)) {
      return NextResponse.json({ message: "Invalid notebook or tab ID" }, { status: 400 });
    }

    const { notebook, role } = await getNotebookWithRole(notebookId, userId);

    if (!notebook) {
      return NextResponse.json({ message: "Notebook not found" }, { status: 404 });
    }

    if (role !== "owner" && role !== "editor") {
      return NextResponse.json(
        { message: "You do not have permission to edit this notebook" },
        { status: 403 },
      );
    }

    const [existingTab] = await db
      .select()
      .from(notebookTabsTable)
      .where(
        and(
          eq(notebookTabsTable.id, tabId),
          eq(notebookTabsTable.notebookId, notebookId),
        ),
      )
      .limit(1);

    if (!existingTab) {
      return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const validation = updateTabSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(validation.data)) {
      if (value !== undefined) updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "No fields to update" }, { status: 400 });
    }

    const [updatedTab] = await db
      .update(notebookTabsTable)
      .set(updates)
      .where(eq(notebookTabsTable.id, tabId))
      .returning();

    return NextResponse.json({ data: updatedTab });
  } catch (error) {
    console.error("Update tab error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

// DELETE /api/notebooks/[id]/tabs/[tabId] — delete a tab (must have at least 1 remaining)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tabId: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request);
    const { id, tabId: rawTabId } = await params;
    const notebookId = Number(id);
    const tabId = Number(rawTabId);

    if (isNaN(notebookId) || isNaN(tabId)) {
      return NextResponse.json({ message: "Invalid notebook or tab ID" }, { status: 400 });
    }

    const { notebook, role } = await getNotebookWithRole(notebookId, userId);

    if (!notebook) {
      return NextResponse.json({ message: "Notebook not found" }, { status: 404 });
    }

    if (role !== "owner" && role !== "editor") {
      return NextResponse.json(
        { message: "You do not have permission to edit this notebook" },
        { status: 403 },
      );
    }

    // Check count of tabs
    const [{ tabCount }] = await db
      .select({ tabCount: count() })
      .from(notebookTabsTable)
      .where(eq(notebookTabsTable.notebookId, notebookId));

    if (Number(tabCount) <= 1) {
      return NextResponse.json(
        { message: "Cannot delete the last remaining tab in a notebook" },
        { status: 400 },
      );
    }

    const [deletedTab] = await db
      .delete(notebookTabsTable)
      .where(
        and(
          eq(notebookTabsTable.id, tabId),
          eq(notebookTabsTable.notebookId, notebookId),
        ),
      )
      .returning();

    if (!deletedTab) {
      return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Tab deleted successfully", data: deletedTab });
  } catch (error) {
    console.error("Delete tab error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

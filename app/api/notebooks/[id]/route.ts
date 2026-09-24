import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/db";
import { notebooksTable, notebookTabsTable, notebookSharesTable, notificationsTable } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { updateNotebookSchema } from "@/interface/notebook";
import { getUserIdFromRequest, getNotebookWithRole } from "@/lib/notebook-auth";

// GET /api/notebooks/[id] — get single notebook with permission calculation and tabs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request);
    const { id } = await params;
    const notebookId = Number(id);
    if (isNaN(notebookId)) {
      return NextResponse.json({ message: "Invalid notebook ID" }, { status: 400 });
    }

    const { notebook, role } = await getNotebookWithRole(notebookId, userId);

    if (!notebook) {
      return NextResponse.json({ message: "Notebook not found" }, { status: 404 });
    }

    if (!role) {
      return NextResponse.json(
        { message: userId ? "Access denied" : "Unauthorized" },
        { status: userId ? 403 : 401 },
      );
    }

    // Fetch ordered tabs for the notebook
    let tabs = await db
      .select()
      .from(notebookTabsTable)
      .where(eq(notebookTabsTable.notebookId, notebookId))
      .orderBy(asc(notebookTabsTable.orderIndex), asc(notebookTabsTable.id));

    // If notebook has no tabs yet, auto-create initial tab
    if (tabs.length === 0) {
      const [newTab] = await db
        .insert(notebookTabsTable)
        .values({
          notebookId,
          title: "Main",
          icon: notebook.icon || "📄",
          content: notebook.content || "",
          orderIndex: 0,
        })
        .returning();
      tabs = [newTab];
    }

    return NextResponse.json({
      data: {
        ...notebook,
        tabs,
        userRole: role,
      },
    });
  } catch (error) {
    console.error("Get notebook error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

// PATCH /api/notebooks/[id] — update a notebook (owner or editor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request);
    const { id } = await params;
    const notebookId = Number(id);
    if (isNaN(notebookId)) {
      return NextResponse.json({ message: "Invalid notebook ID" }, { status: 400 });
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

    const body = await request.json();
    const validation = updateNotebookSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0].message },
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

    const [updated] = await db
      .update(notebooksTable)
      .set(updates)
      .where(eq(notebooksTable.id, notebookId))
      .returning();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Update notebook error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

// DELETE /api/notebooks/[id] — delete a notebook (owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const notebookId = Number(id);
    if (isNaN(notebookId)) {
      return NextResponse.json({ message: "Invalid notebook ID" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(notebooksTable)
      .where(
        and(
          eq(notebooksTable.id, notebookId),
          eq(notebooksTable.userId, userId),
        ),
      )
      .returning({ id: notebooksTable.id, title: notebooksTable.title });

    if (!deleted) {
      return NextResponse.json(
        { message: "Notebook not found or permission denied" },
        { status: 404 },
      );
    }

    await db.insert(notificationsTable).values({
      userId,
      type: "notebook_deleted",
      message: `Notebook "${deleted.title}" was deleted`,
      isRead: false,
    });

    return NextResponse.json({ message: "Notebook deleted" });
  } catch (error) {
    console.error("Delete notebook error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

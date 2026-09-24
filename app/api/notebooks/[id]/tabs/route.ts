import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/db";
import { notebookTabsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createTabSchema } from "@/interface/notebook";
import { getUserIdFromRequest, getNotebookWithRole } from "@/lib/notebook-auth";

// POST /api/notebooks/[id]/tabs — create a new tab inside a notebook
export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const validation = createTabSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    // Determine next orderIndex
    let nextOrder = validation.data.orderIndex;
    if (nextOrder === undefined) {
      const [lastTab] = await db
        .select({ orderIndex: notebookTabsTable.orderIndex })
        .from(notebookTabsTable)
        .where(eq(notebookTabsTable.notebookId, notebookId))
        .orderBy(desc(notebookTabsTable.orderIndex))
        .limit(1);
      nextOrder = lastTab ? lastTab.orderIndex + 1 : 0;
    }

    const [newTab] = await db
      .insert(notebookTabsTable)
      .values({
        notebookId,
        title: validation.data.title || "New Tab",
        icon: validation.data.icon || "📄",
        content: validation.data.content || "",
        orderIndex: nextOrder,
      })
      .returning();

    return NextResponse.json({ data: newTab }, { status: 201 });
  } catch (error) {
    console.error("Create tab error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

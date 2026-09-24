import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/db";
import { notebookTabsTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { reorderTabsSchema } from "@/interface/notebook";
import { getUserIdFromRequest, getNotebookWithRole } from "@/lib/notebook-auth";

// PUT /api/notebooks/[id]/tabs/reorder — reorder tabs
export async function PUT(
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
    const validation = reorderTabsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: validation.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const { tabIds } = validation.data;

    // Update each tab's orderIndex
    await Promise.all(
      tabIds.map((tabId, index) =>
        db
          .update(notebookTabsTable)
          .set({ orderIndex: index })
          .where(
            and(
              eq(notebookTabsTable.id, tabId),
              eq(notebookTabsTable.notebookId, notebookId),
            ),
          ),
      ),
    );

    return NextResponse.json({ message: "Tabs reordered successfully" });
  } catch (error) {
    console.error("Reorder tabs error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}

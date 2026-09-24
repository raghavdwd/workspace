import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/db";
import { notebooksTable, notebookTabsTable, usersTable } from "@/db/schema";
import { eq, and, ne, asc } from "drizzle-orm";
import { updateTabSchema, createTabSchema } from "@/interface/notebook";

// GET /api/share/[token] — fetch public notebook details and ordered tabs by share token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ message: "Token is required" }, { status: 400 });
    }

    const [notebook] = await db
      .select({
        id: notebooksTable.id,
        title: notebooksTable.title,
        subtitle: notebooksTable.subtitle,
        icon: notebooksTable.icon,
        content: notebooksTable.content,
        publicAccess: notebooksTable.publicAccess,
        createdAt: notebooksTable.createdAt,
        updatedAt: notebooksTable.updatedAt,
        owner: {
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(notebooksTable)
      .innerJoin(usersTable, eq(notebooksTable.userId, usersTable.id))
      .where(
        and(
          eq(notebooksTable.shareToken, token),
          ne(notebooksTable.publicAccess, "off"),
        ),
      )
      .limit(1);

    if (!notebook) {
      return NextResponse.json(
        { message: "Shared notebook not found or link has expired" },
        { status: 404 },
      );
    }

    // Fetch tabs
    let tabs = await db
      .select()
      .from(notebookTabsTable)
      .where(eq(notebookTabsTable.notebookId, notebook.id))
      .orderBy(asc(notebookTabsTable.orderIndex), asc(notebookTabsTable.id));

    if (tabs.length === 0) {
      const [newTab] = await db
        .insert(notebookTabsTable)
        .values({
          notebookId: notebook.id,
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
        role: notebook.publicAccess, // "viewer" or "editor"
      },
    });
  } catch (error) {
    console.error("Get public notebook error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}

// PATCH /api/share/[token] — update a tab in a publicly shared notebook (if publicAccess === "editor")
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ message: "Token is required" }, { status: 400 });
    }

    const [notebook] = await db
      .select({ id: notebooksTable.id, publicAccess: notebooksTable.publicAccess })
      .from(notebooksTable)
      .where(eq(notebooksTable.shareToken, token))
      .limit(1);

    if (!notebook || notebook.publicAccess !== "editor") {
      return NextResponse.json(
        { message: "You do not have permission to edit this notebook" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { tabId, ...tabUpdates } = body;

    if (!tabId) {
      return NextResponse.json({ message: "tabId is required" }, { status: 400 });
    }

    const validation = updateTabSchema.safeParse(tabUpdates);
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
      .where(
        and(
          eq(notebookTabsTable.id, Number(tabId)),
          eq(notebookTabsTable.notebookId, notebook.id),
        ),
      )
      .returning();

    if (!updatedTab) {
      return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    }

    return NextResponse.json({ data: updatedTab });
  } catch (error) {
    console.error("Public tab update error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}

// POST /api/share/[token] — create a new tab in a publicly shared notebook (if publicAccess === "editor")
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ message: "Token is required" }, { status: 400 });
    }

    const [notebook] = await db
      .select({ id: notebooksTable.id, publicAccess: notebooksTable.publicAccess })
      .from(notebooksTable)
      .where(eq(notebooksTable.shareToken, token))
      .limit(1);

    if (!notebook || notebook.publicAccess !== "editor") {
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

    const [newTab] = await db
      .insert(notebookTabsTable)
      .values({
        notebookId: notebook.id,
        title: validation.data.title || "New Tab",
        icon: validation.data.icon || "📄",
        content: validation.data.content || "",
      })
      .returning();

    return NextResponse.json({ data: newTab }, { status: 201 });
  } catch (error) {
    console.error("Public create tab error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}

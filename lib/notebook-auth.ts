import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { db } from "@/db/db";
import { notebooksTable, notebookSharesTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export function getUserIdFromRequest(request: NextRequest): number | null {
  const token = request.cookies.get("accessToken")?.value;
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    return decoded.user.id;
  } catch {
    return null;
  }
}

export type EffectiveNotebookRole = "owner" | "editor" | "viewer" | null;

export async function getNotebookWithRole(
  notebookId: number,
  userId: number | null,
) {
  const [notebook] = await db
    .select()
    .from(notebooksTable)
    .where(eq(notebooksTable.id, notebookId))
    .limit(1);

  if (!notebook) {
    return { notebook: null, role: null as EffectiveNotebookRole };
  }

  let role: EffectiveNotebookRole = null;

  if (userId && notebook.userId === userId) {
    role = "owner";
  } else if (userId) {
    const [share] = await db
      .select({ role: notebookSharesTable.role })
      .from(notebookSharesTable)
      .where(
        and(
          eq(notebookSharesTable.notebookId, notebookId),
          eq(notebookSharesTable.sharedWithUserId, userId),
        ),
      )
      .limit(1);

    if (share) {
      role = share.role;
    }
  }

  if (!role && notebook.publicAccess !== "off") {
    role = notebook.publicAccess as "editor" | "viewer";
  }

  return { notebook, role };
}

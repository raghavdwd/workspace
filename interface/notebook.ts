import { z } from "zod";

export const createNotebookSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  subtitle: z.string().max(255).optional().default(""),
  icon: z.string().max(10).optional(),
  content: z.string().optional().default(""),
});

export const updateNotebookSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  subtitle: z.string().max(255).optional(),
  icon: z.string().max(10).optional(),
  content: z.string().optional(),
});

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;
export type UpdateNotebookInput = z.infer<typeof updateNotebookSchema>;

export const createTabSchema = z.object({
  title: z.string().min(1, "Tab title is required").max(255).optional().default("Tab"),
  icon: z.string().max(10).optional().default("📄"),
  content: z.string().optional().default(""),
  orderIndex: z.number().int().optional(),
});

export const updateTabSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  icon: z.string().max(10).optional(),
  content: z.string().optional(),
  orderIndex: z.number().int().optional(),
});

export const reorderTabsSchema = z.object({
  tabIds: z.array(z.number().int()).min(1),
});

export type CreateTabInput = z.infer<typeof createTabSchema>;
export type UpdateTabInput = z.infer<typeof updateTabSchema>;
export type ReorderTabsInput = z.infer<typeof reorderTabsSchema>;

export interface NotebookTab {
  id: number;
  notebookId: number;
  title: string;
  icon: string | null;
  content: string;
  orderIndex: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

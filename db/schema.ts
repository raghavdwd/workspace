import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
  boolean,
  text,
} from "drizzle-orm/pg-core";

// defining the role enum type first before using it in the table
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const shareRoleEnum = pgEnum("share_role", ["editor", "viewer"]);
export const publicAccessEnum = pgEnum("public_access", [
  "off",
  "viewer",
  "editor",
]);

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({ length: 255 }).notNull().unique(),
  displayName: varchar({ length: 255 }),
  avatarUrl: text(),
  password: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  role: roleEnum().default("user"),
  otp: varchar({ length: 6 }),
  otpExpiresAt: timestamp("otp_expires_at"),
  openrouterApiKey: varchar("openrouter_api_key", { length: 255 }),
  isVerified: boolean().default(false),
  resetPwdToken: varchar({ length: 255 }),
  resetPwdTokenExpiresAt: timestamp("reset_pwd_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notebooksTable = pgTable("notebooks", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar({ length: 255 }).notNull(),
  subtitle: varchar({ length: 255 }),
  icon: varchar({ length: 10 }).default("📝"),
  content: text().notNull().default(""),
  shareToken: varchar({ length: 64 }).unique(),
  publicAccess: publicAccessEnum("public_access").default("off"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notebookTabsTable = pgTable("notebook_tabs", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  notebookId: integer("notebook_id")
    .notNull()
    .references(() => notebooksTable.id, { onDelete: "cascade" }),
  title: varchar({ length: 255 }).notNull().default("Tab 1"),
  icon: varchar({ length: 10 }).default("📄"),
  content: text().notNull().default(""),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notebookSharesTable = pgTable("notebook_shares", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  notebookId: integer()
    .notNull()
    .references(() => notebooksTable.id, { onDelete: "cascade" }),
  sharedWithUserId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: shareRoleEnum("role").default("viewer").notNull(),
  invitedByUserId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notificationsTable = pgTable("notifications", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: varchar({ length: 50 }).notNull(),
  message: text().notNull(),
  isRead: boolean().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

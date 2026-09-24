CREATE TABLE "notebook_tabs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notebook_tabs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"notebook_id" integer NOT NULL,
	"title" varchar(255) DEFAULT 'Tab 1' NOT NULL,
	"icon" varchar(10) DEFAULT '📄',
	"content" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "notebook_tabs" ADD CONSTRAINT "notebook_tabs_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "notebook_tabs" ("notebook_id", "title", "icon", "content", "order_index")
SELECT "id", 'Main', COALESCE("icon", '📄'), COALESCE("content", ''), 0
FROM "notebooks";
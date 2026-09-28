CREATE TABLE "rendered_pdfs" (
	"key" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

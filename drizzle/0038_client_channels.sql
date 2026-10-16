ALTER TABLE "chat_channels" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_channels_person_idx" ON "chat_channels" USING btree ("person_id");--> statement-breakpoint
-- Back-fill: every existing client gets their own channel. Members are read live from assignments, so none are stored.
INSERT INTO "chat_channels" ("name", "icon", "tint", "is_private", "person_id")
SELECT trim("first_name" || ' ' || "last_name"), 'person', 'primary', false, "id" FROM "people"
WHERE NOT EXISTS (SELECT 1 FROM "chat_channels" c WHERE c."person_id" = "people"."id");

-- Every contact and every group gets an owner.
--
-- Written by hand after `pnpm db:generate`: the generated version adds
-- `user_id` as NOT NULL at once, which fails on the rows that exist. Here the
-- column is added empty, the existing rows get the owner, and only then it
-- becomes NOT NULL. All of it runs in one transaction (drizzle applies the
-- pending migrations together): if any step fails, the database stays as it was.

-- 1. The column, empty for now
ALTER TABLE "contacts" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "user_id" text;--> statement-breakpoint

-- 2. The existing rows go to the user with the address OWNER_EMAIL. The address
-- comes from src/db/migrate.ts through the setting crm.owner_email, so it is
-- not in this file in the public repository. Without it, and with rows in the
-- tables, the migration fails and the deploy stops. An empty database needs
-- no owner.
DO $$
DECLARE
  owner_email text := nullif(lower(btrim(coalesce(current_setting('crm.owner_email', true), ''))), '');
  owner_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM "contacts") OR EXISTS (SELECT 1 FROM "groups") THEN
    IF owner_email IS NULL THEN
      RAISE EXCEPTION 'OWNER_EMAIL is not set: existing contacts and groups need an owner';
    END IF;

    SELECT "id" INTO owner_id FROM "users" WHERE "email" = owner_email;
    IF owner_id IS NULL THEN
      owner_id := gen_random_uuid()::text;
      INSERT INTO "users" ("id", "name", "email", "email_verified")
      VALUES (owner_id, '', owner_email, true);
    END IF;

    UPDATE "contacts" SET "user_id" = owner_id;
    UPDATE "groups" SET "user_id" = owner_id;
  END IF;
END $$;--> statement-breakpoint

-- 3. From now on the owner is required, and one user cannot have two groups
-- with the same name in any letter case (instead of one such name in the
-- whole database)
ALTER TABLE "contacts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_user_id_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
DROP INDEX "groups_name_lower_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "groups_user_id_name_lower_idx" ON "groups" USING btree ("user_id",lower("name"));

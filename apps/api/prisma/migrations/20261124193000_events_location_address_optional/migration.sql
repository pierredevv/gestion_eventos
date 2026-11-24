-- Make venue fields optional until the organizer confirms them.
ALTER TABLE "events" ALTER COLUMN "location" DROP NOT NULL;
ALTER TABLE "events" ALTER COLUMN "address" DROP NOT NULL;

-- Rollback (run manually if this migration is reverted):
-- UPDATE "events" SET "location" = '', "address" = '' WHERE "location" IS NULL OR "address" IS NULL;
-- ALTER TABLE "events" ALTER COLUMN "location" SET NOT NULL;
-- ALTER TABLE "events" ALTER COLUMN "address" SET NOT NULL;

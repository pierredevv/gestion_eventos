-- Allow each event to decide whether attendee name and email are required.
ALTER TABLE "events"
  ADD COLUMN "require_attendee_details" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "attendees" ALTER COLUMN "full_name" DROP NOT NULL;
ALTER TABLE "attendees" ALTER COLUMN "email" DROP NOT NULL;

-- Rollback (run manually if this migration is reverted):
-- UPDATE "attendees"
--   SET "full_name" = 'Asistente', "email" = 'sin-correo@example.com'
--   WHERE "full_name" IS NULL OR "email" IS NULL;
-- ALTER TABLE "attendees" ALTER COLUMN "full_name" SET NOT NULL;
-- ALTER TABLE "attendees" ALTER COLUMN "email" SET NOT NULL;
-- ALTER TABLE "events" DROP COLUMN "require_attendee_details";

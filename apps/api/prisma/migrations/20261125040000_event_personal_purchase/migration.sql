-- Allow events where the buyer is also the attendee of every ticket.
ALTER TABLE "events"
  ADD COLUMN "personal_purchase" BOOLEAN NOT NULL DEFAULT false;

-- Rollback (run manually if this migration is reverted):
-- ALTER TABLE "events" DROP COLUMN "personal_purchase";

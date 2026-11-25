-- Per-event email design tokens (NEXT LEVEL layout). Purely additive: rows
-- without a value keep rendering with the original classic layout.
ALTER TABLE "event_email_branding" ADD COLUMN "layout" JSONB;

-- Rollback (run manually if this migration is reverted):
-- ALTER TABLE "event_email_branding" DROP COLUMN "layout";

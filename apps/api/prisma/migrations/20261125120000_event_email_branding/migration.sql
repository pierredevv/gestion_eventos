-- Per-event email identity (logo, colours and copy overrides).
CREATE TABLE "event_email_branding" (
  "event_id" UUID NOT NULL,
  "brand_name" VARCHAR(80),
  "logo_key" VARCHAR(255),
  "primary_color" VARCHAR(7),
  "text_color" VARCHAR(7),
  "background_color" VARCHAR(7),
  "templates" JSONB,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "event_email_branding_pkey" PRIMARY KEY ("event_id")
);

ALTER TABLE "event_email_branding"
  ADD CONSTRAINT "event_email_branding_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (run manually if this migration is reverted):
-- DROP TABLE "event_email_branding";

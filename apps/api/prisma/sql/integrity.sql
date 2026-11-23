-- =============================================================================
-- Integrity rules appended to the initial Prisma migration.
--
-- Prisma cannot express CHECK constraints, partial unique indexes or the
-- append-only audit trigger. They are applied here so PostgreSQL remains the
-- last line of defence, regardless of application bugs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Normalised emails (application stores lowercase; database enforces it)
-- -----------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower("email"));
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_buyer_email_lowercase_check" CHECK ("buyer_email" = lower("buyer_email"));
ALTER TABLE "attendees"
  ADD CONSTRAINT "attendees_email_lowercase_check" CHECK ("email" = lower("email"));

-- -----------------------------------------------------------------------------
-- Events
-- -----------------------------------------------------------------------------
ALTER TABLE "events"
  ADD CONSTRAINT "events_capacity_positive_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "events"
  ADD CONSTRAINT "events_date_order_check" CHECK (
    "start_date" <= "end_date" AND "registration_start" <= "registration_end"
  );
ALTER TABLE "events"
  ADD CONSTRAINT "events_published_at_check" CHECK (
    "status" <> 'PUBLISHED' OR "published_at" IS NOT NULL
  );
ALTER TABLE "events"
  ADD CONSTRAINT "events_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3);

-- -----------------------------------------------------------------------------
-- Ticket types: never oversell, never negative counters
-- -----------------------------------------------------------------------------
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_capacity_check" CHECK (
    "capacity" >= 0 AND "reserved_quantity" >= 0 AND "sold_quantity" >= 0
  );
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_no_oversell_check" CHECK (
    "reserved_quantity" + "sold_quantity" <= "capacity"
  );
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_order_limits_check" CHECK (
    "min_per_order" >= 1 AND "max_per_order" >= "min_per_order"
  );
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_sales_window_check" CHECK ("sales_start" < "sales_end");
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_price_check" CHECK ("price" >= 0);
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_currency_check" CHECK ("currency" = upper("currency") AND length("currency") = 3);

-- -----------------------------------------------------------------------------
-- Orders: monetary consistency and state evidence
-- -----------------------------------------------------------------------------
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_check" CHECK (
    "subtotal" >= 0
    AND "discount" >= 0
    AND "total_amount" >= 0
    AND "total_amount" = "subtotal" - "discount"
  );
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_attempts_check" CHECK ("payment_attempts" >= 0);
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_state_evidence_check" CHECK (
    ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL)
    AND ("status" <> 'EXPIRED' OR "expired_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
    AND (
      "status" <> 'REJECTED'
      OR ("rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) >= 3)
    )
  );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_monetary_check" CHECK (
    "unit_price" >= 0 AND "subtotal" = "quantity" * "unit_price"
  );

-- -----------------------------------------------------------------------------
-- Reservations
-- -----------------------------------------------------------------------------
ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_quantity_check" CHECK ("quantity" > 0);

-- -----------------------------------------------------------------------------
-- Payments: an approval must be traceable to a reviewer and a receipt
-- -----------------------------------------------------------------------------
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_review_evidence_check" CHECK (
    (
      "status" <> 'APPROVED'
      OR (
        "reviewed_at" IS NOT NULL
        AND "reviewed_by" IS NOT NULL
        AND "approved_submission_id" IS NOT NULL
      )
    )
    AND (
      "status" <> 'REJECTED'
      OR (
        "reviewed_at" IS NOT NULL
        AND "reviewed_by" IS NOT NULL
        AND "review_notes" IS NOT NULL
        AND length(btrim("review_notes")) >= 3
      )
    )
  );

ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_amount_check" CHECK ("declared_amount" > 0);
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_size_check" CHECK ("receipt_size" > 0);
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_sha256_check" CHECK ("receipt_sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "payment_submissions"
  ADD CONSTRAINT "payment_submissions_review_evidence_check" CHECK (
    (
      "review_status" NOT IN ('ACCEPTED', 'REJECTED')
      OR ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)
    )
    AND (
      "review_status" <> 'REJECTED'
      OR ("review_notes" IS NOT NULL AND length(btrim("review_notes")) >= 3)
    )
  );

-- Only one receipt per payment can be awaiting review.
CREATE UNIQUE INDEX "payment_submissions_single_pending_uq"
  ON "payment_submissions" ("payment_id")
  WHERE "review_status" = 'PENDING';

-- -----------------------------------------------------------------------------
-- Tickets
-- -----------------------------------------------------------------------------
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_token_ciphertext_check" CHECK (length("token_ciphertext") > 0);
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_state_evidence_check" CHECK (
    ("status" <> 'USED' OR "used_at" IS NOT NULL)
    AND ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL)
  );

-- At most one active ticket per attendee (a cancelled ticket may be reissued).
CREATE UNIQUE INDEX "tickets_active_attendee_uq"
  ON "tickets" ("attendee_id")
  WHERE "status" <> 'CANCELLED';

-- -----------------------------------------------------------------------------
-- Sessions and access tokens
-- -----------------------------------------------------------------------------
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_expiry_check" CHECK (
    "expires_at" > "created_at" AND "absolute_expires_at" >= "expires_at"
  );
ALTER TABLE "verification_tokens"
  ADD CONSTRAINT "verification_tokens_expiry_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "order_access_tokens"
  ADD CONSTRAINT "order_access_tokens_expiry_check" CHECK ("expires_at" > "created_at");

-- -----------------------------------------------------------------------------
-- Audit log is append-only
-- -----------------------------------------------------------------------------
CREATE FUNCTION "prevent_audit_log_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "audit_logs_no_mutation"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION "prevent_audit_log_mutation"();

-- -----------------------------------------------------------------------------
-- Supabase hardening: close the PostgREST surface
--
-- Supabase exposes every table in `public` through its Data API using the
-- `anon` and `authenticated` roles. The publishable key shipped to the browser
-- grants those roles, so any table left with default privileges could be read
-- or written without passing through NestJS authorization.
--
-- This application talks to PostgreSQL exclusively through Prisma, therefore
-- those roles need no access at all. The block is a no-op on plain PostgreSQL,
-- where the roles do not exist.
--
-- Row Level Security is intentionally NOT enabled: authorization lives in the
-- backend, and deny-all RLS would silently break the API if it is later moved
-- to a dedicated (non-owner) database role.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
  THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';

    -- Applies to objects created by later migrations executed as the same role.
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END
$$;

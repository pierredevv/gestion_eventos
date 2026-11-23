-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'EVENT_MANAGER', 'PAYMENT_REVIEWER', 'CHECK_IN_STAFF');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'USED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'HELD_FOR_REVIEW', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_CREATED', 'RECEIPT_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'ORDER_ACCESS_LINK', 'TICKET_DELIVERY');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "AccessTokenScope" AS ENUM ('ORDER', 'TICKETS');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email" VARCHAR(254) NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "cover_image" VARCHAR(255),
    "location" VARCHAR(180) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/La_Paz',
    "currency" CHAR(3) NOT NULL DEFAULT 'BOB',
    "capacity" INTEGER,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "registration_start" TIMESTAMPTZ(6) NOT NULL,
    "registration_end" TIMESTAMPTZ(6) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BOB',
    "capacity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "sold_quantity" INTEGER NOT NULL DEFAULT 0,
    "min_per_order" INTEGER NOT NULL DEFAULT 1,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "sales_start" TIMESTAMPTZ(6) NOT NULL,
    "sales_end" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "buyer_id" UUID,
    "event_id" UUID NOT NULL,
    "order_code" VARCHAR(20) NOT NULL,
    "buyer_name" VARCHAR(150) NOT NULL,
    "buyer_email" VARCHAR(254) NOT NULL,
    "buyer_phone" VARCHAR(30) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_reason" VARCHAR(255),
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BOB',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "ticket_type_name" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendees" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "unit_index" INTEGER NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(30),
    "document_number" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'BOB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_reference" VARCHAR(120),
    "approved_submission_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "receipt_file_key" VARCHAR(255) NOT NULL,
    "receipt_mime_type" VARCHAR(100) NOT NULL,
    "receipt_size" INTEGER NOT NULL,
    "receipt_sha256" VARCHAR(64) NOT NULL,
    "declared_amount" DECIMAL(12,2) NOT NULL,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "attendee_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "ticket_code" VARCHAR(24) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_ciphertext" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "checked_by" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_access_tokens" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "scope" "AccessTokenScope" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "actor_label" VARCHAR(150),
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "metadata" JSONB,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "verification_tokens_email_purpose_idx" ON "verification_tokens"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_start_date_idx" ON "events"("status", "start_date");

-- CreateIndex
CREATE INDEX "events_created_by_idx" ON "events"("created_by");

-- CreateIndex
CREATE INDEX "ticket_types_event_id_is_active_idx" ON "ticket_types"("event_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_types_event_id_name_key" ON "ticket_types"("event_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_event_id_status_idx" ON "orders"("event_id", "status");

-- CreateIndex
CREATE INDEX "orders_buyer_email_idx" ON "orders"("buyer_email");

-- CreateIndex
CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "order_items_ticket_type_id_idx" ON "order_items"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_ticket_type_id_key" ON "order_items"("order_id", "ticket_type_id");

-- CreateIndex
CREATE INDEX "attendees_email_idx" ON "attendees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "attendees_order_item_id_unit_index_key" ON "attendees"("order_item_id", "unit_index");

-- CreateIndex
CREATE INDEX "inventory_reservations_status_expires_at_idx" ON "inventory_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_reservations_ticket_type_id_idx" ON "inventory_reservations"("ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_order_id_ticket_type_id_key" ON "inventory_reservations"("order_id", "ticket_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_approved_submission_id_key" ON "payments"("approved_submission_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_reviewed_by_idx" ON "payments"("reviewed_by");

-- CreateIndex
CREATE INDEX "payment_submissions_payment_id_submitted_at_idx" ON "payment_submissions"("payment_id", "submitted_at");

-- CreateIndex
CREATE INDEX "payment_submissions_review_status_idx" ON "payment_submissions"("review_status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_code_key" ON "tickets"("ticket_code");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_token_hash_key" ON "tickets"("token_hash");

-- CreateIndex
CREATE INDEX "tickets_order_id_idx" ON "tickets"("order_id");

-- CreateIndex
CREATE INDEX "tickets_attendee_id_idx" ON "tickets"("attendee_id");

-- CreateIndex
CREATE INDEX "tickets_ticket_type_id_status_idx" ON "tickets"("ticket_type_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_ticket_id_key" ON "check_ins"("ticket_id");

-- CreateIndex
CREATE INDEX "check_ins_checked_at_idx" ON "check_ins"("checked_at");

-- CreateIndex
CREATE INDEX "check_ins_checked_by_checked_at_idx" ON "check_ins"("checked_by", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_access_tokens_token_hash_key" ON "order_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "order_access_tokens_order_id_scope_idx" ON "order_access_tokens"("order_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "notification_jobs_dedupe_key_key" ON "notification_jobs"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_jobs_status_next_attempt_at_idx" ON "notification_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_submission_id_fkey" FOREIGN KEY ("approved_submission_id") REFERENCES "payment_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_attendee_id_fkey" FOREIGN KEY ("attendee_id") REFERENCES "attendees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_access_tokens" ADD CONSTRAINT "order_access_tokens_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

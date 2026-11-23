/**
 * Interactive transactions perform several round trips against a remote
 * PostgreSQL instance. Prisma's 5 s default is too short for that latency and
 * would abort a transaction that is still doing correct work.
 */
export const INTERACTIVE_TRANSACTION_OPTIONS = {
  maxWait: 15_000,
  timeout: 45_000,
};

/**
 * Runs before every Jest test module so that application modules importing
 * `ConfigModule.forRoot` see the dedicated test database instead of the
 * development connection string from `.env`.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  process.env.EMAIL_PROVIDER = 'console';
}

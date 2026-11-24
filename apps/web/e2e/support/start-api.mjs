import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supportDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(supportDir, '../../../..');
const logFile = process.env.E2E_API_LOG_FILE;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const storagePort = Number(process.env.E2E_STORAGE_PORT ?? 54321);

if (!logFile) throw new Error('E2E_API_LOG_FILE is required');
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');

writeFileSync(logFile, '');

/** Local in-memory stand-in for Supabase Storage: no external service is contacted. */
const storage = http.createServer((req, res) => {
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  req.resume();

  if (req.method === 'POST' && pathname === '/storage/v1/bucket') {
    writeJson(res, 200, { name: 'ok' });
    return;
  }
  if (req.method === 'POST' && pathname.startsWith('/storage/v1/object/sign/')) {
    writeJson(res, 200, {
      signedURL: `http://127.0.0.1:${storagePort}/mock${pathname.replace('/storage/v1', '')}`,
    });
    return;
  }
  if (
    (req.method === 'POST' && pathname.startsWith('/storage/v1/object/')) ||
    (req.method === 'DELETE' && pathname.startsWith('/storage/v1/object/'))
  ) {
    writeJson(res, 200, { Key: pathname });
    return;
  }
  writeJson(res, 404, { error: 'Not found' });
});

function writeJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

storage.on('error', (error) => {
  const message = `Fake storage error: ${error.message}\n`;
  process.stderr.write(message);
  appendFileSync(logFile, message);
});

storage.listen(storagePort, '127.0.0.1');

const child = spawn('pnpm', ['--filter', '@eventos/api', 'dev'], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: process.env.TEST_DIRECT_URL ?? testDatabaseUrl,
    EMAIL_PROVIDER: 'console',
    EMAIL_FROM: 'no-reply@eventos.local',
    WEB_ORIGIN: 'http://localhost:3000',
    ADDITIONAL_WEB_ORIGINS: 'http://127.0.0.1:3000',
    COOKIE_SAME_SITE: 'lax',
    SUPABASE_URL: `http://127.0.0.1:${storagePort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'e2e-local-fake-key',
    SUPABASE_STORAGE_BUCKET_RECEIPTS: 'e2e-receipts',
    SUPABASE_STORAGE_BUCKET_TICKETS: 'e2e-ticket-assets',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    process.stdout.write(chunk);
    appendFileSync(logFile, chunk);
  });
}

child.on('error', (error) => {
  const message = `${error.message}\n`;
  process.stderr.write(message);
  appendFileSync(logFile, message);
});

child.on('exit', (code, signal) => {
  storage.close();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

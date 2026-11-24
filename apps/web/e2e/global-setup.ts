import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Reset and seed the isolated `test` schema before any browser test runs. */
export default function globalSetup(): void {
  const rootDir = path.resolve(__dirname, '../..');
  execFileSync('pnpm', ['--filter', '@eventos/api', 'e2e:seed'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error('DATABASE_URL is not set. Complete it in the repository .env file.');
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasourceUrl: url, log: ['error'] });

  try {
    const rows = await prisma.$queryRaw<Array<{ now: Date; version: string }>>`
      SELECT now() AS now, version() AS version
    `;
    const row = rows[0];
    console.log('Database connection OK');
    console.log(`  server time: ${row?.now.toISOString() ?? 'unknown'}`);
    console.log(`  version: ${row?.version ?? 'unknown'}`);
  } catch (error) {
    console.error('Database connection FAILED');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Unexpected error while checking the database');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

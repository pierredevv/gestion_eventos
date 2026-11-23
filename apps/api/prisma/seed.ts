import { PrismaClient, RoleName } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const ROLES: ReadonlyArray<{ name: RoleName; description: string }> = [
  { name: RoleName.SUPER_ADMIN, description: 'Acceso total al sistema y configuracion general' },
  { name: RoleName.EVENT_MANAGER, description: 'Crear, editar, publicar y administrar eventos' },
  { name: RoleName.PAYMENT_REVIEWER, description: 'Revisar, aprobar y rechazar pagos' },
  { name: RoleName.CHECK_IN_STAFF, description: 'Validar tickets y registrar ingresos' },
];

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

async function main(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'pierreelpro19@gmail.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is required. Set it in .env before running "pnpm db:seed".',
    );
  }

  if (adminPassword.length < 16) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 16 characters long.');
  }

  const passwordHash = await argon2.hash(adminPassword, ARGON2_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: 'Administrador principal',
      isActive: true,
      mustChangePassword: true,
    },
    create: {
      fullName: 'Administrador principal',
      email: adminEmail,
      passwordHash,
      emailVerifiedAt: new Date(),
      isActive: true,
      mustChangePassword: true,
    },
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SUPER_ADMIN },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });

  console.log(`Seeded ${ROLES.length} roles.`);
  console.log(`SUPER_ADMIN ready: ${adminEmail} (must change password on first login).`);
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

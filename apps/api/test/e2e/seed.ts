import 'reflect-metadata';

import { PrismaClient, RoleName } from '@prisma/client';
import { hashPassword } from '../../src/common/security/password';

/**
 * Deterministic, fictional seed for the browser E2E suite.
 * It truncates ONLY the schema referenced by TEST_DATABASE_URL, after a guard.
 */

const TABLES = [
  'audit_logs',
  'check_ins',
  'notification_jobs',
  'order_access_tokens',
  'tickets',
  'payment_submissions',
  'payments',
  'inventory_reservations',
  'attendees',
  'order_items',
  'orders',
  'ticket_types',
  'events',
  'sessions',
  'verification_tokens',
  'user_roles',
  'roles',
  'users',
] as const;

export const E2E = {
  eventSlug: 'conferencia-tech-bolivia-e2e',
  eventTitle: 'Conferencia Tech Bolivia',
  reviewerEmail: 'reviewer.e2e@example.com',
  reviewerPassword: 'ReviewerPass123!',
  staffEmail: 'staff.e2e@example.com',
  staffPassword: 'StaffPass123!',
  managerEmail: 'manager.e2e@example.com',
  managerPassword: 'ManagerPass123!',
} as const;

async function main(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for the E2E seed');

  const prisma = new PrismaClient({ datasourceUrl: url, log: ['error'] });
  try {
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing E2E seed outside the "test" schema');
    }

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );

    for (const name of Object.values(RoleName)) {
      await prisma.role.upsert({
        where: { name },
        create: { name, description: `E2E role ${name}` },
        update: {},
      });
    }
    const roles = await prisma.role.findMany();
    const roleId = (name: RoleName): string => {
      const role = roles.find((candidate) => candidate.name === name);
      if (!role) throw new Error(`Role ${name} was not seeded`);
      return role.id;
    };

    const creator = await prisma.user.create({
      data: {
        fullName: 'E2E Event Creator',
        email: 'creator.e2e@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });

    const staffUsers = [
      {
        fullName: 'E2E Payment Reviewer',
        email: E2E.reviewerEmail,
        password: E2E.reviewerPassword,
        role: RoleName.PAYMENT_REVIEWER,
      },
      {
        fullName: 'E2E Check-in Staff',
        email: E2E.staffEmail,
        password: E2E.staffPassword,
        role: RoleName.CHECK_IN_STAFF,
      },
      {
        fullName: 'E2E Event Manager',
        email: E2E.managerEmail,
        password: E2E.managerPassword,
        role: RoleName.EVENT_MANAGER,
      },
    ] as const;

    for (const staff of staffUsers) {
      await prisma.user.create({
        data: {
          fullName: staff.fullName,
          email: staff.email,
          passwordHash: await hashPassword(staff.password),
          emailVerifiedAt: new Date(),
          roles: { create: { roleId: roleId(staff.role) } },
        },
      });
    }

    const start = new Date(Date.now() - 30 * 60_000);
    const end = new Date(Date.now() + 150 * 60_000);
    const event = await prisma.event.create({
      data: {
        createdById: creator.id,
        slug: E2E.eventSlug,
        title: E2E.eventTitle,
        description: 'Evento ficticio creado exclusivamente para pruebas E2E.',
        location: 'La Paz',
        address: 'Centro de Convenciones ficticio',
        capacity: 100,
        startDate: start,
        endDate: end,
        registrationStart: new Date(Date.now() - 86_400_000),
        registrationEnd: new Date(end.getTime() + 3_600_000),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    const salesWindow = {
      salesStart: new Date(Date.now() - 86_400_000),
      salesEnd: new Date(end.getTime() + 1_800_000),
    };

    await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'General',
        description: 'Entrada general de prueba',
        price: 50.0,
        currency: 'BOB',
        capacity: 20,
        minPerOrder: 1,
        maxPerOrder: 10,
        ...salesWindow,
      },
    });

    await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'VIP',
        description: 'Entrada VIP de prueba',
        price: 100.0,
        currency: 'BOB',
        capacity: 10,
        minPerOrder: 1,
        maxPerOrder: 10,
        ...salesWindow,
      },
    });

    process.stdout.write(`E2E seed ready: ${E2E.eventSlug}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`E2E seed failed: ${message}\n`);
  process.exitCode = 1;
});

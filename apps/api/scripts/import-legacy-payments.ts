/**
 * One-off importer for students who paid before the platform existed.
 *
 * Safety properties:
 * - Defaults to dry-run; writes only with the explicit --commit flag.
 * - Reads the source spreadsheet directly instead of a hand-made copy.
 * - Creates confirmed orders and TICKET_DELIVERY jobs only. No ORDER_CREATED,
 *   RECEIPT_RECEIVED or PAYMENT_APPROVED notifications are enqueued.
 * - Uses a stable idempotency key per email so a retry cannot duplicate tickets.
 * - Performs all writes in a single transaction and rechecks stock/conflicts.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  NotificationType,
  OrderStatus,
  PaymentStatus,
  PaymentSubmissionStatus,
  Prisma,
  PrismaClient,
  ReservationStatus,
} from '@prisma/client';
import { consumeStock, reserveStock } from '../src/common/inventory/inventory-sql';

const XLSX_PATH = '/media/pierre/DATOS/Correos/estudiantes_aporte.xlsx';
const EVENT_SLUG = 'next-level';
const TICKET_TYPE_NAME = 'General';
const EXPECTED_PRICE = '50.00';
const EXPECTED_ROWS = 68;
const PLACEHOLDER_PHONE = 'N/A';
const REVIEW_NOTES =
  'Legacy payment imported from estudiantes_aporte.xlsx (physical/QR payment before platform; no receipt file available).';
const EMAIL_CORRECTIONS: Readonly<Record<string, string>> = {
  'torricofer7@gamil.com': 'torricofer7@gmail.com',
};

const COMMIT = process.argv.includes('--commit');

const PY_READER = `
import json, re, sys, zipfile
import xml.etree.ElementTree as ET
path = sys.argv[1]
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', ns):
            shared.append(''.join(t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')))
    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    def colnum(ref):
        letters = re.match(r'([A-Z]+)', ref).group(1)
        n = 0
        for ch in letters:
            n = n * 26 + ord(ch) - 64
        return n - 1
    rows = []
    for row in sheet.findall('.//m:sheetData/m:row', ns):
        cells = {}
        for cell in row.findall('m:c', ns):
            v = cell.find('m:v', ns)
            inline = cell.find('m:is', ns)
            if cell.get('t') == 's' and v is not None:
                value = shared[int(v.text)]
            elif cell.get('t') == 'inlineStr' and inline is not None:
                value = ''.join(t.text or '' for t in inline.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
            elif v is not None:
                value = v.text
            else:
                value = None
            cells[colnum(cell.get('r'))] = value
        rows.append({'row': int(row.get('r')), 'name': cells.get(0), 'email': cells.get(1)})
    print(json.dumps(rows, ensure_ascii=False))
`;

interface Student {
  row: number;
  fullName: string;
  email: string;
  corrected: boolean;
}

function fail(message: string): never {
  throw new Error(message);
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) fail(message);
  return value;
}

function readStudents(): Student[] {
  const raw = JSON.parse(
    execFileSync('python3', ['-c', PY_READER, XLSX_PATH], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }),
  ) as Array<{ row: number; name: string | null; email: string | null }>;

  const header = raw[0];
  if (
    header?.name?.trim().toUpperCase() !== 'NOMBRE COMPLETO' ||
    header?.email?.trim().toUpperCase() !== 'CORREO ELECTRONICO'
  ) {
    fail('Unexpected spreadsheet header');
  }

  const students = raw.slice(1).map(({ row, name, email }): Student => {
    const fullName = (name ?? '').trim().replace(/\s+/g, ' ');
    const originalEmail = (email ?? '').trim().toLowerCase();
    const normalizedEmail = EMAIL_CORRECTIONS[originalEmail] ?? originalEmail;

    if (!fullName || fullName.length > 150) {
      fail(`Invalid name in row ${row}`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
      fail(`Invalid email in row ${row}: ${normalizedEmail}`);
    }

    return {
      row,
      fullName,
      email: normalizedEmail,
      corrected: normalizedEmail !== originalEmail,
    };
  });

  if (students.length !== EXPECTED_ROWS) {
    fail(`Expected ${EXPECTED_ROWS} students, found ${students.length}`);
  }

  const seen = new Set<string>();
  for (const student of students) {
    if (seen.has(student.email)) {
      fail(`Duplicate email after normalization: ${student.email}`);
    }
    seen.add(student.email);
  }

  return students;
}

function generateOrderCodes(count: number): string[] {
  const stamp = [
    String(new Date().getUTCFullYear()).slice(2),
    String(new Date().getUTCMonth() + 1).padStart(2, '0'),
    String(new Date().getUTCDate()).padStart(2, '0'),
  ].join('');
  const codes = new Set<string>();
  while (codes.size < count) {
    const random = randomBytes(5)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, 'A')
      .slice(0, 6)
      .toUpperCase();
    codes.add(`ORD-${stamp}-${random}`.slice(0, 20));
  }
  return [...codes];
}

async function main(): Promise<void> {
  const students = readStudents();
  const prisma = new PrismaClient();

  try {
    const event = await prisma.event.findUnique({
      where: { slug: EVENT_SLUG },
      include: { ticketTypes: { where: { name: TICKET_TYPE_NAME } } },
    });
    if (!event || event.status !== 'PUBLISHED') {
      fail(`Event ${EVENT_SLUG} is not published`);
    }
    if (!event.personalPurchase) {
      fail('Event is not configured for personal purchases');
    }

    const ticketType = event.ticketTypes[0];
    if (!ticketType || !ticketType.isActive) {
      fail(`Ticket type ${TICKET_TYPE_NAME} is missing or inactive`);
    }

    const price = ticketType.price.toFixed(2);
    if (price !== EXPECTED_PRICE) {
      fail(`Unexpected price for ${TICKET_TYPE_NAME}: ${price}`);
    }

    const now = new Date();
    if (now < ticketType.salesStart || now > ticketType.salesEnd) {
      fail('Ticket sales window is closed');
    }
    if (
      ticketType.reservedQuantity + ticketType.soldQuantity + students.length >
      ticketType.capacity
    ) {
      fail('Insufficient stock for legacy import');
    }

    const reviewer = await prisma.user.findFirst({
      where: { roles: { some: { role: { name: 'SUPER_ADMIN' } } } },
      select: { id: true },
    });
    if (!reviewer) {
      fail('No SUPER_ADMIN reviewer found');
    }

    const emails = students.map((student) => student.email);
    const keys = emails.map((email) => `legacy-next-level-${email}`);
    const codes = generateOrderCodes(students.length);

    const [existingOrders, existingAttendees, existingCodes] = await Promise.all([
      prisma.order.findMany({
        where: { OR: [{ buyerEmail: { in: emails } }, { idempotencyKey: { in: keys } }] },
        select: { orderCode: true, buyerEmail: true },
      }),
      prisma.attendee.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      }),
      prisma.order.findMany({
        where: { orderCode: { in: codes } },
        select: { orderCode: true },
      }),
    ]);

    if (existingOrders.length > 0) {
      fail(
        `Existing orders conflict: ${existingOrders.map((order) => order.buyerEmail).join(', ')}`,
      );
    }
    if (existingAttendees.length > 0) {
      fail(`Existing attendees conflict: ${existingAttendees.map((a) => a.email).join(', ')}`);
    }
    if (existingCodes.length > 0) {
      fail(`Order code collision: ${existingCodes.map((order) => order.orderCode).join(', ')}`);
    }

    const summary = {
      mode: COMMIT ? 'commit' : 'dry-run',
      spreadsheet: XLSX_PATH,
      event: { id: event.id, slug: event.slug, title: event.title },
      ticketType: {
        id: ticketType.id,
        name: ticketType.name,
        price,
        currency: ticketType.currency,
      },
      stockBefore: {
        reserved: ticketType.reservedQuantity,
        sold: ticketType.soldQuantity,
        capacity: ticketType.capacity,
      },
      stockAfter: {
        reserved: ticketType.reservedQuantity,
        sold: ticketType.soldQuantity + students.length,
        capacity: ticketType.capacity,
      },
      students: students.length,
      correctedEmails: students
        .filter((student) => student.corrected)
        .map((student) => student.email),
      phone: PLACEHOLDER_PHONE,
      notifications: ['TICKET_DELIVERY'],
      firstOrderCode: required(codes[0], 'No order codes generated'),
      lastOrderCode: required(codes[codes.length - 1], 'No order codes generated'),
    };

    if (!COMMIT) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const startedAt = Date.now();
    const created = await prisma.$transaction(
      async (tx) => {
        const reserved = await reserveStock(tx, ticketType.id, students.length);
        if (reserved !== 1) {
          fail('Unable to reserve stock for legacy import');
        }
        const consumed = await consumeStock(tx, ticketType.id, students.length);
        if (consumed !== 1) {
          fail('Inventory counter inconsistent during import');
        }

        const rows: Array<{ orderCode: string; email: string; jobId: string }> = [];
        for (let index = 0; index < students.length; index += 1) {
          const student = required(students[index], `Missing student at index ${index}`);
          const orderCode = required(codes[index], `Missing order code at index ${index}`);
          const idempotencyKey = required(keys[index], `Missing idempotency key at index ${index}`);
          const unitPrice = new Prisma.Decimal(price);

          const order = await tx.order.create({
            data: {
              buyerId: null,
              eventId: event.id,
              orderCode,
              buyerName: student.fullName,
              buyerEmail: student.email,
              buyerPhone: PLACEHOLDER_PHONE,
              subtotal: unitPrice,
              discountAmount: new Prisma.Decimal('0.00'),
              totalAmount: unitPrice,
              currency: event.currency,
              status: OrderStatus.CONFIRMED,
              idempotencyKey,
              confirmedAt: now,
              expiresAt: null,
              items: {
                create: {
                  ticketTypeId: ticketType.id,
                  ticketTypeName: ticketType.name,
                  quantity: 1,
                  unitPrice,
                  subtotal: unitPrice,
                  attendees: {
                    create: {
                      unitIndex: 1,
                      fullName: student.fullName,
                      email: student.email,
                      phone: null,
                      documentNumber: null,
                    },
                  },
                },
              },
            },
            select: { id: true },
          });

          await tx.inventoryReservation.create({
            data: {
              orderId: order.id,
              ticketTypeId: ticketType.id,
              quantity: 1,
              status: ReservationStatus.CONSUMED,
              consumedAt: now,
            },
          });

          const evidence = [
            'legacy-import',
            event.slug,
            `row-${student.row}`,
            orderCode,
            student.email,
            price,
          ].join('|');

          const payment = await tx.payment.create({
            data: {
              orderId: order.id,
              amount: unitPrice,
              currency: event.currency,
              status: PaymentStatus.PENDING,
              paymentReference: `LEGACY-${orderCode}`,
            },
            select: { id: true },
          });

          // The database requires an approved submission for an APPROVED payment.
          // This row records provenance; it intentionally points to no stored file.
          const submission = await tx.paymentSubmission.create({
            data: {
              paymentId: payment.id,
              receiptFileKey: `legacy/import/no-file/${orderCode}`,
              receiptMimeType: 'text/plain',
              receiptSize: Buffer.byteLength(evidence),
              receiptSha256: createHash('sha256').update(evidence).digest('hex'),
              declaredAmount: unitPrice,
              submittedById: reviewer.id,
              reviewStatus: PaymentSubmissionStatus.ACCEPTED,
              reviewedById: reviewer.id,
              reviewedAt: now,
              reviewNotes: REVIEW_NOTES,
            },
            select: { id: true },
          });

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.APPROVED,
              approvedSubmissionId: submission.id,
              reviewedById: reviewer.id,
              reviewedAt: now,
              reviewNotes: REVIEW_NOTES,
            },
          });

          const job = await tx.notificationJob.create({
            data: {
              type: NotificationType.TICKET_DELIVERY,
              recipient: student.email,
              payload: {
                orderId: order.id,
                orderCode,
                eventId: event.id,
                eventTitle: event.title,
              } as Prisma.InputJsonValue,
              dedupeKey: `ticket-delivery-${order.id}`,
            },
            select: { id: true },
          });

          await tx.auditLog.create({
            data: {
              userId: reviewer.id,
              actorLabel: 'legacy-payment-import',
              action: 'LEGACY_PAYMENT_IMPORT',
              entityType: 'order',
              entityId: order.id,
              metadata: {
                eventSlug: event.slug,
                source: 'estudiantes_aporte.xlsx',
                spreadsheetRow: student.row,
                orderCode,
                amount: price,
                currency: event.currency,
                phone: PLACEHOLDER_PHONE,
                emailCorrected: student.corrected,
                notificationType: NotificationType.TICKET_DELIVERY,
              } as Prisma.InputJsonValue,
            },
          });

          rows.push({ orderCode, email: student.email, jobId: job.id });
        }
        return rows;
      },
      { maxWait: 30_000, timeout: 180_000 },
    );

    console.log(
      JSON.stringify(
        {
          ...summary,
          created: created.length,
          durationMs: Date.now() - startedAt,
          orderCodes: created.map((row) => row.orderCode),
          notificationJobIds: created.map((row) => row.jobId),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

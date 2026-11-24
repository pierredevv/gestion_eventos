import { existsSync, readFileSync } from 'node:fs';
import { expect, request, test, type Page } from '@playwright/test';

const API_ORIGIN = 'http://localhost:4000';
const API_BASE = `${API_ORIGIN}/api/v1`;
const WEB_ORIGIN = 'http://localhost:3000';
const EVENT_SLUG = 'conferencia-tech-bolivia-e2e';
const REVIEWER = { email: 'reviewer.e2e@example.com', password: 'ReviewerPass123!' };
const STAFF = { email: 'staff.e2e@example.com', password: 'StaffPass123!' };
const MANAGER = { email: 'manager.e2e@example.com', password: 'ManagerPass123!' };
const API_LOG_FILE = process.env.E2E_API_LOG_FILE ?? '/tmp/opencode/eventos-api-e2e.log';

const pngReceipt = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent('/admin')}`);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function waitForTicketToken(): Promise<string> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (existsSync(API_LOG_FILE)) {
      const logs = readFileSync(API_LOG_FILE, 'utf8');
      const match = logs.match(/\/tickets\?token=([A-Za-z0-9_-]{43})/);
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('No TICKET_DELIVERY link appeared in the API console log');
}

test('critical E2E: multi-type checkout, payment, tickets and three check-ins', async ({
  browser,
}) => {
  const api = await request.newContext({ baseURL: API_ORIGIN });
  const buyerContext = await browser.newContext({ baseURL: WEB_ORIGIN });
  const buyerPage = await buyerContext.newPage();

  // 1-4. Open the public event and select two General + one VIP ticket.
  await buyerPage.goto(`/events/${EVENT_SLUG}`);
  await expect(buyerPage.getByRole('heading', { name: 'Conferencia Tech Bolivia' })).toBeVisible();
  await buyerPage
    .getByTestId('ticket-type-card')
    .filter({ hasText: 'General' })
    .getByLabel('Cantidad de General')
    .selectOption('2');
  await buyerPage
    .getByTestId('ticket-type-card')
    .filter({ hasText: 'VIP' })
    .getByLabel('Cantidad de VIP')
    .selectOption('1');

  const cart = buyerPage.getByTestId('cart-summary');
  await expect(cart.getByTestId('cart-line')).toHaveCount(2);
  await expect(cart.locator('[data-ticket-type-name="General"]')).toContainText('2 × General');
  await expect(cart.locator('[data-ticket-type-name="VIP"]')).toContainText('1 × VIP');
  await expect(cart.locator('[data-ticket-type-name="General"]')).toContainText(/100/);
  await expect(cart.locator('[data-ticket-type-name="VIP"]')).toContainText(/100/);
  await expect(buyerPage.getByTestId('cart-total')).toContainText(/200/);

  // 5-9. Buyer and three different attendees, then confirm the 200 Bs purchase.
  await buyerPage.getByTestId('buyer-name').fill('Juan Carlos Rodriguez');
  await buyerPage.getByTestId('buyer-email').fill('juan.e2e@example.com');
  await buyerPage.getByTestId('buyer-phone').fill('+59170000000');

  const generalAttendees = buyerPage.locator(
    '[data-testid="attendee-group"][data-ticket-type-name="General"]',
  );
  const vipAttendees = buyerPage.locator(
    '[data-testid="attendee-group"][data-ticket-type-name="VIP"]',
  );
  await generalAttendees.locator('input[data-testid^="attendee-name-"]').nth(0).fill('Ana Perez');
  await generalAttendees
    .locator('input[data-testid^="attendee-email-"]')
    .nth(0)
    .fill('ana.e2e@example.com');
  await generalAttendees.locator('input[data-testid^="attendee-name-"]').nth(1).fill('Beto Ruiz');
  await generalAttendees
    .locator('input[data-testid^="attendee-email-"]')
    .nth(1)
    .fill('beto.e2e@example.com');
  await vipAttendees.locator('input[data-testid^="attendee-name-"]').nth(0).fill('Carla Diaz');
  await vipAttendees
    .locator('input[data-testid^="attendee-email-"]')
    .nth(0)
    .fill('carla.e2e@example.com');

  await buyerPage.getByTestId('submit-order').click();
  await buyerPage.waitForURL(/\/orders\/[^/?]+\?token=/);
  const orderUrl = new URL(buyerPage.url());
  const orderCode = decodeURIComponent(orderUrl.pathname.split('/').at(-1) ?? '');
  const orderToken = orderUrl.searchParams.get('token') ?? '';
  expect(orderCode).not.toBe('');
  expect(orderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // 10-11. Verify exactly one order, two items, three attendees and 200 Bs.
  const orderUrlApi = `api/v1/orders/${encodeURIComponent(orderCode)}?token=${encodeURIComponent(orderToken)}`;
  const createdResponse = await api.get(orderUrlApi);
  expect(createdResponse.status(), await createdResponse.text()).toBe(200);
  const created = (await createdResponse.json()) as {
    order: {
      id: string;
      status: string;
      totalAmount: string;
      items: Array<{ ticketTypeName: string; quantity: number; attendees: unknown[] }>;
    };
  };
  expect(created.order.status).toBe('PENDING_PAYMENT');
  expect(created.order.totalAmount).toBe('200.00');
  expect(created.order.items).toHaveLength(2);
  expect(created.order.items.find((item) => item.ticketTypeName === 'General')?.quantity).toBe(2);
  expect(created.order.items.find((item) => item.ticketTypeName === 'VIP')?.quantity).toBe(1);
  expect(created.order.items.reduce((sum, item) => sum + item.attendees.length, 0)).toBe(3);

  // 12. Continue with the payment flow in the browser.
  await expect(buyerPage.getByText('Total', { exact: true })).toBeVisible();
  await expect(buyerPage.locator('input[inputmode="decimal"]')).toHaveValue('200.00');
  await buyerPage.locator('input[type="file"]').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: pngReceipt,
  });
  await buyerPage.getByRole('button', { name: 'Enviar comprobante' }).click();
  await expect(buyerPage.getByText(/Comprobante enviado/)).toBeVisible();
  await expect
    .poll(async () => {
      const response = await api.get(orderUrlApi);
      const body = (await response.json()) as { order: { status: string } };
      return body.order.status;
    })
    .toBe('PENDING_REVIEW');

  // Approve payment through the reviewer UI.
  const reviewerContext = await browser.newContext({ baseURL: WEB_ORIGIN });
  const reviewerPage = await reviewerContext.newPage();
  await login(reviewerPage, REVIEWER.email, REVIEWER.password);
  await reviewerPage.goto('/admin/payments');
  const submissionCard = reviewerPage.locator('article').filter({ hasText: orderCode });
  await expect(submissionCard).toContainText(/200[,.]\s*00/);
  await submissionCard.getByRole('button', { name: 'Aprobar' }).click();
  await expect(reviewerPage.getByText(/Pago aprobado/)).toBeVisible();
  await expect
    .poll(async () => {
      const response = await api.get(orderUrlApi);
      const body = (await response.json()) as { order: { status: string } };
      return body.order.status;
    })
    .toBe('CONFIRMED');

  // Wait for the durable worker and extract the ticket link from the console provider.
  const ticketToken = await waitForTicketToken();
  const portalResponse = await api.get(`api/v1/tickets?token=${encodeURIComponent(ticketToken)}`);
  expect(portalResponse.ok()).toBeTruthy();
  const portal = (await portalResponse.json()) as {
    orderCode: string;
    tickets: Array<{
      ticketCode: string;
      attendeeName: string;
      ticketTypeName: string;
      qrPayload: string;
    }>;
  };
  expect(portal.orderCode).toBe(orderCode);
  expect(portal.tickets).toHaveLength(3);
  expect(portal.tickets.map((ticket) => ticket.attendeeName).sort()).toEqual([
    'Ana Perez',
    'Beto Ruiz',
    'Carla Diaz',
  ]);
  expect(portal.tickets.filter((ticket) => ticket.ticketTypeName === 'General')).toHaveLength(2);
  expect(portal.tickets.filter((ticket) => ticket.ticketTypeName === 'VIP')).toHaveLength(1);
  expect(portal.tickets.every((ticket) => ticket.qrPayload.startsWith('EVT1:'))).toBe(true);

  await buyerPage.goto(`/tickets?token=${encodeURIComponent(ticketToken)}`);
  await expect(buyerPage.locator('article')).toHaveCount(3);
  await expect(buyerPage.getByText('Carla Diaz')).toBeVisible();

  // Register three check-ins through the staff UI.
  const staffContext = await browser.newContext({ baseURL: WEB_ORIGIN });
  const staffPage = await staffContext.newPage();
  await login(staffPage, STAFF.email, STAFF.password);
  await staffPage.goto('/admin/check-in');
  const scanner = staffPage.getByPlaceholder('EVT1:…');
  for (const ticket of portal.tickets) {
    await scanner.fill(ticket.ticketCode);
    await staffPage.getByRole('button', { name: 'Leer' }).click();
    await expect(staffPage.getByRole('button', { name: 'Confirmar ingreso' })).toBeVisible();
    await staffPage.getByRole('button', { name: 'Confirmar ingreso' }).click();
    await expect(
      staffPage.getByText(new RegExp(`Ingreso registrado: ${ticket.attendeeName}`)),
    ).toBeVisible();
  }
  const eventResponse = await api.get(`api/v1/events/${EVENT_SLUG}`);
  expect(eventResponse.status(), await eventResponse.text()).toBe(200);
  const event = (await eventResponse.json()) as { id: string };
  const recordsResponse = await staffContext.request.get(
    `${API_BASE}/admin/events/${event.id}/check-ins`,
    { headers: { Origin: WEB_ORIGIN } },
  );
  expect(recordsResponse.status(), await recordsResponse.text()).toBe(200);
  const records = (await recordsResponse.json()) as Array<{ attendeeName: string }>;
  expect(records).toHaveLength(3);
  expect(records.map((record) => record.attendeeName).sort()).toEqual([
    'Ana Perez',
    'Beto Ruiz',
    'Carla Diaz',
  ]);

  // A second scan must be rejected by the API with the real staff session.
  const staffCookies = await staffContext.cookies(API_ORIGIN);
  const csrf = staffCookies.find((cookie) => cookie.name === 'csrf_token')?.value ?? '';
  const duplicate = await staffContext.request.post(`${API_BASE}/admin/check-in`, {
    headers: { Origin: WEB_ORIGIN, 'X-CSRF-Token': csrf },
    data: { ticketCode: portal.tickets[0]?.ticketCode },
  });
  expect(duplicate.status()).toBe(409);
  const duplicateBody = (await duplicate.json()) as { code: string };
  expect(duplicateBody.code).toBe('TICKET_ALREADY_USED');

  // Final report: one confirmed order, three ticket units, 200 Bs counted once.
  const managerContext = await browser.newContext({ baseURL: WEB_ORIGIN });
  const managerPage = await managerContext.newPage();
  await login(managerPage, MANAGER.email, MANAGER.password);
  const reportResponse = await managerContext.request.get(`${API_BASE}/admin/reports/sales`, {
    headers: { Origin: WEB_ORIGIN },
  });
  expect(reportResponse.ok()).toBeTruthy();
  const report = (await reportResponse.json()) as {
    totals: {
      orders: number;
      ticketsSold: number;
      grossRevenue: string;
      netRevenue: string;
    };
  };
  expect(report.totals).toMatchObject({
    orders: 1,
    ticketsSold: 3,
    grossRevenue: '200.00',
    netRevenue: '200.00',
  });

  await api.dispose();
  await buyerContext.close();
  await reviewerContext.close();
  await staffContext.close();
  await managerContext.close();
});

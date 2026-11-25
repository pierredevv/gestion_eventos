import {
  DEFAULT_BRAND,
  renderOrderCreated,
  renderPasswordResetEmail,
  renderPaymentApproved,
  renderPaymentRejected,
  renderReceiptReceived,
  renderTicketDelivery,
  renderVerificationEmail,
} from './index';

describe('email templates', () => {
  it('keeps the existing plain-text subjects and fallbacks', () => {
    const base = { brand: DEFAULT_BRAND, orderCode: 'PED-1' };
    expect(renderOrderCreated({ ...base, link: 'https://example.com/orders/PED-1' }).subject).toBe(
      'Pedido PED-1 creado',
    );
    expect(renderReceiptReceived(base).subject).toBe('Comprobante recibido para PED-1');
    expect(renderPaymentApproved(base).subject).toBe('Pago aprobado para PED-1');
    expect(
      renderPaymentRejected({ ...base, attempts: 1, maxAttempts: 2, definitive: false }).subject,
    ).toBe('Comprobante rechazado para PED-1');
    expect(renderTicketDelivery({ ...base, link: 'https://example.com/tickets' }).subject).toBe(
      'Tus entradas para PED-1',
    );
  });

  it('preserves the exact legacy plain-text bodies', () => {
    const link = 'https://example.com/orders/PED-1?token=abc';
    expect(
      renderOrderCreated({
        brand: DEFAULT_BRAND,
        orderCode: 'PED-1',
        expiresAt: '2026-11-26T12:00:00.000Z',
        link,
      }).text,
    ).toBe(
      'Tu pedido PED-1 fue creado. Completa el pago antes de 2026-11-26T12:00:00.000Z.\nRevisa tu pedido aquí: https://example.com/orders/PED-1?token=abc',
    );
    expect(
      renderTicketDelivery({
        brand: DEFAULT_BRAND,
        orderCode: 'PED-1',
        link: 'https://example.com/tickets?token=abc',
      }).text,
    ).toBe(
      'Tus entradas están listas. Consúltalas y muestra el QR en la entrada: https://example.com/tickets?token=abc',
    );
  });

  it('renders an HTML document with a CTA and a plain-text alternative', () => {
    const result = renderOrderCreated({
      brand: DEFAULT_BRAND,
      orderCode: 'PED-1',
      eventTitle: 'Concierto & Feria',
      expiresAt: '2026-11-26T12:00:00.000Z',
      link: 'https://example.com/orders/PED-1?token=abc&from=email',
    });
    expect(result.html).toContain('<!doctype html>');
    expect(result.html).toContain('Concierto &amp; Feria');
    expect(result.html).toContain(
      'href="https://example.com/orders/PED-1?token=abc&amp;from=email"',
    );
    expect(result.html).toContain('Ver mi pedido');
    expect(result.text).toContain('Revisa tu pedido aquí:');
  });

  it('escapes admin-controlled copy and never renders scripts', () => {
    const result = renderPaymentRejected({
      brand: DEFAULT_BRAND,
      orderCode: 'PED-1',
      reason: '<script>alert("x")</script>',
      attempts: 1,
      maxAttempts: 2,
      definitive: false,
    });
    expect(result.html).not.toContain('<script>alert');
    expect(result.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(result.text).toContain('<script>alert("x")</script>');
  });

  it('applies per-event overrides to the subject, copy and footer', () => {
    const result = renderPaymentApproved({
      brand: DEFAULT_BRAND,
      orderCode: 'PED-1',
      amount: '150.00',
      overrides: {
        subject: 'Tu entrada está lista',
        headline: 'Gracias por tu compra',
        ctaLabel: 'Ver mis entradas',
        footer: 'Equipo del evento',
      },
    });
    expect(result.subject).toBe('Tu entrada está lista');
    expect(result.html).toContain('Gracias por tu compra');
    expect(result.html).toContain('Equipo del evento');
    expect(result.text).toContain('Equipo del evento');
  });

  it('uses the event logo and colours when provided', () => {
    const result = renderTicketDelivery({
      brand: {
        brandName: 'Festival',
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#123456',
        textColor: '#654321',
        backgroundColor: '#fffeee',
      },
      orderCode: 'PED-1',
      link: 'https://example.com/tickets',
    });
    expect(result.html).toContain('src="https://example.com/logo.png"');
    expect(result.html).toContain('alt="Festival"');
    expect(result.html).toContain('#123456');
    expect(result.html).toContain('#fffeee');
  });

  it('ignores unsafe logo URLs and colours', () => {
    const result = renderTicketDelivery({
      brand: {
        brandName: 'Festival',
        logoUrl: 'javascript:alert(1)',
        primaryColor: 'red',
        textColor: '#12141a',
        backgroundColor: '#f8f6f1',
      },
      orderCode: 'PED-1',
      link: 'https://example.com/tickets',
    });
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('#b8431a');
  });

  it('keeps auth links and expiry copy in both versions', () => {
    const verify = renderVerificationEmail({
      link: 'https://example.com/verify-email?token=t1',
      expires: '24 horas',
    });
    const reset = renderPasswordResetEmail({
      link: 'https://example.com/reset-password?token=t2',
      expires: '30 minutos',
    });
    expect(verify.subject).toBe('Verifica tu correo');
    expect(verify.text).toContain('https://example.com/verify-email?token=t1');
    expect(verify.text).toContain('24 horas');
    expect(verify.html).toContain('Verificar correo');
    expect(reset.subject).toBe('Restablece tu contraseña');
    expect(reset.text).toContain('30 minutos');
    expect(reset.html).toContain('Cambiar contraseña');
  });
});

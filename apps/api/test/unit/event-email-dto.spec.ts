import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateEventEmailDto } from '../../src/modules/events/dto/update-event-email.dto';

describe('UpdateEventEmailDto', () => {
  it('accepts colours and nested copy overrides', () => {
    const dto = plainToInstance(UpdateEventEmailDto, {
      brandName: 'Festival',
      primaryColor: '#b8431a',
      templates: {
        TICKET_DELIVERY: { subject: 'Tus entradas', ctaLabel: 'Ver entradas' },
      },
    });
    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects invalid colours, unknown keys and oversized copy', () => {
    const invalidColour = plainToInstance(UpdateEventEmailDto, { primaryColor: 'red' });
    const unknownKey = plainToInstance(UpdateEventEmailDto, { logoUrl: 'https://example.com' });
    const unknownType = plainToInstance(UpdateEventEmailDto, {
      templates: { PASSWORD_RESET: { subject: 'x' } },
    });
    const oversized = plainToInstance(UpdateEventEmailDto, {
      templates: { ORDER_CREATED: { intro: 'a'.repeat(601) } },
    });
    const strict = { whitelist: true, forbidNonWhitelisted: true } as const;
    expect(validateSync(invalidColour).length).toBeGreaterThan(0);
    expect(validateSync(unknownKey, strict).length).toBeGreaterThan(0);
    expect(validateSync(unknownType, strict).length).toBeGreaterThan(0);
    expect(validateSync(oversized).length).toBeGreaterThan(0);
  });
});

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateOrderDto } from '../../src/modules/orders/dto/create-order.dto';

const basePayload = () => ({
  eventId: 'ee88d1db-8d78-44dc-bae0-dda9456362d6',
  buyerName: 'Comprador Prueba',
  buyerEmail: 'comprador@example.com',
  buyerPhone: '+591 70000000',
  items: [
    {
      ticketTypeId: '3f3b3273-d4fa-41d7-b5d7-20805699daad',
      quantity: 1,
      attendees: [{ fullName: '', email: '' }],
    },
  ],
});

describe('CreateOrderDto attendee details', () => {
  it('accepts blank attendee fields so an event can make them optional', () => {
    const dto = plainToInstance(CreateOrderDto, basePayload());
    expect(validateSync(dto)).toEqual([]);
    expect(dto.items[0]!.attendees![0]!.fullName).toBeUndefined();
    expect(dto.items[0]!.attendees![0]!.email).toBeUndefined();
  });

  it('still validates an email when one is provided', () => {
    const payload = basePayload();
    payload.items[0]!.attendees![0]!.email = 'correo-invalido';
    const dto = plainToInstance(CreateOrderDto, payload);
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('still validates a short name when one is provided', () => {
    const payload = basePayload();
    payload.items[0]!.attendees![0]!.fullName = 'A';
    const dto = plainToInstance(CreateOrderDto, payload);
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('accepts omitted attendees for personal purchases', () => {
    const base = basePayload();
    const payload = {
      eventId: base.eventId,
      buyerName: base.buyerName,
      buyerEmail: base.buyerEmail,
      buyerPhone: base.buyerPhone,
      items: [{ ticketTypeId: base.items[0]!.ticketTypeId, quantity: 1 }],
    };
    const dto = plainToInstance(CreateOrderDto, payload);
    expect(validateSync(dto)).toEqual([]);
    expect(dto.items[0]!.attendees).toBeUndefined();
  });
});

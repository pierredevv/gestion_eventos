const apiDocsUrl = process.env.NEXT_PUBLIC_API_DOCS_URL ?? 'http://localhost:4000/api/docs';
const apiHealthUrl =
  process.env.NEXT_PUBLIC_API_HEALTH_URL ?? 'http://localhost:4000/api/v1/health/ready';

const capabilities = [
  {
    title: 'Catálogo multi-evento',
    description:
      'Eventos publicados con página propia por slug, portada, ubicación, disponibilidad y condiciones de compra.',
  },
  {
    title: 'Inventario sin sobreventa',
    description:
      'Reserva transaccional de cupos con expiración controlada y contadores protegidos por restricciones en PostgreSQL.',
  },
  {
    title: 'Compra como invitado o registrado',
    description:
      'Una orden puede combinar tipos de entrada del mismo evento y exige un asistente identificado por unidad.',
  },
  {
    title: 'Pago por QR bancario estático',
    description:
      'Comprobante privado, revisión manual y aprobación idempotente con auditoría de cada decisión.',
  },
  {
    title: 'Tickets individuales con QR',
    description:
      'Un token aleatorio por asistente, almacenado de forma segura. El QR nunca contiene datos personales.',
  },
  {
    title: 'Control de acceso atómico',
    description:
      'Un ticket solo puede usarse una vez. Dos escaneos simultáneos no pueden registrar dos ingresos.',
  },
];

const flow = [
  'Elegir evento y tipo de entrada',
  'Registrar comprador y asistentes',
  'Reservar cupos por 25 minutos',
  'Enviar comprobante de pago',
  'Revisión manual y emisión de tickets',
];

const phases = [
  { name: 'F1 · Fundaciones del monorepo', status: 'Completada' },
  { name: 'F2 · Esquema de datos y restricciones', status: 'Completada' },
  { name: 'F3 · Autenticación y roles', status: 'Completada' },
  { name: 'F4 · Eventos y tipos de entrada', status: 'Completada' },
  { name: 'F5 · Órdenes e inventario', status: 'Completada' },
  { name: 'F6 · Pagos y revisión', status: 'Completada' },
  { name: 'F7 · Tickets y notificaciones', status: 'Completada' },
  { name: 'F8 · Escáner y check-in', status: 'Completada' },
  { name: 'F9 · Reportes y exportación', status: 'Completada' },
  { name: 'F10 · Interfaces pública y administrativa', status: 'Completada' },
  { name: 'F11 · Hardening y despliegue', status: 'Completada' },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line bg-paper/90 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <a href="/" className="flex items-center gap-2.5">
            <span className="bg-ink text-paper flex size-9 items-center justify-center rounded-lg text-sm font-semibold">
              EV
            </span>
            <span className="text-base font-semibold tracking-tight">Eventos</span>
          </a>
          <nav className="text-ink-muted hidden items-center gap-7 text-sm md:flex">
            <a className="hover:text-ink transition-colors" href="#capacidades">
              Capacidades
            </a>
            <a className="hover:text-ink transition-colors" href="#flujo">
              Flujo de compra
            </a>
            <a className="hover:text-ink transition-colors" href="#estado">
              Estado
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <a
              className="border-line hover:border-ink hidden rounded-lg border px-4 py-2 text-sm font-medium transition-colors sm:inline-block"
              href={apiDocsUrl}
              rel="noreferrer"
              target="_blank"
            >
              API docs
            </a>
            <span className="bg-accent-soft text-accent rounded-full px-3 py-1 text-xs font-semibold">
              MVP en construcción
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-14 md:pt-24">
          <p className="text-accent text-xs font-semibold tracking-[0.18em] uppercase">
            Plataforma multi-evento · Bolivia
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-6xl">
            Entradas, pagos y accesos en un solo lugar.
          </h1>
          <p className="text-ink-muted mt-6 max-w-2xl text-base leading-relaxed md:text-lg">
            Publica eventos, controla cupos sin sobreventa, valida comprobantes de pago y emite un
            ticket con QR único por asistente. Todo con trazabilidad y control de acceso en la
            puerta.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              className="bg-ink text-paper hover:bg-ink/90 rounded-lg px-5 py-3 text-sm font-semibold transition-colors"
              href="/events"
            >
              Ver eventos
            </a>
            <a
              className="border-line hover:border-ink rounded-lg border px-5 py-3 text-sm font-semibold transition-colors"
              href="/login"
            >
              Ingresar al panel
            </a>
            <a
              className="border-line hover:border-ink rounded-lg border px-5 py-3 text-sm font-semibold transition-colors"
              href={apiDocsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Explorar la API
            </a>
            <a
              className="border-line hover:border-ink rounded-lg border px-5 py-3 text-sm font-semibold transition-colors"
              href={apiHealthUrl}
              rel="noreferrer"
              target="_blank"
            >
              Estado del servicio
            </a>
          </div>

          <dl className="border-line mt-14 grid gap-6 border-t pt-8 sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted text-xs font-medium tracking-wide uppercase">
                Inventario
              </dt>
              <dd className="mt-1 text-sm font-medium">
                Reservas atómicas con expiración configurable
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted text-xs font-medium tracking-wide uppercase">Pagos</dt>
              <dd className="mt-1 text-sm font-medium">
                QR bancario estático y revisión manual auditada
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted text-xs font-medium tracking-wide uppercase">Acceso</dt>
              <dd className="mt-1 text-sm font-medium">
                Un ingreso por ticket, incluso con escaneos simultáneos
              </dd>
            </div>
          </dl>
        </section>

        <section id="capacidades" className="border-line bg-surface border-y">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Qué resuelve la plataforma
            </h2>
            <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-relaxed">
              El alcance del MVP está definido en la especificación de requisitos. No hay
              funcionalidades fuera de él.
            </p>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <article
                  key={capability.title}
                  className="border-line bg-paper rounded-xl border p-6"
                >
                  <h3 className="text-base font-semibold">{capability.title}</h3>
                  <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                    {capability.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="flujo" className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Un flujo de compra explícito
              </h2>
              <p className="text-ink-muted mt-3 text-sm leading-relaxed">
                La orden solo se confirma cuando el pago fue aprobado y los tickets se crearon de
                forma consistente. Un fallo de correo no revierte la compra.
              </p>
              <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                El comprobante es evidencia documental, no una confirmación bancaria automática.
              </p>
            </div>
            <ol className="space-y-3">
              {flow.map((step, index) => (
                <li
                  key={step}
                  className="border-line bg-surface flex items-center gap-4 rounded-xl border px-5 py-4"
                >
                  <span className="bg-accent-soft text-accent flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="estado" className="border-line bg-surface border-t">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Estado de la implementación
                </h2>
                <p className="text-ink-muted mt-2 text-sm">
                  Este entorno es de desarrollo. Las fases se publican solo cuando están
                  verificadas.
                </p>
              </div>
              <a
                className="text-accent text-sm font-semibold underline-offset-4 hover:underline"
                href={apiDocsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Ver contrato OpenAPI
              </a>
            </div>
            <ul className="border-line divide-line mt-8 divide-y border-y">
              {phases.map((phase) => (
                <li key={phase.name} className="flex items-center justify-between gap-4 py-3.5">
                  <span className="text-sm font-medium">{phase.name}</span>
                  <span
                    className={
                      phase.status === 'Completada'
                        ? 'text-accent text-xs font-semibold'
                        : phase.status === 'Siguiente' || phase.status === 'En curso'
                          ? 'text-ink text-xs font-semibold'
                          : 'text-ink-muted text-xs font-medium'
                    }
                  >
                    {phase.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-line border-t">
        <div className="text-ink-muted mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>Plataforma de gestión de eventos · Zona horaria America/La_Paz · Moneda BOB</p>
          <p>Next.js + NestJS + PostgreSQL · Monolito modular</p>
        </div>
      </footer>
    </div>
  );
}

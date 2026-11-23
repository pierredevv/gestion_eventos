import Link from 'next/link';
import type { ReactNode } from 'react';

export function SiteHeader(): ReactNode {
  return (
    <header className="border-line bg-paper/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="bg-ink text-paper flex size-9 items-center justify-center rounded-lg text-sm font-semibold">
            EV
          </span>
          <span className="text-base font-semibold tracking-tight">Eventos</span>
        </Link>
        <nav className="text-ink-muted flex items-center gap-5 text-sm">
          <Link className="hover:text-ink transition-colors" href="/events">
            Eventos
          </Link>
          <Link className="hover:text-ink transition-colors" href="/tickets">
            Mis tickets
          </Link>
          <Link
            className="border-line hover:border-ink rounded-lg border px-3 py-1.5 font-medium transition-colors"
            href="/login"
          >
            Administración
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      <footer className="border-line mt-10 border-t">
        <div className="text-ink-muted mx-auto w-full max-w-6xl px-6 py-6 text-xs">
          Plataforma de gestión de eventos · America/La_Paz · BOB
        </div>
      </footer>
    </div>
  );
}

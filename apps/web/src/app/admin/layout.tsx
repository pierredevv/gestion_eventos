'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { SiteHeader } from '@/components/site-shell';
import { buttonClass, Field, inputClass, Loading, Notice } from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import type { AuthUserView } from '@/lib/types';

const NAV = [
  { href: '/admin', label: 'Resumen', roles: ['SUPER_ADMIN', 'EVENT_MANAGER', 'PAYMENT_REVIEWER', 'CHECK_IN_STAFF'] },
  { href: '/admin/events', label: 'Eventos', roles: ['SUPER_ADMIN', 'EVENT_MANAGER'] },
  { href: '/admin/payments', label: 'Pagos', roles: ['SUPER_ADMIN', 'PAYMENT_REVIEWER'] },
  { href: '/admin/check-in', label: 'Check-in', roles: ['SUPER_ADMIN', 'EVENT_MANAGER', 'CHECK_IN_STAFF'] },
  { href: '/admin/users', label: 'Usuarios', roles: ['SUPER_ADMIN'] },
] as const;

function PasswordChange({ onDone }: { onDone: () => void }): ReactNode {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await apiSend('/auth/change-password', 'POST', { currentPassword, newPassword });
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo cambiar la contraseña');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Cambia tu contraseña</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Tu cuenta usa una contraseña temporal. Debes reemplazarla antes de continuar.
      </p>
      <div className="border-line bg-surface mt-6 space-y-4 rounded-xl border p-6">
        <Field label="Contraseña actual">
          <input
            className={inputClass}
            type="password"
            value={currentPassword}
            onChange={(change) => setCurrent(change.target.value)}
          />
        </Field>
        <Field label="Nueva contraseña" hint="Mínimo 12 caracteres">
          <input
            className={inputClass}
            type="password"
            value={newPassword}
            onChange={(change) => setNew(change.target.value)}
          />
        </Field>
        {error ? <Notice>{error}</Notice> : null}
        <button className={`${buttonClass} w-full`} disabled={busy} onClick={() => void submit()}>
          {busy ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUserView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<AuthUserView>('/auth/me')
      .then((result) => {
        if (active) setUser(result);
      })
      .catch(() => {
        if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  async function logout(): Promise<void> {
    await apiSend('/auth/logout', 'POST');
    router.replace('/login');
  }

  if (loading) {
    return (
      <div>
        <SiteHeader />
        <Loading />
      </div>
    );
  }
  if (!user) return null;
  if (user.mustChangePassword) {
    return (
      <div>
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-6 pb-10">
          <PasswordChange onDone={() => setUser({ ...user, mustChangePassword: false })} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
        <aside className="w-48 shrink-0">
          <p className="text-ink-muted text-xs font-semibold uppercase">Panel</p>
          <nav className="mt-4 flex flex-col gap-1">
            {NAV.filter((item) => item.roles.some((role) => user.roles.includes(role))).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-ink text-paper font-semibold'
                    : 'text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-line mt-6 border-t pt-4">
            <p className="text-sm font-medium">{user.fullName}</p>
            <p className="text-ink-muted text-xs break-all">{user.email}</p>
            <button className="text-accent mt-3 text-xs font-semibold" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

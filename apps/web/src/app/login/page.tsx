'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { buttonClass, Field, inputClass, Notice } from '@/components/ui';
import { apiSend, ApiRequestError } from '@/lib/api';

function LoginForm(): ReactNode {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await apiSend('/auth/login', 'POST', { email, password });
      router.push(next.startsWith('/') ? next : '/admin');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'No se pudo iniciar sesión',
      );
      setBusy(false);
    }
  }

  return (
    <PageBody>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">Ingresar</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Accede al panel de organización, revisión de pagos y control de acceso.
        </p>
        <div className="border-line bg-surface mt-8 space-y-5 rounded-xl border p-6">
          <Field label="Correo">
            <input
              className={inputClass}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(change) => setEmail(change.target.value)}
            />
          </Field>
          <Field label="Contraseña">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(change) => setPassword(change.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submit();
              }}
            />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          <button className={`${buttonClass} w-full`} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
          <p className="text-ink-muted text-center text-xs">
            ¿No tienes cuenta? <Link className="text-accent font-semibold" href="/register">Regístrate</Link>
          </p>
        </div>
      </div>
    </PageBody>
  );
}

export default function LoginPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

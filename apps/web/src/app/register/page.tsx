'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { buttonClass, Field, inputClass, Notice } from '@/components/ui';
import { apiSend, ApiRequestError } from '@/lib/api';
import type { AuthUserView } from '@/lib/types';

export default function RegisterPage(): ReactNode {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiSend<{ user: AuthUserView }>('/auth/register', 'POST', form);
      setNotice('Cuenta creada. Revisa tu correo para verificarla y luego ingresa.');
      setTimeout(() => router.push('/login'), 1800);
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo registrar');
      setBusy(false);
    }
  }

  return (
    <PageBody>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="text-ink-muted mt-2 text-sm">También puedes comprar como invitado.</p>
        <div className="border-line bg-surface mt-8 space-y-5 rounded-xl border p-6">
          <Field label="Nombre completo">
            <input
              className={inputClass}
              value={form.fullName}
              onChange={(change) => setForm({ ...form, fullName: change.target.value })}
            />
          </Field>
          <Field label="Correo">
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(change) => setForm({ ...form, email: change.target.value })}
            />
          </Field>
          <Field label="Contraseña" hint="Mínimo 12 caracteres">
            <input
              className={inputClass}
              type="password"
              value={form.password}
              onChange={(change) => setForm({ ...form, password: change.target.value })}
            />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          {notice ? <Notice kind="success">{notice}</Notice> : null}
          <button className={`${buttonClass} w-full`} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Creando…' : 'Crear cuenta'}
          </button>
          <p className="text-ink-muted text-center text-xs">
            ¿Ya tienes cuenta?{' '}
            <Link className="text-accent font-semibold" href="/login">
              Ingresa
            </Link>
          </p>
        </div>
      </div>
    </PageBody>
  );
}

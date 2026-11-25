'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { buttonClass, Field, inputClass, Notice } from '@/components/ui';
import { apiSend, ApiRequestError } from '@/lib/api';

function ResetPasswordForm(): ReactNode {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (!token) {
      setError('Falta el token de restablecimiento. Revisa el enlace del correo.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await apiSend<void>('/auth/reset-password', 'POST', { token, newPassword: password });
      setSuccess(true);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBody>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">Restablecer contraseña</h1>
        <p className="text-ink-muted mt-2 text-sm">Elige una nueva contraseña para tu cuenta.</p>
        <div className="border-line bg-surface mt-8 space-y-5 rounded-xl border p-6">
          {success ? (
            <Notice kind="success">Contraseña actualizada. Ya puedes ingresar.</Notice>
          ) : (
            <>
              <Field label="Nueva contraseña" hint="Mínimo 12 caracteres">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={password}
                  onChange={(change) => setPassword(change.target.value)}
                />
              </Field>
              <Field label="Repetir contraseña">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={confirmation}
                  onChange={(change) => setConfirmation(change.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit();
                  }}
                />
              </Field>
              {error ? <Notice>{error}</Notice> : null}
              <button
                className={`${buttonClass} w-full`}
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </>
          )}
          <p className="text-ink-muted text-center text-xs">
            ¿Ya tienes acceso?{' '}
            <Link className="text-accent font-semibold" href="/login">
              Ingresa
            </Link>
          </p>
        </div>
      </div>
    </PageBody>
  );
}

export default function ResetPasswordPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

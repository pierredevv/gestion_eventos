'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { buttonClass, Notice } from '@/components/ui';
import { apiSend, ApiRequestError } from '@/lib/api';

function VerifyEmailForm(): ReactNode {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode repeats effects in development; a verification token is single-use.
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState('error');
      setMessage('Falta el token de verificación. Revisa el enlace del correo.');
      return;
    }

    let active = true;
    apiSend<void>('/auth/verify-email', 'POST', { token })
      .then(() => {
        if (active) {
          setState('success');
          setMessage('Correo verificado correctamente. Ya puedes ingresar.');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setState('error');
          setMessage(
            cause instanceof ApiRequestError
              ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
              : 'No se pudo verificar el correo. Inténtalo de nuevo.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <PageBody>
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">Verificar correo</h1>
        <p className="text-ink-muted mt-2 text-sm">
          Confirma tu dirección para activar todas las funciones de tu cuenta.
        </p>
        <div className="border-line bg-surface mt-8 space-y-5 rounded-xl border p-6">
          {state === 'loading' ? <p className="text-ink-muted text-sm">Verificando…</p> : null}
          {state === 'success' ? <Notice kind="success">{message}</Notice> : null}
          {state === 'error' ? <Notice>{message}</Notice> : null}
          <Link className={`${buttonClass} block text-center`} href="/login">
            Ir a ingresar
          </Link>
        </div>
      </div>
    </PageBody>
  );
}

export default function VerifyEmailPage(): ReactNode {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}

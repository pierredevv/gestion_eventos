'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Field, Notice, buttonClass, inputClass, secondaryButtonClass } from '@/components/ui';
import { apiFetch, apiUpload, ApiRequestError } from '@/lib/api';
import type {
  EmailOverrideView,
  EventEmailConfigView,
  EventEmailPreviewView,
  EventEmailTemplatesView,
  EventEmailType,
} from '@/lib/types';

const EMAIL_TYPES: Array<{ type: EventEmailType; label: string }> = [
  { type: 'ORDER_CREATED', label: 'Pedido creado' },
  { type: 'RECEIPT_RECEIVED', label: 'Comprobante recibido' },
  { type: 'PAYMENT_APPROVED', label: 'Pago aprobado' },
  { type: 'PAYMENT_REJECTED', label: 'Comprobante rechazado' },
  { type: 'TICKET_DELIVERY', label: 'Entrega de entradas' },
];

interface Draft {
  brandName: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  templates: EventEmailTemplatesView;
}

function draftFrom(config: EventEmailConfigView): Draft {
  return {
    brandName: config.brandName,
    primaryColor: config.primaryColor,
    textColor: config.textColor,
    backgroundColor: config.backgroundColor,
    templates: config.templates,
  };
}

function cleanOverride(override: EmailOverrideView | undefined): EmailOverrideView | undefined {
  if (!override) return undefined;
  const cleaned: EmailOverrideView = {};
  for (const key of ['subject', 'headline', 'intro', 'ctaLabel', 'footer'] as const) {
    const value = override[key]?.trim();
    if (value) cleaned[key] = value;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function EventEmailEditor({ eventId }: { eventId: string }): ReactNode {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<EventEmailType>('ORDER_CREATED');
  const [preview, setPreview] = useState<EventEmailPreviewView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<EventEmailConfigView>(`/admin/events/${eventId}/email`)
      .then((config) => {
        if (!active) return;
        setDraft(draftFrom(config));
        setLogoUrl(config.logoUrl);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof ApiRequestError
              ? cause.message
              : 'No se pudo cargar la configuración de correos',
          );
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  function payload() {
    const templates: EventEmailTemplatesView = {};
    for (const { type } of EMAIL_TYPES) {
      const cleaned = cleanOverride(draft?.templates[type]);
      if (cleaned) templates[type] = cleaned;
    }
    return {
      ...(draft?.brandName.trim() ? { brandName: draft.brandName.trim() } : {}),
      ...(draft?.primaryColor ? { primaryColor: draft.primaryColor } : {}),
      ...(draft?.textColor ? { textColor: draft.textColor } : {}),
      ...(draft?.backgroundColor ? { backgroundColor: draft.backgroundColor } : {}),
      templates,
    };
  }

  function setOverride(field: keyof EmailOverrideView, value: string): void {
    setDraft((current) => {
      if (!current) return current;
      const currentOverride = current.templates[activeType] ?? {};
      return {
        ...current,
        templates: {
          ...current.templates,
          [activeType]: { ...currentOverride, [field]: value },
        },
      };
    });
  }

  function message(cause: unknown, fallback: string): string {
    return cause instanceof ApiRequestError ? cause.message : fallback;
  }

  async function save(): Promise<void> {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const config = await apiFetch<EventEmailConfigView>(`/admin/events/${eventId}/email`, {
        method: 'PATCH',
        body: JSON.stringify(payload()),
      });
      setDraft(draftFrom(config));
      setLogoUrl(config.logoUrl);
      setNotice('Configuración de correos guardada.');
      setPreview(null);
    } catch (cause) {
      setError(message(cause, 'No se pudo guardar la configuración'));
    } finally {
      setBusy(false);
    }
  }

  async function refreshPreview(): Promise<void> {
    setError('');
    setBusy(true);
    try {
      const result = await apiFetch<EventEmailPreviewView>(
        `/admin/events/${eventId}/email/preview`,
        {
          method: 'POST',
          body: JSON.stringify({ type: activeType, config: payload() }),
        },
      );
      setPreview(result);
    } catch (cause) {
      setError(message(cause, 'No se pudo generar la vista previa'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File): Promise<void> {
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      const config = await apiUpload<EventEmailConfigView>(
        `/admin/events/${eventId}/email/logo`,
        body,
      );
      setLogoUrl(config.logoUrl);
      setNotice('Logo subido correctamente.');
      setPreview(null);
    } catch (cause) {
      setError(message(cause, 'No se pudo subir el logo'));
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo(): Promise<void> {
    setError('');
    setBusy(true);
    try {
      const config = await apiFetch<EventEmailConfigView>(`/admin/events/${eventId}/email`, {
        method: 'PATCH',
        body: JSON.stringify({ removeLogo: true }),
      });
      setConfigState(config);
      setNotice('Logo eliminado.');
      setPreview(null);
    } catch (cause) {
      setError(message(cause, 'No se pudo eliminar el logo'));
    } finally {
      setBusy(false);
    }
  }

  function setConfigState(config: EventEmailConfigView): void {
    setDraft(draftFrom(config));
    setLogoUrl(config.logoUrl);
  }

  if (!draft) {
    return <p className="text-ink-muted mt-3 text-sm">Cargando configuración de correos…</p>;
  }

  const override = draft.templates[activeType] ?? {};
  const hasCta = activeType === 'ORDER_CREATED' || activeType === 'TICKET_DELIVERY';

  return (
    <div className="border-line mt-6 border-t pt-5">
      <h4 className="text-sm font-semibold">Correos del evento</h4>
      <p className="text-ink-muted mt-1 text-xs">
        Personaliza la identidad visual y el texto de cada correo. La vista previa usa datos de
        ejemplo y no modifica los correos reales.
      </p>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <Notice kind="success">{notice}</Notice>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Nombre de la marca">
            <input
              className={inputClass}
              maxLength={80}
              value={draft.brandName}
              onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Acento">
              <input
                type="color"
                className={`${inputClass} h-10 p-1`}
                value={draft.primaryColor}
                onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
              />
            </Field>
            <Field label="Texto">
              <input
                type="color"
                className={`${inputClass} h-10 p-1`}
                value={draft.textColor}
                onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
              />
            </Field>
            <Field label="Fondo">
              <input
                type="color"
                className={`${inputClass} h-10 p-1`}
                value={draft.backgroundColor}
                onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Logo del evento" hint="PNG, JPEG o WebP · máximo 2 MB">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className={inputClass}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
          </Field>
          {logoUrl ? (
            <div className="border-line flex items-center gap-3 rounded-lg border p-3">
              <img
                src={logoUrl}
                alt="Logo del evento"
                className="h-10 w-auto max-w-[8rem] object-contain"
              />
              <button
                type="button"
                className="text-accent text-xs font-semibold"
                disabled={busy}
                onClick={() => void removeLogo()}
              >
                Quitar logo
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {EMAIL_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className={
                  type === activeType
                    ? 'bg-ink text-paper rounded-lg px-3 py-1.5 text-xs font-semibold'
                    : 'border-line bg-surface hover:border-ink rounded-lg border px-3 py-1.5 text-xs font-semibold'
                }
                onClick={() => {
                  setActiveType(type);
                  setPreview(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Field label="Asunto">
            <input
              className={inputClass}
              maxLength={160}
              value={override.subject ?? ''}
              placeholder="Predeterminado: usa el texto del sistema"
              onChange={(e) => setOverride('subject', e.target.value)}
            />
          </Field>
          <Field label="Titular">
            <input
              className={inputClass}
              maxLength={160}
              value={override.headline ?? ''}
              placeholder="Predeterminado: usa el texto del sistema"
              onChange={(e) => setOverride('headline', e.target.value)}
            />
          </Field>
          <Field label="Texto principal">
            <textarea
              className={`${inputClass} min-h-24`}
              maxLength={600}
              value={override.intro ?? ''}
              placeholder="Predeterminado: usa el texto del sistema"
              onChange={(e) => setOverride('intro', e.target.value)}
            />
          </Field>
          {hasCta ? (
            <Field label="Texto del botón">
              <input
                className={inputClass}
                maxLength={80}
                value={override.ctaLabel ?? ''}
                placeholder="Predeterminado: usa el texto del sistema"
                onChange={(e) => setOverride('ctaLabel', e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Pie del correo">
            <input
              className={inputClass}
              maxLength={300}
              value={override.footer ?? ''}
              placeholder="Predeterminado: Enviado por …"
              onChange={(e) => setOverride('footer', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar correos'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void refreshPreview()}
        >
          Actualizar vista previa
        </button>
      </div>

      <div className="mt-4">
        <p className="text-ink-muted mb-2 text-xs font-semibold uppercase tracking-wider">
          Vista previa
        </p>
        {preview ? (
          <>
            <p className="text-ink-muted mb-2 text-xs">
              Asunto: <span className="text-ink font-medium">{preview.subject}</span>
            </p>
            <iframe
              title="Vista previa del correo"
              sandbox=""
              srcDoc={preview.html}
              className="border-line bg-surface h-[620px] w-full rounded-lg border"
            />
          </>
        ) : (
          <p className="text-ink-muted text-xs">
            Pulsa “Actualizar vista previa” para ver cómo se verá este correo.
          </p>
        )}
      </div>
    </div>
  );
}

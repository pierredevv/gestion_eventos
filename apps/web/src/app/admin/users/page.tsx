'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge, buttonClass, EmptyState, Field, inputClass, Loading, Notice, secondaryButtonClass } from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ManagedUserView } from '@/lib/types';

const ROLES = ['SUPER_ADMIN', 'EVENT_MANAGER', 'PAYMENT_REVIEWER', 'CHECK_IN_STAFF'] as const;
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Administrador',
  EVENT_MANAGER: 'Gestor de eventos',
  PAYMENT_REVIEWER: 'Revisor de pagos',
  CHECK_IN_STAFF: 'Control de acceso',
};

export default function AdminUsersPage(): ReactNode {
  const [users, setUsers] = useState<ManagedUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roles: ['EVENT_MANAGER'] as string[] });

  function load(): void {
    setLoading(true);
    setError('');
    apiFetch<{ users: ManagedUserView[] }>('/users')
      .then((result) => setUsers(result.users))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function create(): Promise<void> {
    setError('');
    setNotice('');
    try {
      await apiSend('/users', 'POST', form);
      setNotice('Cuenta creada con contraseña temporal; el usuario deberá cambiarla al ingresar.');
      setForm({ fullName: '', email: '', password: '', roles: ['EVENT_MANAGER'] });
      setShowForm(false);
      load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo crear el usuario');
    }
  }

  async function toggleActive(user: ManagedUserView): Promise<void> {
    setError('');
    try {
      await apiSend(`/users/${user.id}`, 'PATCH', { isActive: !user.isActive });
      load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo actualizar el usuario');
    }
  }

  async function saveRoles(user: ManagedUserView, roles: string[]): Promise<void> {
    if (roles.length === 0) return;
    setError('');
    try {
      await apiSend(`/users/${user.id}/roles`, 'PUT', { roles });
      load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudieron actualizar los roles');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Usuarios</h1>
          <p className="text-ink-muted mt-2 text-sm">Gestiona cuentas del equipo y sus permisos.</p>
        </div>
        <button className={buttonClass} onClick={() => setShowForm(!showForm)}>{showForm ? 'Ocultar' : 'Nuevo usuario'}</button>
      </div>

      {error ? <div className="mt-5"><Notice>{error}</Notice></div> : null}
      {notice ? <div className="mt-5"><Notice kind="success">{notice}</Notice></div> : null}

      {showForm ? (
        <div className="border-line bg-surface mt-6 space-y-4 rounded-xl border p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo">
              <input className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </Field>
            <Field label="Correo">
              <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label="Contraseña temporal" hint="Mínimo 12 caracteres">
            <input className={inputClass} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Roles</legend>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={(e) => setForm({
                      ...form,
                      roles: e.target.checked ? [...form.roles, role] : form.roles.filter((item) => item !== role),
                    })}
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <button className={buttonClass} onClick={() => void create()}>Crear usuario</button>
        </div>
      ) : null}

      <div className="mt-8 space-y-3">
        {loading ? <Loading /> : null}
        {!loading && users.length === 0 ? <EmptyState>No hay usuarios registrados.</EmptyState> : null}
        {users.map((user) => (
          <article key={user.id} className="border-line bg-surface rounded-xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold">{user.fullName}</h2>
                  <Badge status={user.isActive ? 'ACTIVE' : 'INACTIVE'} />
                  {user.mustChangePassword ? <span className="text-ink-muted text-xs">Contraseña temporal</span> : null}
                </div>
                <p className="text-ink-muted mt-1 text-xs">{user.email} · Alta: {formatDate(user.createdAt)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {user.roles.map((role) => <span key={role} className="bg-paper rounded-full px-2 py-1 text-xs">{ROLE_LABELS[role] ?? role}</span>)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={secondaryButtonClass} onClick={() => void toggleActive(user)}>
                  {user.isActive ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
            <div className="border-line mt-4 flex flex-wrap gap-4 border-t pt-4">
              {ROLES.map((role) => {
                const active = user.roles.includes(role);
                return (
                  <label key={role} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...user.roles, role]
                          : user.roles.filter((item) => item !== role);
                        void saveRoles(user, next);
                      }}
                    />
                    {ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

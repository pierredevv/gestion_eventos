import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Eventos | Plataforma de gestión y venta de entradas',
    template: '%s | Eventos',
  },
  description:
    'Plataforma multi-evento para publicar eventos, vender entradas y validar accesos mediante códigos QR.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="es">
      <body className="bg-paper text-ink min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}

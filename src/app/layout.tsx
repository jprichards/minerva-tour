import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { SessionPersistence } from '@/components/SessionPersistence';
import { SWRProvider } from '@/components/SWRProvider';
import { ThemeProvider, ThemeScript } from '@/components/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Minerva Tour',
  description: 'The Minerva Tour Golf Club App',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Minerva Tour',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6652a3',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-[var(--bg-page)] text-[var(--text-primary)]`}>
        <ServiceWorkerRegistration />
        <SessionPersistence />
        <SWRProvider>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  );
}

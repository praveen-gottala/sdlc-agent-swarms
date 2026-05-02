import type { Metadata } from 'next';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { chipTheme } from '../theme';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'CHIP Dashboard',
  description: 'Crafted Human Intelligence Platform — AI-powered SDLC orchestration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body className="min-h-screen bg-bg-base text-text-primary antialiased">
        <MantineProvider theme={chipTheme} defaultColorScheme="dark">
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}

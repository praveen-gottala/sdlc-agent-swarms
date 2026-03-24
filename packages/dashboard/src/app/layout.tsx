import type { Metadata } from 'next';
import './globals.css';
import { DashboardShell } from '../components/layout/dashboard-shell';

export const metadata: Metadata = {
  title: 'AgentForge Dashboard',
  description: 'V3 web dashboard for AgentForge multi-agent orchestration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-base text-text-primary antialiased">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}

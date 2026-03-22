import type { Metadata } from 'next';
import './globals.css';

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
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}

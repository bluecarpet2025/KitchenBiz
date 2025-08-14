import './globals.css';
import type { Metadata } from 'next';
import TopNav from '@/components/TopNav';
import AuthGate from '@/components/AuthGate';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = { title: 'Kitchen Biz', description: 'MVP' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div id="app-shell" className="min-h-screen">
          <TopNav />
          <AuthGate>
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </AuthGate>
        </div>
        {/* Analytics must be inside <body> */}
        <Analytics />
      </body>
    </html>
  );
}

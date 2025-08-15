// src/app/login/page.tsx
import { Suspense } from 'react';
import LoginClient from './LoginClient';

export const metadata = { title: 'Sign in' };
// This avoids static optimization edge cases during prerendering
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="max-w-xl mx-auto mt-24 space-y-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={null}>
        <LoginClient />
      </Suspense>
    </div>
  );
}

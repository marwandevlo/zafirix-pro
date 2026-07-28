import { redirect } from 'next/navigation';

/**
 * Post-auth landing used by email confirmation (`/auth/callback` → `/dashboard`).
 * Atlas OS home UI lives at `/`.
 */
export default function DashboardPage() {
  redirect('/');
}

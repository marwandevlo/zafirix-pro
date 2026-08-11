import { redirect } from 'next/navigation';

/** Default marketing entry → French landing. Use /landing/ar for Arabic. */
export default function LandingIndexPage() {
  redirect('/landing/fr');
}

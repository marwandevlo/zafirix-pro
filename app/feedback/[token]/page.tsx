import type { Metadata } from 'next';
import { ClientFeedbackView } from './ClientFeedbackView';

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: 'Votre avis — Zafirix Pro',
  description: 'Formulaire de satisfaction client.',
  robots: 'noindex, nofollow',
};

export default async function FeedbackTokenPage({ params }: Props) {
  const { token } = await params;
  return <ClientFeedbackView token={token} />;
}

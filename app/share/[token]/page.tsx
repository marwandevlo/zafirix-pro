/**
 * /share/[token] — Public read-only document view.
 * No authentication required. Data shown only if token is valid.
 */
import type { Metadata } from 'next';
import { ShareDocumentView } from './ShareDocumentView';

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: 'Document partagé — Zafirix Pro',
  description: 'Consultez ce document partagé de manière sécurisée.',
  robots: 'noindex, nofollow',
};

export default async function ShareTokenPage({ params }: Props) {
  const { token } = await params;
  return <ShareDocumentView token={token} />;
}

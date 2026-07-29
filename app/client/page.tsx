import { redirect } from 'next/navigation';

/** Legacy route — permanent redirect to /portal */
export default function ClientLegacyRedirect() {
  redirect('/portal');
}

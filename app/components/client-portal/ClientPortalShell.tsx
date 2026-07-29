import { isClientPortalBridgeEnabled } from '@/app/lib/atlas-sprint0-flags';
import ClientPortalDemo from '@/app/client/ClientPortalDemo';
import ClientPortalDisabled from '@/app/components/client-portal/ClientPortalDisabled';

type Props = {
  initialAccessCode?: string;
};

export default function ClientPortalShell({ initialAccessCode }: Props) {
  if (!isClientPortalBridgeEnabled()) {
    return <ClientPortalDisabled />;
  }
  return <ClientPortalDemo initialAccessCode={initialAccessCode} />;
}

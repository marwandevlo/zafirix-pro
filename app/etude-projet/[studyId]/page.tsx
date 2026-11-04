'use client';

import { useParams } from 'next/navigation';
import { StudioShell } from '../_studio/Shell';
import { Workspace } from '../_studio/Workspace';

export default function EtudeProjetStudyPage() {
  const params = useParams<{ studyId: string }>();
  const studyId = typeof params?.studyId === 'string' ? params.studyId : '';
  return (
    <StudioShell>
      {studyId ? <Workspace key={studyId} studyId={studyId} /> : null}
    </StudioShell>
  );
}

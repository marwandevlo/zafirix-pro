import { createAtlasLink } from '@/app/lib/atlas-links-repository';
import { createDocument } from '@/app/lib/atlas-documents-repository';
import type { JuridiqueCompany } from '@/app/juridique/juridique-types';

export type PersistLegalDocumentInput = {
  company: JuridiqueCompany | null;
  procedureId: string;
  procedureLabel: string;
  content: string;
  formData?: Record<string, string>;
  linkSource: 'juridique_formalite' | 'juridique_documents' | 'juridique_modification' | 'juridique_creation';
};

export async function persistLegalDocument(
  input: PersistLegalDocumentInput,
): Promise<{ ok: true; id: string; generatedAt: string } | { ok: false; error: string }> {
  const generatedAt = new Date().toISOString();
  const res = await createDocument({
    type: 'juridique',
    title: input.procedureLabel,
    content: { text: input.content, template: input.procedureId },
    metadata: {
      legalProcedure: input.procedureId,
      legalProcedureLabel: input.procedureLabel,
      generatedAt,
      companyName: input.company?.raisonSociale ?? null,
      formData: input.formData ?? {},
    },
    source: 'generated',
  });

  if (!res.ok) return { ok: false, error: 'document_create_failed' };

  if (input.company) {
    await createAtlasLink({
      fromType: 'document',
      fromId: res.id,
      toType: 'company',
      toId: String(input.company.id),
      relation: 'attached_to',
      metadata: {
        source: input.linkSource,
        legalProcedure: input.procedureId,
        generatedAt,
      },
    });
  }

  return { ok: true, id: res.id, generatedAt };
}

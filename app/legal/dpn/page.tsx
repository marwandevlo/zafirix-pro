import { LegalPageLayout } from '@/app/components/legal/LegalPageLayout';

export default function LegalDpnPage() {
  return (
    <LegalPageLayout title="Notice de traitement des données" titleAr="إشعار معالجة البيانات">
      <section>
        <h2 className="text-lg font-bold text-gray-900">1. Identité du responsable</h2>
        <p className="mt-2">
          <strong>Raison sociale :</strong> ZAFIRIX PRO (Zafirix Atlas)<br />
          <strong>Contact DPO / privacy :</strong> privacy@zafirix.pro<br />
          <strong>Finalité principale :</strong> Plateforme SaaS de gestion d&apos;entreprise et de conformité fiscale.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">2. Catégories de personnes concernées</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Utilisateurs clients (dirigeants, comptables, RH).</li>
          <li>Utilisateurs invités / membres d&apos;espace de travail.</li>
          <li>Contacts tiers saisis par l&apos;utilisateur (clients, fournisseurs, employés).</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">3. Registre des traitements (extrait)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left border-b">Traitement</th>
                <th className="px-3 py-2 text-left border-b">Données</th>
                <th className="px-3 py-2 text-left border-b">Base légale</th>
                <th className="px-3 py-2 text-left border-b">Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="px-3 py-2 border-b">Compte & auth</td><td className="px-3 py-2 border-b">Email, identité</td><td className="px-3 py-2 border-b">Contrat</td><td className="px-3 py-2 border-b">Vie du compte + 3 ans</td></tr>
              <tr><td className="px-3 py-2 border-b">Documents IA</td><td className="px-3 py-2 border-b">Fichiers, OCR</td><td className="px-3 py-2 border-b">Contrat</td><td className="px-3 py-2 border-b">Selon rétention client</td></tr>
              <tr><td className="px-3 py-2 border-b">Facturation</td><td className="px-3 py-2 border-b">Plan, usage</td><td className="px-3 py-2 border-b">Contrat / légal</td><td className="px-3 py-2 border-b">10 ans (comptable)</td></tr>
              <tr><td className="px-3 py-2 border-b">Assistant IA</td><td className="px-3 py-2 border-b">Prompts, réponses</td><td className="px-3 py-2 border-b">Contrat</td><td className="px-3 py-2 border-b">24 mois max</td></tr>
              <tr><td className="px-3 py-2">Logs sécurité</td><td className="px-3 py-2">IP, events</td><td className="px-3 py-2">Intérêt légitime</td><td className="px-3 py-2">12 mois</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">4. Destinataires</h2>
        <p className="mt-2">
          Personnel autorisé Zafirix, sous-traitants techniques (hébergement, DB, IA, email, monitoring), autorités
          compétentes sur demande légale.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">5. Mesures de sécurité</h2>
        <p className="mt-2">
          RLS Supabase, RBAC workspace/company, chiffrement TLS, secrets server-side only, audits Phase 16/19,
          sauvegardes Supabase PITR (voir PHASE19_BACKUP_VALIDATION).
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">6. Exercice des droits</h2>
        <p className="mt-2">
          Demande par email à privacy@zafirix.pro avec pièce d&apos;identité. Délai de réponse : 30 jours calendaires.
        </p>
      </section>
    </LegalPageLayout>
  );
}

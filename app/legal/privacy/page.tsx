import { LegalPageLayout } from '@/app/components/legal/LegalPageLayout';

export default function LegalPrivacyPage() {
  return (
    <LegalPageLayout title="Politique de confidentialité" titleAr="سياسة الخصوصية">
      <section>
        <h2 className="text-lg font-bold text-gray-900">1. Responsable du traitement</h2>
        <p className="mt-2">
          ZAFIRIX PRO (Zafirix Atlas) agit en qualité de responsable du traitement pour les données personnelles
          collectées via la plateforme, conformément à la loi marocaine n° 09-08 relative à la protection des personnes
          physiques à l&apos;égard du traitement des données à caractère personnel.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">2. Données collectées</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Identité : nom, email, téléphone, entreprise.</li>
          <li>Données de connexion : logs, adresse IP, user-agent, cookies de session.</li>
          <li>Données métier : documents uploadés, factures, écritures comptables, données fiscales et RH.</li>
          <li>Données de facturation : plan, consommation, historique d&apos;abonnement.</li>
          <li>Interactions IA : prompts et réponses (journalisées pour amélioration du service et audit).</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">3. Finalités</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Fourniture et amélioration du service SaaS.</li>
          <li>Authentification, sécurité et prévention de la fraude.</li>
          <li>Facturation, quotas et support client.</li>
          <li>Analytics agrégés et mesure d&apos;adoption (événements anonymisés lorsque possible).</li>
          <li>Respect des obligations légales et comptables.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">4. Base légale</h2>
        <p className="mt-2">
          Exécution du contrat (CGU), intérêt légitime (sécurité, amélioration produit), consentement lorsque requis
          (cookies non essentiels), et obligations légales le cas échéant.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">5. Sous-traitants</h2>
        <p className="mt-2">
          Nous recourons à des sous-traitants techniques : hébergement (Vercel), base de données (Supabase), monitoring
          (Sentry), fournisseurs IA (Anthropic, OpenAI selon configuration), email (Resend). Des accords de traitement
          sont requis avec chaque sous-traitant avant mise en production.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">6. Durée de conservation</h2>
        <p className="mt-2">
          Voir la politique de rétention (`docs/PHASE19_DATA_RETENTION.md`). Compte actif : durée de la relation contractuelle
          + délais légaux. Logs techniques : 90 jours à 24 mois selon la catégorie.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">7. Vos droits</h2>
        <p className="mt-2">
          Accès, rectification, opposition, limitation et suppression dans les limites légales. Contact : privacy@zafirix.pro.
          Réclamation possible auprès de la CNDP (Commission Nationale de contrôle de la protection des Données à caractère Personnel).
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">8. Transferts internationaux</h2>
        <p className="mt-2">
          Certains sous-traitants peuvent être situés hors du Maroc. Des garanties appropriées (clauses contractuelles types,
          certifications) doivent être en place avant traitement en production.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">9. Sécurité</h2>
        <p className="mt-2">
          Chiffrement en transit (TLS), Row Level Security Supabase, contrôle d&apos;accès par rôles, journalisation d&apos;audit,
          rate limiting et monitoring des incidents (Phase 16).
        </p>
      </section>
    </LegalPageLayout>
  );
}

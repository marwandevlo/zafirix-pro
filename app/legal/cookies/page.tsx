import { LegalPageLayout } from '@/app/components/legal/LegalPageLayout';

export default function LegalCookiesPage() {
  return (
    <LegalPageLayout title="Politique cookies" titleAr="سياسة ملفات تعريف الارتباط">
      <section>
        <h2 className="text-lg font-bold text-gray-900">1. Qu&apos;est-ce qu&apos;un cookie ?</h2>
        <p className="mt-2">
          Un cookie est un petit fichier texte déposé sur votre terminal lors de la visite du site. Il permet de mémoriser
          des informations de session, des préférences ou des mesures d&apos;audience.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">2. Cookies strictement nécessaires</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Session Supabase Auth — authentification sécurisée.</li>
          <li>Préférences langue / société active — fonctionnement du tableau de bord.</li>
          <li>Cookies de sécurité CSRF / same-site — protection contre les attaques.</li>
        </ul>
        <p className="mt-2 text-gray-600">Ces cookies ne nécessitent pas de consentement préalable.</p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">3. Cookies analytics</h2>
        <p className="mt-2">
          Nous pouvons utiliser des événements analytics first-party (`/api/analytics/track`) pour mesurer l&apos;adoption
          produit (onboarding, usage des modules). Aucun cookie publicitaire tiers n&apos;est déployé par défaut en GA.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">4. Stockage local</h2>
        <p className="mt-2">
          Certaines préférences (progression onboarding, visite guidée) utilisent `localStorage` ou `sessionStorage` côté
          navigateur. Le mode démo utilise `sessionStorage` isolé et n&apos;affecte pas les données serveur.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">5. Gestion des préférences</h2>
        <p className="mt-2">
          Vous pouvez supprimer les cookies via les paramètres de votre navigateur. La suppression des cookies de session
          entraîne une déconnexion. Pour les cookies analytics optionnels, un bandeau de consentement pourra être activé
          selon la configuration régionale.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">6. Durée</h2>
        <p className="mt-2">
          Session : durée de la session navigateur. Persistants : jusqu&apos;à 12 mois maximum pour les préférences non essentielles.
        </p>
      </section>
    </LegalPageLayout>
  );
}

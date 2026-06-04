import { LegalPageLayout } from '@/app/components/legal/LegalPageLayout';

export default function LegalTermsPage() {
  return (
    <LegalPageLayout title="Conditions générales d'utilisation" titleAr="الشروط العامة للاستخدام">
      <section>
        <h2 className="text-lg font-bold text-gray-900">1. Objet</h2>
        <p className="mt-2">
          Les présentes Conditions générales d&apos;utilisation (CGU) régissent l&apos;accès et l&apos;utilisation de la plateforme
          Zafirix Atlas, éditée sous la marque ZAFIRIX PRO, accessible via application web et services associés.
          En créant un compte ou en utilisant le service, vous acceptez sans réserve les présentes CGU.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">2. Description du service</h2>
        <p className="mt-2">
          Zafirix Atlas est une plateforme SaaS de gestion d&apos;entreprise comprenant notamment : documents intelligents (OCR),
          facturation, comptabilité, TVA, banque, paie, liasse fiscale, assistant IA et tableaux de bord. Le service est fourni
          en l&apos;état et évolue par mises à jour régulières.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">3. Compte utilisateur</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Vous devez fournir des informations exactes lors de l&apos;inscription.</li>
          <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
          <li>Toute activité réalisée depuis votre compte est réputée effectuée par vous.</li>
          <li>Nous pouvons suspendre un compte en cas de violation des CGU ou d&apos;usage frauduleux.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">4. Abonnements et facturation</h2>
        <p className="mt-2">
          Les formules, quotas et tarifs sont décrits sur la page Tarifs. Un essai gratuit peut être proposé selon le plan.
          Le non-paiement ou le dépassement de quotas peut entraîner une limitation des fonctionnalités. Les factures et
          historiques de consommation sont accessibles dans l&apos;espace Facturation.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">5. Usage acceptable</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Conformité aux lois marocaines et internationales applicables.</li>
          <li>Interdiction de contourner les limitations techniques, quotas ou mesures de sécurité.</li>
          <li>Interdiction d&apos;upload de contenus illicites, malveillants ou portant atteinte aux droits de tiers.</li>
          <li>Les modules fiscaux et comptables fournissent une aide à la décision ; la validation finale incombe à l&apos;utilisateur et à son expert-comptable.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">6. Propriété intellectuelle</h2>
        <p className="mt-2">
          La plateforme, son code, sa marque et sa documentation restent la propriété de l&apos;éditeur. Vous conservez la
          propriété de vos données métier (factures, documents, écritures). Une licence limitée, non exclusive et révocable
          vous est accordée pour utiliser le service pendant la durée de l&apos;abonnement.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">7. Limitation de responsabilité</h2>
        <p className="mt-2">
          Dans les limites autorisées par la loi, l&apos;éditeur ne saurait être tenu responsable des dommages indirects,
          pertes de profit ou erreurs de déclaration fiscale résultant d&apos;une mauvaise utilisation du service.
          La responsabilité agrégée est plafonnée au montant des sommes payées par l&apos;utilisateur sur les douze (12) derniers mois.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">8. Résiliation</h2>
        <p className="mt-2">
          Vous pouvez résilier votre compte à tout moment via les paramètres ou en contactant le support. Nous pouvons
          résilier ou suspendre l&apos;accès en cas de manquement grave, avec notification lorsque la loi l&apos;exige.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">9. Droit applicable</h2>
        <p className="mt-2">
          Les présentes CGU sont régies par le droit marocain. Tout litige relève de la compétence des tribunaux du ressort
          du siège social de l&apos;éditeur, sous réserve des dispositions impératives protectrices du consommateur.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-gray-900">10. Contact</h2>
        <p className="mt-2">
          Pour toute question relative aux CGU : support@zafirix.pro (adresse indicative — à configurer en production).
        </p>
      </section>
    </LegalPageLayout>
  );
}

import { getPublicAppUrl } from '@/app/lib/atlas-app-url';
import { buildSubscriptionEmail } from '@/app/lib/email-transactional';

function ctaRow(label: string, path: string): string {
  const base = getPublicAppUrl();
  const href = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  return `<tr><td style="padding:10px 0"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#0F1F3D;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">${label}</a></td></tr>`;
}

function valuePropsBlock(): string {
  return `<ul style="margin:16px 0;padding-left:20px;color:#475569;font-size:14px;line-height:1.6">
    <li><strong>Essai gratuit 7 jours</strong> — testez en conditions réelles.</li>
    <li><strong>Sans carte bancaire</strong> pour démarrer l’essai.</li>
    <li><strong>Conçu pour le Maroc</strong> — TVA, obligations et usages locaux.</li>
    <li><strong>PME &amp; cabinets</strong> — pilotage, facturation et conformité au même endroit.</li>
  </ul>`;
}

function shell(title: string, intro: string, bodyHtml: string): string {
  const base = getPublicAppUrl();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1e293b;background:#f8fafc;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
    <tr><td><p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase">ZAFIRIX PRO</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${title}</h1>
    <p style="margin:0 0 12px;color:#475569">${intro}</p>
    ${valuePropsBlock()}
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8">Accès direct : <a href="${base}/">${base}/</a></p>
    </td></tr>
  </table>
</body></html>`;
}

export function buildWelcomeEmailHtml(displayName?: string | null): { subject: string; html: string } {
  const name = displayName?.trim() || 'Bienvenue';
  const subject = 'Bienvenue sur ZAFIRIX PRO — votre essai de 7 jours commence';
  const html = shell(
    'Bienvenue sur ZAFIRIX PRO',
    `${name}, merci de nous rejoindre. Finalisez votre mise en route en quelques minutes : entreprise, besoins (TVA, IS, paie…) et accès au tableau de bord.`,
    `<p style="margin:12px 0 8px;font-size:13px;font-weight:600;color:#334155">Prochaine étape</p>
    <table cellpadding="0" cellspacing="0" style="margin-top:4px">
      ${ctaRow('Compléter l’onboarding', '/onboarding')}
      ${ctaRow('Ouvrir le tableau de bord', '/')}
      ${ctaRow('Voir les tarifs', '/pricing')}
    </table>`,
  );
  return { subject, html };
}

export function buildInactiveReminderHtml(): { subject: string; html: string } {
  const subject = 'ZAFIRIX PRO — votre onboarding attend (essai 7 jours, sans carte)';
  const html = shell(
    'Onboarding à terminer',
    'Vous n’avez pas encore terminé la configuration initiale. En 2 minutes, vous précisez votre structure et vos priorités (TVA, facturation, paie…) pour un tableau de bord aligné sur votre activité au Maroc.',
    `<table cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${ctaRow('Reprendre l’onboarding', '/onboarding')}
      ${ctaRow('Tableau de bord', '/')}
      ${ctaRow('Voir les offres', '/pricing')}
    </table>`,
  );
  return { subject, html };
}

export function buildTrialDay5EmailHtml(endDateYmd: string): { subject: string; html: string } {
  const subject = `ZAFIRIX PRO — milieu d’essai (fin le ${endDateYmd})`;
  const html = shell(
    'Milieu de votre essai gratuit',
    `Votre période d’essai se termine le <strong>${endDateYmd}</strong>. Profitez des jours restants pour tester facturation, TVA et assistant IA — toujours sans carte bancaire pour l’essai.`,
    `<table cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${ctaRow('Continuer sur le tableau de bord', '/')}
      ${ctaRow('Comparer les offres', '/pricing')}
      ${ctaRow('Revoir l’onboarding', '/onboarding')}
    </table>`,
  );
  return { subject, html };
}

export function buildUpgradeEmailHtml(): { subject: string; html: string } {
  const subject = 'ZAFIRIX PRO — passez à l’offre adaptée à votre cabinet ou PME';
  const html = shell(
    'Prolongez l’expérience sans plafonds bloquants',
    'Votre essai touche à sa fin (ou est déjà passé). Les offres payantes débloquent volumes, utilisateurs et opérations pour les équipes qui comptent sur ZAFIRIX PRO au quotidien.',
    `<table cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${ctaRow('Voir les tarifs et souscrire', '/pricing')}
      ${ctaRow('Tableau de bord', '/')}
      ${ctaRow('Onboarding', '/onboarding')}
    </table>`,
  );
  return { subject, html };
}

function shellTransactional(title: string, intro: string, bodyHtml: string): string {
  const base = getPublicAppUrl();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1e293b;background:#f8fafc;padding:24px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
    <tr><td><p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase">ZAFIRIX PRO</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${title}</h1>
    <p style="margin:0 0 12px;color:#475569">${intro}</p>
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8"><a href="${base}/">${base}/</a></p>
    </td></tr>
  </table>
</body></html>`;
}

export function buildManualRequestAcknowledgedEmailHtml(planLabel: string): { subject: string; html: string } {
  const subject = 'ZAFIRIX PRO — nous avons reçu votre demande';
  const html = shellTransactional(
    'Paiement manuel',
    `Bonjour, nous avons reçu votre demande de souscription au forfait <strong>${planLabel}</strong> (paiement manuel — Maroc). Notre équipe vous recontacte après validation du règlement.`,
    `<table cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${ctaRow('Tableau de bord', '/')}
      ${ctaRow('Suivre mon abonnement', '/subscription')}
    </table>`,
  );
  return { subject, html };
}

export function buildPaidSubscriptionActivatedEmailHtml(planLabel: string, endYmd: string): { subject: string; html: string } {
  const built = buildSubscriptionEmail({
    kind: 'subscription_activated',
    to: '',
    planName: planLabel,
    periodEndYmd: endYmd,
  });
  return { subject: built.subject, html: built.html };
}

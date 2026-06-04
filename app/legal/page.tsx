import Link from 'next/link';
import { Scale, FileText, Shield, Cookie, Database } from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';

const DOCS = [
  {
    href: '/legal/terms',
    icon: FileText,
    title: 'Conditions générales d\'utilisation',
    desc: 'Règles d\'usage du service SaaS, abonnements et responsabilités.',
  },
  {
    href: '/legal/privacy',
    icon: Shield,
    title: 'Politique de confidentialité',
    desc: 'Collecte, utilisation et protection des données personnelles (Loi 09-08).',
  },
  {
    href: '/legal/cookies',
    icon: Cookie,
    title: 'Politique cookies',
    desc: 'Traceurs, analytics et préférences utilisateur.',
  },
  {
    href: '/legal/dpn',
    icon: Database,
    title: 'Notice de traitement des données',
    desc: 'Finalités, bases légales, sous-traitants et droits des personnes.',
  },
];

export default function LegalHubPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-3xl mx-auto text-center">
          <Scale className="mx-auto text-[#1B2A4A]" size={32} />
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Centre juridique Zafirix Atlas</h1>
          <p className="text-sm text-gray-500 mt-2">
            Documents légaux applicables à la plateforme de gestion d&apos;entreprise ZAFIRIX PRO.
          </p>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-4">
        {DOCS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 hover:border-[#1B2A4A]/30 hover:shadow-sm transition-all"
          >
            <d.icon className="shrink-0 text-[#1B2A4A]" size={24} />
            <div>
              <p className="font-semibold text-gray-900">{d.title}</p>
              <p className="text-sm text-gray-500 mt-1">{d.desc}</p>
            </div>
          </Link>
        ))}
      </main>
      <PublicFooter />
    </div>
  );
}

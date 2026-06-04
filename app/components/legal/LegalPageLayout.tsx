'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Scale } from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';

const LEGAL_LINKS = [
  { href: '/legal/terms', label: 'Conditions générales', labelAr: 'الشروط العامة' },
  { href: '/legal/privacy', label: 'Politique de confidentialité', labelAr: 'سياسة الخصوصية' },
  { href: '/legal/cookies', label: 'Politique cookies', labelAr: 'سياسة ملفات تعريف الارتباط' },
  { href: '/legal/dpn', label: 'Notice de traitement des données', labelAr: 'إشعار معالجة البيانات' },
];

type Props = {
  title: string;
  titleAr?: string;
  version?: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, titleAr, version = 'GA-2026.06', children }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 lg:px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push('/landing')}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={16} /> Accueil
          </button>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Scale size={16} /> Documents légaux
          </p>
          <span className="text-xs text-gray-400 hidden sm:inline">{version}</span>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap gap-1 py-2">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                pathname === l.href ? 'bg-[#1B2A4A] text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-2xl font-extrabold text-gray-900">{title}</h1>
          {titleAr ? <p className="text-sm text-gray-400 mt-1">{titleAr}</p> : null}
          <p className="text-xs text-gray-400 mt-2">Version {version} — Zafirix Atlas (ZAFIRIX PRO)</p>
          <div className="mt-8 space-y-8 text-sm text-gray-700 leading-relaxed">{children}</div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

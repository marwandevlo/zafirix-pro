'use client';

import { useMemo, useState } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import {
  getKnowledgeCategories,
  getSuggestedArticles,
  searchKnowledgeBase,
  type KnowledgeArticle,
} from '@/app/lib/atlas-knowledge-base';

export default function HelpCenterPage() {
  const [lang, setLang] = useState<'fr' | 'ar'>('fr');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null);
  const t = useMemo(() => (fr: string, ar: string) => (lang === 'ar' ? ar : fr), [lang]);

  const categories = getKnowledgeCategories();
  const results = useMemo(() => {
    if (!query.trim() && !category) return getSuggestedArticles(20);
    return searchKnowledgeBase(query, category || undefined);
  }, [query, category]);

  return (
    <div className="flex h-screen bg-gray-50" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <AppSidebar variant="module" lang={lang} setLang={setLang} />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={22} className="text-indigo-600" />
            {t('Centre d\'aide', 'مركز المساعدة')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Documentation searchable — Documents, TVA, Paie, Liasse, IA…', 'وثائق قابلة للبحث')}
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Rechercher…', 'بحث…')}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-gray-200 text-sm px-3 py-2"
            >
              <option value="">{t('Toutes catégories', 'كل الفئات')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          <aside className="lg:w-80 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white p-4 space-y-2 shrink-0">
            {results.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelected(a)}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm ${selected?.id === a.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}
              >
                <span className="font-semibold text-gray-900 block">{t(a.titleFr, a.titleAr)}</span>
                <span className="text-xs text-gray-400">{a.category}</span>
              </button>
            ))}
            {results.length === 0 ? (
              <p className="text-sm text-gray-400">{t('Aucun article.', 'لا مقالات.')}</p>
            ) : null}
          </aside>
          <article className="flex-1 p-6 max-w-3xl">
            {selected ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900">{t(selected.titleFr, selected.titleAr)}</h2>
                <p className="text-sm text-indigo-600 mt-1">{selected.category}</p>
                <p className="text-gray-600 mt-4 whitespace-pre-line">{t(selected.bodyFr, selected.bodyAr)}</p>
              </>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <BookOpen className="mx-auto mb-3 opacity-40" size={40} />
                <p>{t('Sélectionnez un article ou lancez une recherche.', 'اختر مقالاً أو ابحث.')}</p>
              </div>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { trackFeedbackSubmitted } from '@/app/lib/atlas-onboarding-analytics';

type Props = { lang?: 'fr' | 'ar' };

export function FeedbackWidget({ lang = 'fr' }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [kind, setKind] = useState<'satisfaction' | 'bug' | 'feature'>('satisfaction');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const t = (fr: string, ar: string) => (lang === 'ar' ? ar : fr);

  const submit = async () => {
    if (rating < 1) return;
    setSending(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, kind, message: message.trim() }),
      });
      trackFeedbackSubmitted(rating, kind);
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setRating(0);
        setMessage('');
      }, 2000);
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-40 lg:bottom-6 lg:right-6 flex items-center gap-2 rounded-full bg-[#1B2A4A] text-white text-xs font-semibold px-4 py-2.5 min-h-11 shadow-lg hover:bg-[#243660] active:scale-[0.98]"
        data-tour="feedback"
        aria-label={t('Feedback', 'ملاحظات')}
      >
        <MessageSquare size={14} />
        {t('Feedback', 'ملاحظات')}
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 left-3 z-40 lg:bottom-6 lg:right-6 lg:left-auto w-auto lg:w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white shadow-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="font-bold text-gray-900 text-sm">{t('Votre avis', 'رأيك')}</p>
        <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100">
          <X size={16} />
        </button>
      </div>
      {sent ? (
        <p className="text-sm text-emerald-700 mt-4">{t('Merci pour votre retour !', 'شكراً على ملاحظاتك!')}</p>
      ) : (
        <>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`w-8 h-8 rounded-lg text-sm font-bold ${rating >= n ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="mt-3 w-full rounded-lg border border-gray-200 text-sm px-3 py-2"
          >
            <option value="satisfaction">{t('Satisfaction', 'رضا')}</option>
            <option value="bug">{t('Bug', 'خلل')}</option>
            <option value="feature">{t('Suggestion', 'اقتراح')}</option>
          </select>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('Commentaire (optionnel)', 'تعليق (اختياري)')}
            className="mt-2 w-full rounded-lg border border-gray-200 text-sm px-3 py-2 min-h-[72px]"
          />
          <button
            type="button"
            disabled={rating < 1 || sending}
            onClick={() => void submit()}
            className="mt-3 w-full rounded-xl bg-[#1B2A4A] text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {sending ? t('Envoi…', 'جاري الإرسال…') : t('Envoyer', 'إرسال')}
          </button>
        </>
      )}
    </div>
  );
}

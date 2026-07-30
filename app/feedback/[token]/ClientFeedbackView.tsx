'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Star } from 'lucide-react';

type FormState = {
  subjectLabel: string;
  companyName: string | null;
  clientName: string | null;
  alreadySubmitted: boolean;
};

export function ClientFeedbackView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [satisfaction, setSatisfaction] = useState(0);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/client-feedback/public/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError('Ce lien est invalide ou a expiré.');
          return;
        }
        setForm(data.form);
        if (data.form.clientName) setName(data.form.clientName);
        if (data.form.alreadySubmitted) setDone(true);
      } catch {
        setError('Impossible de charger le formulaire.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (satisfaction < 1 || nps == null) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/client-feedback/public/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satisfactionScore: satisfaction,
          npsScore: nps,
          comment: comment.trim() || undefined,
          respondentName: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error === 'already_submitted' ? 'Vous avez déjà répondu.' : 'Envoi échoué.');
        return;
      }
      setDone(true);
    } catch {
      setError('Envoi échoué. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl border shadow-sm p-8 max-w-md text-center">
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6">
        <div className="bg-white rounded-xl border shadow-sm p-8 max-w-md text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">Merci pour votre retour !</h1>
          <p className="text-sm text-gray-600">Votre avis nous aide à améliorer nos services.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white py-10 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border shadow-sm p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          {form?.companyName && (
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">{form.companyName}</p>
          )}
          <h1 className="text-xl font-semibold text-gray-900">Votre avis compte</h1>
          <p className="text-sm text-gray-500">{form?.subjectLabel}</p>
        </div>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Satisfaction globale (1 à 5)
            </label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSatisfaction(n)}
                  className={`p-2 rounded-lg transition-colors ${
                    satisfaction >= n ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
                  }`}
                  aria-label={`${n} étoiles`}
                >
                  <Star size={28} fill={satisfaction >= n ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recommanderiez-vous nos services ? (NPS 0–10)
            </label>
            <div className="flex flex-wrap justify-center gap-1.5">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNps(n)}
                  className={`w-9 h-9 text-sm rounded-lg border transition-colors ${
                    nps === n
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
              <span>Pas du tout</span>
              <span>Très probablement</span>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Commentaire (optionnel)</span>
            <textarea
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Partagez votre expérience…"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Votre nom (optionnel)</span>
            <input
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={submitting || satisfaction < 1 || nps == null}
            className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Envoi…' : 'Envoyer mon avis'}
          </button>
        </form>
      </div>
    </div>
  );
}

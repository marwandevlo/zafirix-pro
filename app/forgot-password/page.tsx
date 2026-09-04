'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { requestPasswordResetEmail } from '@/app/actions/transactional-email';
import { PublicFooter } from '@/app/components/public/PublicFooter';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => isValidEmail(email), [email]);

  const submit = async () => {
    setLoading(true);
    try {
      // Branded Resend mail. The action never reveals whether the account exists.
      await requestPasswordResetEmail(email.trim());
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B2A4A] flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm"
            >
              <ArrowLeft size={16} /> Retour
            </button>
            <Image
              src="/zafirix-logo.png"
              alt="ZAFIRIX PRO"
              width={140}
              height={40}
              className="h-8 w-auto"
              priority
            />
            <div />
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl">
            <h1 className="text-xl font-bold text-gray-800 mb-1">Mot de passe oublié ?</h1>
            <p className="text-sm text-gray-500">
              أدخل بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور.
            </p>

            {done ? (
              <div className="mt-6 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                <CheckCircle size={16} className="mt-0.5" />
                <div>
                  <p className="font-semibold">تم الإرسال</p>
                  <p className="mt-0.5">إذا كان هذا البريد مسجلاً، ستتوصل برابط إعادة تعيين كلمة المرور</p>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      placeholder="votre@email.com"
                      className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={submit}
                  disabled={loading || !canSubmit}
                  className="w-full py-3 bg-[#1B2A4A] text-white rounded-lg text-sm font-medium hover:bg-[#243660] transition-colors disabled:opacity-50"
                >
                  {loading ? 'Chargement…' : 'Envoyer le lien'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}


import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';

export function PublicFooter() {
  const socialBase =
    'group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-black/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400';

  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <ZafirixLogo size="md" subtitle={false} />
            <p className="text-sm text-gray-500 mt-2 max-w-md">
              Plateforme SaaS de comptabilité, facturation et fiscalité au Maroc — pensée pour les PME, cabinets et groupes.
              تجربة حديثة، سهلة، ومهنية.
            </p>
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-gray-400" />
                <a className="hover:underline" href="mailto:contact@zafirix.group">contact@zafirix.group</a>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-gray-400" />
                <a className="hover:underline" href="tel:0665425852">06 65 4 2 5 8 5 2</a>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Liens rapides</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li><Link className="hover:text-gray-900" href="/pricing">Pricing</Link></li>
              <li><Link className="hover:text-gray-900" href="/login">Login</Link></li>
              <li><Link className="hover:text-gray-900" href="/signup">Sign Up</Link></li>
              <li><a className="hover:text-gray-900" href="mailto:contact@zafirix.group">Contact</a></li>
              <li><Link className="hover:text-gray-900" href="/terms">Terms of Service</Link></li>
              <li><Link className="hover:text-gray-900" href="/privacy">Privacy Policy</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-900">Social</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                className={`${socialBase} bg-[#1877F2]/10 hover:bg-[#1877F2]/15`}
                href="https://www.facebook.com/people/zafirixpro/61593914003462/"
                aria-label="Facebook"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#1877F2"
                      d="M13.5 9H16V6h-2.5c-2.48 0-4 1.53-4 4.35V11H7v3h2.5v7h3v-7H15l.5-3h-2.5V10.1c0-.9.28-1.52 1.47-1.52Z"
                    />
                  </svg>
                </span>
                Facebook
              </a>
              <a
                className={`${socialBase} bg-linear-to-br from-[#F58529]/15 via-[#DD2A7B]/15 to-[#8134AF]/15 hover:from-[#F58529]/25 hover:via-[#DD2A7B]/25 hover:to-[#8134AF]/25`}
                href="https://www.instagram.com/zafirixpro?igsh=MWw5MXNhemV3bjE5aw=="
                aria-label="Instagram"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <defs>
                      <linearGradient id="igFooterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#F58529" />
                        <stop offset="45%" stopColor="#DD2A7B" />
                        <stop offset="100%" stopColor="#8134AF" />
                      </linearGradient>
                    </defs>
                    <path
                      fill="url(#igFooterGrad)"
                      d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9A4.5 4.5 0 0 1 16.5 21h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm0 1.5A3 3 0 0 0 4.5 7.5v9A3 3 0 0 0 7.5 19.5h9a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-9Zm4.5 3.25A3.75 3.75 0 1 1 8.25 12 3.75 3.75 0 0 1 12 7.75Zm0 1.5a2.25 2.25 0 1 0 2.25 2.25A2.25 2.25 0 0 0 12 9.25ZM17.25 6.75a.75.75 0 1 1-.75.75.75.75 0 0 1 .75-.75Z"
                    />
                  </svg>
                </span>
                Instagram
              </a>
              <a
                className={`${socialBase} bg-[#0A66C2]/10 hover:bg-[#0A66C2]/15`}
                href="#"
                aria-label="LinkedIn"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#0A66C2"
                      d="M6.5 8.75h2.5V21H6.5V8.75Zm1.27-4a1.45 1.45 0 1 1-1.45 1.45A1.45 1.45 0 0 1 7.77 4.75ZM17.5 8.5c2.21 0 3.5 1.46 3.5 4.25V21H18.5v-7.5c0-1.78-.63-3-2.25-3s-2.32 1.22-2.32 3V21H11.5V8.75h2.18v1.35a3.09 3.09 0 0 1 2.78-1.6Z"
                    />
                  </svg>
                </span>
                LinkedIn
              </a>
              <a
                className={`${socialBase} bg-[#25D366]/12 hover:bg-[#25D366]/18`}
                href="https://wa.me/212665425852"
                aria-label="WhatsApp"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#25D366"
                      d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.82 0 .75 5.07.75 11.3a11.74 11.74 0 0 0 1.58 5.9L0 24l6.95-1.82a11.7 11.7 0 0 0 5.1 1.45h.01c6.23 0 11.3-5.07 11.3-11.3a11.8 11.8 0 0 0-3.84-8.85ZM12.06 21.4h-.01a9.36 9.36 0 0 1-4.77-1.31l-.34-.2-3.55.93 1-3.45-.22-.35a9.4 9.4 0 1 1 7.89 4.38Zm5.45-7.45c-.3-.15-1.77-.87-2.04-.97s-.48-.15-.68.15-.78.97-.95 1.17-.35.22-.65.07a8.06 8.06 0 0 1-2.36-1.45 8.9 8.9 0 0 1-1.64-2c-.17-.3 0-.46.13-.61s.3-.35.45-.52a1.9 1.9 0 0 0 .3-.5.55.55 0 0 0 0-.52c-.07-.15-.68-1.64-.93-2.25s-.5-.52-.68-.53h-.58a1.12 1.12 0 0 0-.8.37 3.4 3.4 0 0 0-1.07 2.55 5.9 5.9 0 0 0 1.23 3.1 13.5 13.5 0 0 0 5.18 4.6 5.7 5.7 0 0 0 2.83.6 2.4 2.4 0 0 0 1.56-.73 1.94 1.94 0 0 0 .41-1.08c0-.35.15-.52.3-.6s.65-.3.95-.45.55-.27.63-.42.1-.37-.07-.6Z"
                    />
                  </svg>
                </span>
                WhatsApp
              </a>
              <a
                className={`${socialBase} bg-[#FF0000]/10 hover:bg-[#FF0000]/15`}
                href="https://www.youtube.com/@ZafrixPro"
                aria-label="YouTube"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#FF0000"
                      d="M23.5 6.2a3.05 3.05 0 0 0-2.15-2.16C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.35.44A3.05 3.05 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3.05 3.05 0 0 0 2.15 2.16C4.5 20.4 12 20.4 12 20.4s7.5 0 9.35-.44a3.05 3.05 0 0 0 2.15-2.16A32 32 0 0 0 24 12a32 32 0 0 0-.5-5.8ZM9.75 15.57V8.43L15.84 12l-6.09 3.57Z"
                    />
                  </svg>
                </span>
                YouTube
              </a>
              <a
                className={`${socialBase} bg-[#0F1F3D]/8 hover:bg-cyan-400/15`}
                href="https://www.tiktok.com/@zafrix.pro?_r=1&_t=ZS-99ARZvw5VWy"
                aria-label="TikTok"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#0F1F3D"
                      d="M16.6 5.82c.9.95 2.1 1.6 3.45 1.78V10.4a7.9 7.9 0 0 1-3.45-.86v5.3a6.16 6.16 0 1 1-6.16-6.16c.2 0 .4.02.6.04v2.8a3.36 3.36 0 1 0 2.36 3.2V2.5h3.2c0 1.16.4 2.24 1 3.32Z"
                    />
                  </svg>
                </span>
                TikTok
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-400">
          <span>© {new Date().getFullYear()} ZAFIRIX GROUP. Tous droits réservés.</span>
          <span>Maroc · Comptabilité · Fiscalité · Facturation</span>
        </div>
      </div>
    </footer>
  );
}


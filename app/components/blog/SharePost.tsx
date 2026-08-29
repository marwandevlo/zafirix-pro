'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { BLOG_CYAN, BLOG_NAVY, BLOG_UI } from '@/app/lib/blog/copy';
import type { BlogLocale } from '@/app/lib/blog/types';

export type SharePostProps = {
  title: string;
  url: string;
  locale?: BlogLocale;
};

function twitterIntentUrl(title: string, url: string): string {
  const intent = new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text', title);
  intent.searchParams.set('url', url);
  return intent.toString();
}

function linkedInShareUrl(url: string): string {
  const intent = new URL('https://www.linkedin.com/sharing/share-offsite/');
  intent.searchParams.set('url', url);
  return intent.toString();
}

function whatsAppShareUrl(title: string, url: string): string {
  const intent = new URL('https://wa.me/');
  intent.searchParams.set('text', `${title}\n${url}`);
  return intent.toString();
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function SharePost({ title, url, locale = 'fr' }: SharePostProps) {
  const ui = BLOG_UI[locale];
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = useCallback(async () => {
    const ok = await writeClipboard(url);
    if (ok) setCopied(true);
  }, [url]);

  const shareLinks = [
    {
      id: 'x',
      href: twitterIntentUrl(title, url),
      label: ui.shareTwitter,
      icon: <XLogo />,
    },
    {
      id: 'linkedin',
      href: linkedInShareUrl(url),
      label: ui.shareLinkedIn,
      icon: <LinkedInLogo />,
    },
    {
      id: 'whatsapp',
      href: whatsAppShareUrl(title, url),
      label: ui.shareWhatsApp,
      icon: <WhatsAppLogo />,
    },
  ] as const;

  return (
    <div
      className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 px-3 py-2.5 sm:px-4"
      style={{ backgroundColor: BLOG_NAVY }}
      role="group"
      aria-label={ui.shareLabel}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55 px-1">{ui.shareLabel}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {shareLinks.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={item.label}
            title={item.label}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-[#06b6d4] hover:text-[#0F1F3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]"
          >
            {item.icon}
          </a>
        ))}
        <button
          type="button"
          onClick={() => void onCopy()}
          aria-label={copied ? ui.shareCopied : ui.shareCopy}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]"
          style={
            copied
              ? { backgroundColor: BLOG_CYAN, color: BLOG_NAVY }
              : { backgroundColor: 'rgba(6, 182, 212, 0.12)', color: BLOG_CYAN }
          }
        >
          {copied ? <Check size={16} strokeWidth={2.5} /> : <Link2 size={16} />}
          <span className="whitespace-nowrap">{copied ? ui.shareCopied : ui.shareCopy}</span>
        </button>
      </div>
    </div>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M14.72 10.16 22.1 1.5h-1.75l-6.4 7.52L8.82 1.5H1.5l7.76 11.3L1.5 22.5h1.75l6.78-7.96 5.42 7.96H22.5l-7.78-12.34Zm-2.4 2.81-.78-1.13L3.88 2.86h2.69l5.03 7.2.78 1.13 6.54 9.36h-2.69l-5.91-8.58Z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.26 2.36 4.26 5.44v6.3ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0Z" />
    </svg>
  );
}

function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2.05c-5.46 0-9.91 4.4-9.91 9.82 0 1.73.45 3.42 1.31 4.91L2 22l5.37-1.4a10 10 0 0 0 4.67 1.18h.01c5.46 0 9.91-4.4 9.91-9.82 0-2.62-1.03-5.09-2.9-6.94a9.97 9.97 0 0 0-6.99-2.97Zm0 17.94h-.01a8.27 8.27 0 0 1-4.21-1.15l-.3-.18-3.19.83.85-3.1-.2-.32a8.1 8.1 0 0 1-1.26-4.35c0-4.53 3.73-8.21 8.32-8.21 2.22 0 4.31.86 5.88 2.41a8.16 8.16 0 0 1 2.44 5.84c0 4.53-3.73 8.23-8.32 8.23Zm4.56-6.16c-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.12-.56.12-.17.25-.64.8-.79.97-.14.17-.3.19-.55.07-.25-.12-1.06-.39-2.02-1.23-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.38.11-.5.11-.11.25-.3.37-.44.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.84-.87 2.05 0 1.21.89 2.38 1.01 2.54.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

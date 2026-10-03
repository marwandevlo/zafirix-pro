'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Driver, DriveStep, PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import { trackEvent } from '@/app/lib/analytics-track';
import { isAtlasSupabaseDataEnabled } from '@/app/lib/atlas-data-source';
import { supabase } from '@/app/lib/supabase';

const SEEN_KEY = 'has_completed_onboarding_tour';
const PHASE_KEY = 'atlas_onboarding_tour_phase';

const SKIP_PREFIXES = [
  '/login',
  '/signup',
  '/landing',
  '/pricing',
  '/auth',
  '/pending-approval',
  '/access-denied',
  '/portal',
  '/onboarding',
  '/setup',
  '/client',
  '/auditor',
];

let tourStartTracked = false;
let tourCompleteTracked = false;

type Phase = '' | 'menu' | 'create' | 'form';

function readSeenLocal(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeSeenLocal(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'true');
  } catch {
    /* private mode */
  }
}

function readPhase(): Phase {
  try {
    const value = sessionStorage.getItem(PHASE_KEY);
    if (value === 'menu' || value === 'create' || value === 'form') return value;
    return '';
  } catch {
    return '';
  }
}

function writePhase(phase: Phase): void {
  try {
    if (!phase) sessionStorage.removeItem(PHASE_KEY);
    else sessionStorage.setItem(PHASE_KEY, phase);
  } catch {
    /* private mode */
  }
}

async function readSeenRemote(): Promise<boolean> {
  if (!isAtlasSupabaseDataEnabled()) return false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    const meta = data.user.user_metadata as Record<string, unknown> | undefined;
    const seen = meta?.has_completed_onboarding_tour === true;
    if (seen) writeSeenLocal();
    return seen;
  } catch (error) {
    console.warn('[activation-tour] metadata read failed', error instanceof Error ? error.message : error);
    return false;
  }
}

function persistCompleted(): void {
  writeSeenLocal();
  writePhase('');
  if (!isAtlasSupabaseDataEnabled()) return;
  void supabase.auth.updateUser({ data: { has_completed_onboarding_tour: true } }).then(({ error }) => {
    if (error) console.warn('[activation-tour] metadata update failed', error.message);
  });
}

function waitForVisible(id: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        const onScreen =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          rect.right > 8 &&
          rect.left < window.innerWidth - 8;
        if (onScreen) {
          resolve(el);
          return;
        }
      }
      if (Date.now() - started > timeoutMs) {
        resolve(null);
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

function isNarrow(): boolean {
  return window.matchMedia('(max-width: 1023px)').matches;
}

function clampPopover(): void {
  const pop = document.querySelector('.activation-tour-popover');
  if (!(pop instanceof HTMLElement)) return;
  if (window.innerWidth > 640) return;
  const margin = 10;
  const max = window.innerWidth - margin * 2;
  pop.style.maxWidth = `${max}px`;
  pop.style.width = `${max}px`;
  pop.style.boxSizing = 'border-box';
  const left = margin;
  pop.style.left = `${left}px`;
  pop.style.right = 'auto';
  const rect = pop.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - margin) {
    pop.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`;
  }
  if (rect.top < margin) pop.style.top = `${margin}px`;
}

function hint(french: string, darija: string): string {
  return `${french}\n${darija}`;
}

type Run = {
  tour: Driver | null;
  cancelled: boolean;
  advancing: boolean;
  persisted: boolean;
  detach: () => void;
};

function remember(run: Run, reason: 'done' | 'skip'): void {
  if (run.persisted) return;
  run.persisted = true;
  persistCompleted();
  if (reason === 'done' && !tourCompleteTracked) {
    tourCompleteTracked = true;
    trackEvent('onboarding_tour_completed', { tour: 'first_invoice' });
  }
}

function trackStarted(): void {
  if (tourStartTracked) return;
  tourStartTracked = true;
  trackEvent('onboarding_tour_started', { tour: 'first_invoice' });
}

function renderSkip(popover: PopoverDOM, onSkip: () => void, absoluteStep: number): void {
  if (popover.progress) popover.progress.textContent = `${absoluteStep} / 5`;
  if (popover.footer.querySelector('[data-activation-tour-skip]')) return;
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.dataset.activationTourSkip = 'true';
  skip.className = 'activation-tour-skip';
  skip.textContent = 'تخطي الجولة / Passer la visite';
  skip.addEventListener('click', onSkip);
  popover.footer.prepend(skip);
  window.requestAnimationFrame(clampPopover);
}

/**
 * Five-step spotlight from the dashboard Factures item through saving the first invoice.
 * Starts only while `has_completed_onboarding_tour` is false.
 */
export function DashboardOnboardingTour() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  useEffect(() => {
    if (SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;

    const onDashboard = pathname === '/' || pathname === '/dashboard';
    const onFactures = pathname === '/factures' || pathname.startsWith('/factures/');
    if (!onDashboard && !onFactures) return;

    const run: Run = {
      tour: null,
      cancelled: false,
      advancing: false,
      persisted: false,
      detach: () => {},
    };

    const skip = () => {
      remember(run, 'skip');
      run.advancing = true;
      run.tour?.destroy();
      run.tour = null;
    };

    void (async () => {
      try {
        if (readSeenLocal() || (await readSeenRemote())) return;
        if (run.cancelled) return;
        if (isAtlasSupabaseDataEnabled()) {
          const { data } = await supabase.auth.getUser();
          if (!data.user || run.cancelled) return;
        }

        const phase = readPhase();
        const welcome = new URLSearchParams(window.location.search).get('welcome') === '1';
        const { driver } = await import('driver.js');
        if (run.cancelled) return;

        const narrow = isNarrow();
        const popoverSide = narrow ? 'bottom' : 'right';

        if (onDashboard) {
          if (narrow) window.dispatchEvent(new Event('atlas-open-mobile-nav'));
          const menu = await waitForVisible('menu-item-factures', 2500);
          if (!menu || run.cancelled) return;

          const leaveMenu = () => {
            run.advancing = true;
            writePhase('create');
            run.detach();
            run.tour?.destroy();
            run.tour = null;
            router.push('/factures');
          };

          const onMenuClick = () => {
            run.advancing = true;
            writePhase('create');
          };
          menu.addEventListener('click', onMenuClick, true);
          run.detach = () => menu.removeEventListener('click', onMenuClick, true);

          run.tour = driver({
            animate: true,
            duration: 280,
            smoothScroll: true,
            allowClose: true,
            overlayClickBehavior: 'close',
            overlayOpacity: 0.75,
            overlayColor: '#0b1220',
            stagePadding: 8,
            stageRadius: 12,
            popoverOffset: 12,
            showProgress: true,
            progressText: '1 / 5',
            showButtons: ['next', 'close'],
            nextBtnText: 'التالي',
            doneBtnText: 'التالي',
            popoverClass: 'activation-tour-popover',
            onHighlightStarted: () => {
              trackStarted();
              writePhase('menu');
            },
            onPopoverRender: (popover) => {
              renderSkip(popover, skip, 1);
            },
            onDoneClick: () => {
              leaveMenu();
            },
            onDestroyStarted: (_element, _step, opts) => {
              if (!run.advancing) remember(run, 'skip');
              opts.driver.destroy();
            },
            steps: [
              {
                element: '#menu-item-factures',
                advanceOnClick: true,
                popover: {
                  title: '1. من هنا غاتبدا الخدمة',
                  description: hint(
                    'Ouvrez Factures pour créer votre première facture.',
                    "برك على 'Factures' باش تدخل للصفحة فين غاتصاوب أول فاكتورة ديالك فثواني.",
                  ),
                  side: popoverSide,
                  align: 'center',
                },
              },
            ],
          });

          if (run.cancelled) {
            run.detach();
            run.tour.destroy();
            run.tour = null;
            return;
          }
          run.tour.drive();
          return;
        }

        if (!onFactures) return;
        if (phase !== 'create' && phase !== 'form' && !welcome) return;

        const startAtForm = phase === 'form';
        if (startAtForm) window.dispatchEvent(new Event('atlas-open-invoice-form'));

        const anchorId = startAtForm ? 'tour-client-step' : 'tour-new-invoice';
        const anchor = await waitForVisible(anchorId, 3000);
        if (!anchor || run.cancelled) return;

        const openFormThenNext = () => {
          window.dispatchEvent(new Event('atlas-open-invoice-form'));
          run.tour?.moveNext();
        };

        const buttonStep: DriveStep = {
          element: '#tour-new-invoice',
          advanceOnClick: true,
          popover: {
            title: '2. أنشئ فاتورة جديدة',
            description: hint(
              'Ce bouton ouvre le formulaire de facture.',
              'اضغط على هذا الزر لفتح نموذج إنشاء الفاتورة.',
            ),
            side: 'bottom',
            align: 'center',
            onNextClick: openFormThenNext,
          },
        };

        const formSteps: DriveStep[] = [
          {
            element: '#tour-client-step',
            waitForElement: 2500,
            popover: {
              title: '3. اسم الزبون',
              description: hint(
                'Écrivez le nom du client. Un nouveau client est enregistré automatiquement.',
                'اكتب هنا اسم الزبون. إذا كان أول مرة كتعامل معاه كيتسجل تلقائياً.',
              ),
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-items-step',
            waitForElement: 2500,
            popover: {
              title: '4. السلعة والثمن',
              description: hint(
                'Indiquez la prestation et le montant HT. La TVA se calcule toute seule.',
                'حدد نوع السلعة والمبلغ. الحسابات كتدار لراسها.',
              ),
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-save-step',
            waitForElement: 2500,
            popover: {
              title: '5. حفظ ومشاركة',
              description: hint(
                'Enregistrez. Vous pourrez imprimer la facture ou l’envoyer sur WhatsApp.',
                'برك هنا وتكون الفاكتورة واجدة تقدر تطبعها أو تصيفطها فـ WhatsApp فالحين!',
              ),
              side: 'top',
              align: 'center',
            },
          },
        ];

        const steps = startAtForm ? formSteps : [buttonStep, ...formSteps];
        const base = startAtForm ? 3 : 2;

        run.tour = driver({
          animate: true,
          duration: 280,
          smoothScroll: true,
          allowClose: true,
          overlayClickBehavior: 'close',
          overlayOpacity: 0.75,
          overlayColor: '#0b1220',
          stagePadding: 8,
          stageRadius: 12,
          popoverOffset: 12,
          showProgress: true,
          showButtons: ['next', 'previous', 'close'],
          nextBtnText: 'التالي',
          prevBtnText: 'رجوع',
          doneBtnText: 'تم / Terminer',
          popoverClass: 'activation-tour-popover',
          disableActiveInteraction: false,
          onHighlightStarted: (_element, _step, opts) => {
            trackStarted();
            const index = opts.index ?? 0;
            const absolute = base + index;
            writePhase(absolute >= 3 ? 'form' : 'create');
          },
          onHighlighted: (element) => {
            clampPopover();
            if (!(element instanceof HTMLElement) || element.id !== 'tour-save-step') return;
            const onSave = () => {
              window.setTimeout(() => {
                if (document.getElementById('tour-save-step')) return;
                remember(run, 'done');
                run.advancing = true;
                run.tour?.destroy();
                run.tour = null;
              }, 600);
            };
            element.addEventListener('click', onSave);
            const previous = run.detach;
            run.detach = () => {
              previous();
              element.removeEventListener('click', onSave);
            };
          },
          onPopoverRender: (popover, opts) => {
            renderSkip(popover, skip, base + (opts.index ?? 0));
          },
          onDoneClick: (_element, _step, opts) => {
            remember(run, 'done');
            run.advancing = true;
            opts.driver.destroy();
          },
          onDestroyStarted: (_element, _step, opts) => {
            if (!run.advancing) remember(run, 'skip');
            opts.driver.destroy();
          },
          steps,
        });

        if (run.cancelled) {
          run.tour.destroy();
          run.tour = null;
          return;
        }
        run.tour.drive();
      } catch (error) {
        console.warn('[activation-tour] failed to start', error instanceof Error ? error.message : error);
        run.tour?.destroy();
        run.tour = null;
      }
    })();

    return () => {
      run.cancelled = true;
      run.advancing = true;
      run.detach();
      run.tour?.destroy();
      run.tour = null;
    };
  }, [pathname, router]);

  return (
    <style>{`
      .activation-tour-popover.driver-popover {
        max-width: min(22rem, calc(100vw - 1.25rem));
        box-sizing: border-box;
      }
      .activation-tour-popover .driver-popover-title {
        direction: rtl;
        text-align: right;
      }
      .activation-tour-popover .driver-popover-description {
        white-space: pre-line;
        direction: rtl;
        text-align: right;
      }
      .activation-tour-popover .driver-popover-footer {
        flex-wrap: wrap;
        gap: 8px;
      }
      .activation-tour-popover .activation-tour-skip {
        width: 100%;
        border: 1px solid #e2e8f0;
        background: #fff;
        color: #334155;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .activation-tour-popover .activation-tour-skip:hover {
        background: #f8fafc;
      }
      @media (max-width: 640px) {
        .activation-tour-popover.driver-popover {
          max-width: calc(100vw - 1.25rem);
        }
      }
    `}</style>
  );
}

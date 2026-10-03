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

type Phase = '' | 'societes' | 'new-company' | 'submit' | 'select' | 'factures';

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
    if (value === 'societes' || value === 'new-company' || value === 'submit' || value === 'select' || value === 'factures') {
      return value;
    }
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
    trackEvent('onboarding_tour_completed', { tour: 'company_then_invoice' });
  }
}

function trackStarted(): void {
  if (tourStartTracked) return;
  tourStartTracked = true;
  trackEvent('onboarding_tour_started', { tour: 'company_then_invoice' });
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

const SPOTLIGHT = {
  animate: true,
  duration: 280,
  smoothScroll: true,
  allowClose: true,
  overlayClickBehavior: 'close' as const,
  overlayOpacity: 0.75,
  overlayColor: '#0b1220',
  stagePadding: 8,
  stageRadius: 12,
  popoverOffset: 12,
  showProgress: true,
  popoverClass: 'activation-tour-popover',
  disableActiveInteraction: false,
};

/**
 * Company first, then the Factures menu.
 * Starts only while `has_completed_onboarding_tour` is false.
 */
export function DashboardOnboardingTour() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  useEffect(() => {
    if (SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;

    const onDashboard = pathname === '/' || pathname === '/dashboard';
    const onCompanies = pathname === '/companies' || pathname.startsWith('/companies/');
    if (!onDashboard && !onCompanies) return;

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
        const { driver } = await import('driver.js');
        if (run.cancelled) return;

        const narrow = isNarrow();
        const menuSide = narrow ? 'bottom' : 'right';

        const destroyQuietly = () => {
          run.advancing = true;
          run.detach();
          run.tour?.destroy();
          run.tour = null;
        };

        if (onDashboard) {
          const showFactures = phase === 'factures';
          if (narrow) window.dispatchEvent(new Event('atlas-open-mobile-nav'));
          const menu = await waitForVisible(showFactures ? 'menu-item-factures' : 'menu-item-societes', 2500);
          if (!menu || run.cancelled) return;

          const leaveToCompanies = () => {
            writePhase('new-company');
            destroyQuietly();
            router.push('/companies');
          };
          const finishOnFactures = () => {
            remember(run, 'done');
            destroyQuietly();
            router.push('/factures');
          };

          const onMenuClick = () => {
            if (showFactures) remember(run, 'done');
            else writePhase('new-company');
            run.advancing = true;
          };
          menu.addEventListener('click', onMenuClick, true);
          run.detach = () => menu.removeEventListener('click', onMenuClick, true);

          run.tour = driver({
            ...SPOTLIGHT,
            progressText: showFactures ? '5 / 5' : '1 / 5',
            showButtons: ['next', 'close'],
            nextBtnText: 'التالي',
            doneBtnText: showFactures ? 'تم / Terminer' : 'التالي',
            onHighlightStarted: () => {
              trackStarted();
              writePhase(showFactures ? 'factures' : 'societes');
            },
            onPopoverRender: (popover) => {
              renderSkip(popover, skip, showFactures ? 5 : 1);
            },
            onDoneClick: () => {
              if (showFactures) finishOnFactures();
              else leaveToCompanies();
            },
            onDestroyStarted: (_element, _step, opts) => {
              if (!run.advancing) remember(run, 'skip');
              opts.driver.destroy();
            },
            steps: [
              showFactures
                ? {
                    element: '#menu-item-factures',
                    advanceOnClick: true,
                    popover: {
                      title: '5. الانتقال إلى الفواتير',
                      description: 'دابا شركتك واجدة! تقدر تدخل لـ Factures وتصاوب أول فاتورة ديالك.',
                      side: menuSide,
                      align: 'center',
                    },
                  }
                : {
                    element: '#menu-item-societes',
                    advanceOnClick: true,
                    popover: {
                      title: '1. إعداد وإدارة الشركات',
                      description: 'أول خطوة: ادخل هنا باش تضيف أو تختار الشركة ديالك.',
                      side: menuSide,
                      align: 'center',
                    },
                  },
            ],
          });

          if (run.cancelled) {
            destroyQuietly();
            return;
          }
          run.tour.drive();
          return;
        }

        if (!onCompanies) return;
        if (phase !== 'new-company' && phase !== 'submit' && phase !== 'select' && phase !== 'factures') return;

        if (phase === 'submit') window.dispatchEvent(new Event('atlas-open-company-form'));
        if ((phase === 'factures' || phase === 'select') && narrow) {
          window.dispatchEvent(new Event('atlas-open-mobile-nav'));
        }

        let activePhase = phase;
        const anchorId =
          activePhase === 'submit'
            ? 'btn-add-company-submit'
            : activePhase === 'select'
              ? 'btn-select-company'
              : activePhase === 'factures'
                ? 'menu-item-factures'
                : 'btn-new-company';
        let anchor = await waitForVisible(anchorId, activePhase === 'select' ? 4000 : 3000);
        if (!anchor && activePhase === 'select') {
          activePhase = 'factures';
          writePhase('factures');
          if (narrow) window.dispatchEvent(new Event('atlas-open-mobile-nav'));
          anchor = await waitForVisible('menu-item-factures', 2500);
        }
        if (!anchor || run.cancelled) return;

        const companySteps: DriveStep[] = [
          {
            element: '#btn-new-company',
            advanceOnClick: true,
            popover: {
              title: '2. إضافة شركة جديدة',
              description: 'اضغط هنا باش تدخل معلومات شركتك (الاسم، الـ ICE، والسجل التجاري).',
              side: 'bottom',
              align: 'center',
              onNextClick: () => {
                window.dispatchEvent(new Event('atlas-open-company-form'));
                writePhase('submit');
                run.tour?.moveNext();
              },
            },
          },
          {
            element: '#btn-add-company-submit',
            waitForElement: 2500,
            popover: {
              title: '3. حفظ معلومات الشركة',
              description: 'عمر المعلومات الأساسية وضغط هنا باش تسجل الشركة.',
              side: narrow ? 'bottom' : 'top',
              align: 'center',
              onNextClick: () => {
                writePhase('select');
                run.tour?.moveNext();
              },
            },
          },
          {
            element: '#btn-select-company',
            waitForElement: 4000,
            skipMissingElement: true,
            popover: {
              title: '4. تفعيل الشركة',
              description: "اضغط على 'Sélectionner' باش تولي هي الشركة النشطة اللي كتخدم بها.",
              side: narrow ? 'bottom' : 'left',
              align: 'center',
              onNextClick: () => {
                writePhase('factures');
                if (isNarrow()) window.dispatchEvent(new Event('atlas-open-mobile-nav'));
                run.tour?.moveNext();
              },
            },
          },
          {
            element: '#menu-item-factures',
            advanceOnClick: true,
            popover: {
              title: '5. الانتقال إلى الفواتير',
              description: 'دابا شركتك واجدة! تقدر تدخل لـ Factures وتصاوب أول فاتورة ديالك.',
              side: menuSide,
              align: 'center',
            },
          },
        ];

        const startIndex = activePhase === 'submit' ? 1 : activePhase === 'select' ? 2 : activePhase === 'factures' ? 3 : 0;

        run.tour = driver({
          ...SPOTLIGHT,
          showButtons: ['next', 'previous', 'close'],
          nextBtnText: 'التالي',
          prevBtnText: 'رجوع',
          doneBtnText: 'تم / Terminer',
          onHighlightStarted: (_element, _step, opts) => {
            trackStarted();
            const absolute = 2 + (opts.index ?? 0);
            writePhase(absolute <= 2 ? 'new-company' : absolute === 3 ? 'submit' : absolute === 4 ? 'select' : 'factures');
          },
          onHighlighted: (element) => {
            clampPopover();
            if (!(element instanceof HTMLElement)) return;
            if (element.id === 'btn-select-company') {
              const onSelect = () => {
                run.advancing = true;
                writePhase('factures');
              };
              element.addEventListener('click', onSelect, true);
              const previous = run.detach;
              run.detach = () => {
                previous();
                element.removeEventListener('click', onSelect, true);
              };
            }
            if (element.id === 'menu-item-factures') {
              const onFactures = () => {
                remember(run, 'done');
                run.advancing = true;
              };
              element.addEventListener('click', onFactures, true);
              const previous = run.detach;
              run.detach = () => {
                previous();
                element.removeEventListener('click', onFactures, true);
              };
            }
          },
          onPopoverRender: (popover, opts) => {
            renderSkip(popover, skip, 2 + (opts.index ?? 0));
          },
          onDoneClick: (_element, _step, opts) => {
            remember(run, 'done');
            destroyQuietly();
            opts.driver.destroy();
            router.push('/factures');
          },
          onDestroyStarted: (_element, _step, opts) => {
            if (!run.advancing) remember(run, 'skip');
            opts.driver.destroy();
          },
          steps: companySteps,
        });

        if (run.cancelled) {
          destroyQuietly();
          return;
        }
        run.tour.drive(startIndex);
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

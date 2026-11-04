import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';

import { computeStudy } from '../../app/lib/business-studio/engine';
import { formatCentsMad } from '../../app/lib/business-studio/i18n';
import { computeMetrics } from '../../app/lib/business-studio/metrics';
import { Assumptions } from '../../app/etude-projet/_studio/Assumptions';
import { Dashboard } from '../../app/etude-projet/_studio/Dashboard';
import { Profile } from '../../app/etude-projet/_studio/Profile';
import { Risks } from '../../app/etude-projet/_studio/Risks';
import { Scenarios } from '../../app/etude-projet/_studio/Scenarios';
import { Simulator } from '../../app/etude-projet/_studio/Simulator';
import { Statements } from '../../app/etude-projet/_studio/Statements';
import { Tax } from '../../app/etude-projet/_studio/Tax';
import { StudioLangProvider } from '../../app/etude-projet/_studio/ui';
import { richModel } from './fixtures';

const noop = () => undefined;

function render<P extends object>(lang: 'fr' | 'ar', C: ComponentType<P>, props: P): string {
  const Provider = StudioLangProvider as ComponentType<{ lang: 'fr' | 'ar'; children?: ReactNode }>;
  return renderToString(createElement(Provider, { lang }, createElement(C, props)));
}

test('every workspace screen renders in French and Arabic from engine values', () => {
  const model = richModel(5);
  const r = computeStudy(model);
  const x = computeMetrics(model, r);
  const labels = r.calendar.labels;
  for (const lang of ['fr', 'ar'] as const) {
    const html = {
      dashboard: render(lang, Dashboard, { model, r, x }),
      profile: render(lang, Profile, { model, onChange: noop, disabled: false }),
      assumptions: render(lang, Assumptions, { model, onChange: noop, disabled: false, labels, issues: [] }),
      statements: render(lang, Statements, { r }),
      tax: render(lang, Tax, { r }),
      simulator: render(lang, Simulator, { model, r, x, onChange: noop, disabled: false }),
      scenarios: render(lang, Scenarios, { model, r, onChange: noop, disabled: false }),
      risks: render(lang, Risks, { model, r, x, onChange: noop, disabled: false }),
    };
    for (const [name, out] of Object.entries(html)) assert.ok(out.length > 500, `${name}/${lang} rendered too little`);
    const revenue = formatCentsMad(x.totals.revenue, lang);
    assert.ok(html.dashboard.includes(revenue), `dashboard/${lang} shows total revenue ${revenue}`);
    const firstYearIs = r.isYears[0];
    assert.ok(html.tax.includes(formatCentsMad(firstYearIs.taxDue, lang)), `tax/${lang} shows the IS due`);
    if (lang === 'ar') for (const out of Object.values(html)) assert.ok(/[\u0600-\u06FF]/.test(out));
  }
});

test('locked screens render read-only inputs', () => {
  const model = richModel(3);
  const html = render('fr', Profile, { model, onChange: noop, disabled: true });
  const inputs = html.match(/<input[^>]*>/g) ?? [];
  assert.ok(inputs.length > 5);
  assert.ok(inputs.every((i) => /disabled/.test(i)), 'every profile input is disabled when locked');
});

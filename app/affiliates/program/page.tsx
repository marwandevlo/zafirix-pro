'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  Gift,
  Globe,
  Headphones,
  Link2,
  MousePointerClick,
  Repeat,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { PublicFooter } from '@/app/components/public/PublicFooter';
import { ZafirixLogo } from '@/app/components/branding/ZafirixLogo';

/* ── Commission tier data (mirrors server config) ────────────── */

const TIERS = [
  { id: 'starter', label: 'Starter', percent: 20, min: 0, max: 2, color: 'from-slate-400 to-slate-500' },
  { id: 'bronze', label: 'Bronze', percent: 25, min: 3, max: 4, color: 'from-amber-600 to-amber-700' },
  { id: 'silver', label: 'Argent', percent: 30, min: 5, max: 9, color: 'from-gray-300 to-gray-400' },
  { id: 'gold', label: 'Or', percent: 35, min: 10, max: 19, color: 'from-yellow-400 to-amber-500' },
  { id: 'platinum', label: 'Platine', percent: 40, min: 20, max: null, color: 'from-cyan-400 to-teal-500' },
] as const;

const PLAN_RATES = [
  { plan: 'Starter', percent: 20 },
  { plan: 'Growth', percent: 25 },
  { plan: 'Pro', percent: 30 },
  { plan: 'Business', percent: 35 },
  { plan: 'Enterprise', percent: 40 },
];

/* ── FAQ data ────────────────────────────────────────────────── */

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Comment fonctionne le suivi des commissions ?",
    a: "Chaque visiteur qui clique sur votre lien reçoit un cookie de 30 jours. Dès qu'il souscrit un abonnement payant, votre commission est automatiquement créditée sur votre tableau de bord affilié.",
  },
  {
    q: "Quand et comment suis-je payé ?",
    a: "Les commissions sont créditées instantanément sur votre solde. Les versements sont effectués mensuellement par virement bancaire ou mobile money (Maroc), dès que votre solde disponible atteint 200 MAD.",
  },
  {
    q: "Les commissions sont-elles récurrentes ?",
    a: "Oui ! Vous gagnez une commission sur chaque paiement de vos filleuls, pas uniquement le premier. Tant que votre filleul reste abonné, vous percevez des revenus récurrents.",
  },
  {
    q: "Quel est le taux de commission ?",
    a: "Le taux varie de 20 % à 40 % selon votre palier de performance (nombre de filleuls actifs) et le forfait souscrit par le filleul. Le taux le plus élevé des deux est toujours appliqué.",
  },
  {
    q: "Dois-je être client ZafirixPro pour devenir affilié ?",
    a: "Oui, un compte ZafirixPro (même en essai gratuit) est nécessaire pour générer votre lien de parrainage et accéder au tableau de bord affilié. Aucune souscription payante n'est requise.",
  },
  {
    q: "Combien de temps dure le cookie de suivi ?",
    a: "Le cookie de suivi dure 30 jours. Si un visiteur revient et souscrit dans les 30 jours suivant son premier clic, la commission vous est attribuée.",
  },
  {
    q: "Puis-je promouvoir ZafirixPro sur les réseaux sociaux ?",
    a: "Absolument ! Partagez votre lien sur Facebook, Instagram, LinkedIn, WhatsApp, YouTube, TikTok, votre blog, ou tout autre canal. Plus vous partagez, plus vous gagnez.",
  },
  {
    q: "Y a-t-il une limite de gains ?",
    a: "Aucune limite. Plus vous parrainez de clients actifs, plus votre palier augmente (jusqu'à 40 %), et vos revenus récurrents grandissent proportionnellement.",
  },
];

/* ── FAQ Accordion ───────────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="text-sm sm:text-base font-semibold text-slate-800 group-hover:text-[#0F1F3D]">{q}</span>
        <ChevronDown
          size={18}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm text-slate-600 leading-relaxed -mt-1">{a}</p>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function AffiliateProgramLandingPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[#f4f6fa] overflow-x-hidden">
      {/* ── Navbar ──────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b border-white/10 bg-[#0F1F3D]/95 backdrop-blur-md"
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="shrink-0">
            <ZafirixLogo size="sm" subtitle subtitleText="ZAFIRIX GROUP" subtitleClassName="text-white/45" />
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/pricing"
              className="hidden sm:inline-flex min-h-10 px-3 items-center rounded-xl text-xs font-semibold text-white/90 hover:bg-white/10"
            >
              Tarifs
            </Link>
            <Link
              href="/affiliates"
              className="inline-flex min-h-10 px-3 items-center rounded-xl text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              Connexion affilié
            </Link>
            <Link
              href="/affiliates"
              className="inline-flex min-h-10 items-center rounded-xl bg-cyan-400 px-4 text-xs font-bold text-[#0F1F3D] hover:bg-cyan-300"
            >
              Rejoindre le programme
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(145deg, #0F1F3D 0%, #163057 50%, #0e7490 120%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 25%, rgba(34,211,238,0.28), transparent 42%), radial-gradient(circle at 85% 70%, rgba(14,116,144,0.35), transparent 40%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-cyan-300 mb-6">
            <Gift size={14} />
            Programme Partenaire
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.1] max-w-4xl mx-auto text-balance">
            {"Gagnez jusqu'à "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-teal-300">40 % de commission</span>
            {" récurrente"}
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/75 max-w-2xl mx-auto leading-relaxed">
            Recommandez ZafirixPro — la plateforme comptable n°1 au Maroc — et recevez des commissions sur chaque paiement de vos filleuls. Aucun plafond, revenus récurrents.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/affiliates"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-8 py-3.5 text-sm sm:text-base font-bold text-[#0F1F3D] shadow-lg shadow-cyan-500/20 hover:bg-cyan-300 active:scale-[0.98] transition"
            >
              Devenir affilié
              <ArrowRight size={18} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              Comment ça marche ?
            </a>
          </div>

          {/* trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-white/50">
            {[
              { icon: Shield, text: 'Suivi fiable 30 jours' },
              { icon: Repeat, text: 'Commissions récurrentes' },
              { icon: Zap, text: 'Paiements mensuels' },
              { icon: Globe, text: 'Ouvert à tous' },
            ].map((b) => (
              <span key={b.text} className="inline-flex items-center gap-1.5">
                <b.icon size={13} className="text-cyan-400/70" />
                {b.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats band ──────────────────────────────────────── */}
      <section className="bg-[#0F1F3D] border-t border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {([
            { value: '40 %', label: 'Commission max', icon: BadgePercent },
            { value: '30 j', label: 'Durée cookie', icon: Clock },
            { value: '∞', label: 'Aucun plafond', icon: DollarSign },
            { value: '5', label: 'Paliers progressifs', icon: Star },
          ] as const).map((s) => (
            <div key={s.label}>
              <s.icon size={20} className="mx-auto text-cyan-400 mb-2" />
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">{s.value}</p>
              <p className="text-[11px] font-medium text-white/50 uppercase tracking-wide mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how-it-works" className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600 mb-2">Simple et rapide</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">Comment ça marche</h2>
            <p className="mt-3 text-sm text-slate-500 max-w-lg mx-auto">
              Trois étapes pour commencer à générer des revenus récurrents avec ZafirixPro.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {([
              {
                step: '01',
                icon: Rocket,
                title: 'Créez votre compte',
                desc: "Inscrivez-vous gratuitement sur ZafirixPro. Votre lien de parrainage unique est généré automatiquement dans votre portail affilié.",
                accent: 'bg-cyan-50 text-cyan-600 border-cyan-100',
              },
              {
                step: '02',
                icon: Link2,
                title: 'Partagez votre lien',
                desc: "Diffusez votre lien sur les réseaux sociaux, WhatsApp, blog, email ou tout canal de votre choix. Chaque clic est suivi pendant 30 jours.",
                accent: 'bg-teal-50 text-teal-600 border-teal-100',
              },
              {
                step: '03',
                icon: Trophy,
                title: 'Gagnez des commissions',
                desc: "Recevez 20 à 40 % sur chaque paiement de vos filleuls — récurrent tant qu'ils restent abonnés. Plus vous parrainez, plus votre taux augmente.",
                accent: 'bg-amber-50 text-amber-600 border-amber-100',
              },
            ] as const).map((item) => (
              <div
                key={item.step}
                className="relative rounded-3xl border border-slate-100 bg-white p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="absolute -top-3 left-6 inline-flex items-center justify-center h-7 rounded-full bg-[#0F1F3D] px-3 text-[11px] font-extrabold text-cyan-300 tracking-wider">
                  ÉTAPE {item.step}
                </span>
                <div className={`inline-flex items-center justify-center h-12 w-12 rounded-2xl border mt-3 mb-4 ${item.accent}`}>
                  <item.icon size={22} />
                </div>
                <h3 className="text-base font-bold text-[#0F1F3D] mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Commission tiers ────────────────────────────────── */}
      <section className="bg-[#f4f6fa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600 mb-2">
              Commission progressive
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">
              Plus vous parrainez, plus vous gagnez
            </h2>
            <p className="mt-3 text-sm text-slate-500 max-w-lg mx-auto">
              Votre taux de commission augmente automatiquement à chaque palier atteint. Le taux le plus élevé entre votre palier et le forfait du filleul est toujours appliqué.
            </p>
          </div>

          {/* tiers grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative rounded-2xl border bg-white p-5 text-center shadow-sm transition hover:shadow-md ${
                  tier.id === 'platinum'
                    ? 'border-cyan-200 ring-2 ring-cyan-400/30'
                    : 'border-slate-100'
                }`}
              >
                {tier.id === 'platinum' && (
                  <span className="absolute -top-2.5 inset-x-0 mx-auto w-fit inline-flex items-center gap-1 rounded-full bg-cyan-500 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    <Sparkles size={10} />
                    Top Tier
                  </span>
                )}
                <div className={`mx-auto h-10 w-10 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center mb-3`}>
                  <Trophy size={18} className="text-white" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{tier.label}</p>
                <p className="text-3xl font-extrabold text-[#0F1F3D] mt-1 tabular-nums">{tier.percent}%</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {tier.max !== null ? `${tier.min}–${tier.max} filleuls` : `${tier.min}+ filleuls`}
                </p>
              </div>
            ))}
          </div>

          {/* plan-based rates */}
          <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 shadow-sm">
            <h3 className="text-xs font-bold text-[#0F1F3D] uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 size={14} className="text-cyan-500" />
              Taux selon le forfait souscrit par le filleul
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Si le forfait du filleul offre un taux supérieur à votre palier de performance, le taux le plus élevé est automatiquement appliqué.
            </p>
            <div className="flex flex-wrap gap-2">
              {PLAN_RATES.map((r) => (
                <span
                  key={r.plan}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {r.plan}
                  <strong className="text-cyan-600">{r.percent}%</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Why ZafirixPro? ─────────────────────────────────── */}
      <section className="bg-white border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600 mb-2">Avantages partenaires</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">Pourquoi rejoindre le programme ?</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {([
              { icon: Repeat, title: 'Revenus récurrents', desc: "Commission sur chaque paiement, pas seulement le premier. Revenus passifs tant que le filleul reste abonné." },
              { icon: Sparkles, title: 'Paliers progressifs', desc: "Votre taux augmente automatiquement : de 20 % Starter à 40 % Platine. Plus vous performez, plus vous gagnez." },
              { icon: MousePointerClick, title: 'Cookie 30 jours', desc: "Fenêtre de conversion de 30 jours. Un clic suffit pour attribuer la commission même si la souscription arrive plus tard." },
              { icon: BarChart3, title: 'Tableau de bord en temps réel', desc: "Suivez clics, inscriptions, activations, commissions et historique des paiements dans un portail dédié." },
              { icon: Headphones, title: 'Support dédié', desc: "Assistance prioritaire pour les partenaires affiliés. Nous vous aidons à maximiser vos conversions." },
              { icon: Shield, title: 'Aucun risque', desc: "Programme 100 % gratuit. Aucun investissement initial, aucun engagement, aucune limite de gains." },
            ] as const).map((p) => (
              <div key={p.title} className="rounded-2xl border border-slate-100 bg-[#f4f6fa] p-5 hover:border-cyan-200 transition-colors">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-100 mb-3">
                  <p.icon size={20} />
                </div>
                <h3 className="text-sm font-bold text-[#0F1F3D] mb-1">{p.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who is it for? ──────────────────────────────────── */}
      <section className="bg-[#f4f6fa]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600 mb-2">Public cible</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">Idéal pour</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { icon: Users, title: 'Comptables & Cabinets', desc: "Recommandez ZafirixPro à vos clients et gagnez une commission sur chaque abonnement." },
              { icon: Globe, title: 'Influenceurs & Créateurs', desc: "Monétisez votre audience en promouvant un outil SaaS à forte valeur ajoutée." },
              { icon: Rocket, title: 'Entrepreneurs & Freelances', desc: "Complétez vos revenus en partageant un outil que vous utilisez déjà." },
              { icon: Star, title: 'Blogueurs & Formateurs', desc: "Intégrez ZafirixPro dans vos contenus et tutoriels pour générer des commissions passives." },
            ] as const).map((a) => (
              <div key={a.title} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <a.icon size={22} className="text-cyan-500 mb-3" />
                <h3 className="text-sm font-bold text-[#0F1F3D] mb-1">{a.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-600 mb-2">Questions fréquentes</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F1F3D]">FAQ</h2>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-[#f4f6fa] px-5 sm:px-8 divide-y divide-slate-100">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{
          background: 'linear-gradient(145deg, #0F1F3D 0%, #163057 50%, #0e7490 120%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.3), transparent 50%), radial-gradient(circle at 70% 70%, rgba(14,116,144,0.35), transparent 50%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <Gift size={36} className="mx-auto text-cyan-400 mb-4" />
          <h2 className="text-2xl sm:text-3xl font-extrabold">
            {"Prêt à gagner jusqu'à 40 % de commission ?"}
          </h2>
          <p className="mt-4 text-sm sm:text-base text-white/70 max-w-xl mx-auto">
            Rejoignez des centaines de partenaires qui génèrent des revenus récurrents en recommandant ZafirixPro. Inscription gratuite, sans engagement.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/affiliates"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-8 py-3.5 text-sm sm:text-base font-bold text-[#0F1F3D] shadow-lg shadow-cyan-500/20 hover:bg-cyan-300 active:scale-[0.98] transition"
            >
              Accéder au portail affilié
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              Créer un compte gratuit
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-white/40">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-cyan-400/60" /> 100 % gratuit</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-cyan-400/60" /> Sans engagement</span>
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-cyan-400/60" /> Paiements mensuels</span>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

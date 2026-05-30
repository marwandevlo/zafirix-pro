import type { LucideIcon } from 'lucide-react';
import { Receipt, Calculator, Scale, Users, Briefcase } from 'lucide-react';
import type { AtlasAgentType } from '@/app/types/atlas-agent';
import { ATLAS_AI_SAFETY_NOTICE } from '@/app/lib/atlas-ai-safety';

export type AtlasAgentDefinition = {
  type: AtlasAgentType;
  name: string;
  role: string;
  description: string;
  icon: LucideIcon;
  color: string;
  colorLight: string;
  colorText: string;
  colorBorder: string;
  capabilities: string[];
};

export const ATLAS_AGENT_DEFINITIONS: AtlasAgentDefinition[] = [
  {
    type: 'fiscal',
    name: 'Agent Fiscal',
    role: 'TVA, IS, IR — Maroc',
    description: 'Analyse fiscale, échéances DGI et questions sur TVA, IS et IR pour votre société.',
    icon: Receipt,
    color: 'bg-blue-500',
    colorLight: 'bg-blue-50',
    colorText: 'text-blue-600',
    colorBorder: 'border-blue-200',
    capabilities: ['Échéances TVA / IS / IR', 'Calculs et bases indicatives', 'Conformité CGI Maroc'],
  },
  {
    type: 'comptable',
    name: 'Agent Comptable',
    role: 'Comptabilité & contrôle',
    description: 'Aide à la saisie, au rapprochement et à la lecture des indicateurs comptables.',
    icon: Calculator,
    color: 'bg-cyan-600',
    colorLight: 'bg-cyan-50',
    colorText: 'text-cyan-700',
    colorBorder: 'border-cyan-200',
    capabilities: ['Écritures et soldes', 'Factures et paiements', 'Lecture des KPIs'],
  },
  {
    type: 'juridique',
    name: 'Agent Juridique',
    role: 'Droit des sociétés',
    description: 'Brouillons d’actes, formalités RC et questions juridiques courantes (à valider par un professionnel).',
    icon: Scale,
    color: 'bg-indigo-500',
    colorLight: 'bg-indigo-50',
    colorText: 'text-indigo-600',
    colorBorder: 'border-indigo-200',
    capabilities: ['Statuts et PV', 'Clauses contractuelles', 'Formalités sociétés'],
  },
  {
    type: 'rh',
    name: 'Agent RH',
    role: 'Paie & contrats',
    description: 'Assistance sur contrats, attestations et calculs de paie indicatifs (CNSS, AMO, IR salarial).',
    icon: Users,
    color: 'bg-green-500',
    colorLight: 'bg-green-50',
    colorText: 'text-green-600',
    colorBorder: 'border-green-200',
    capabilities: ['Bulletins et attestations', 'CNSS / AMO / IR salarial', 'Code du travail — brouillons'],
  },
  {
    type: 'business',
    name: 'Agent Business',
    role: 'Pilotage & trésorerie',
    description: 'Synthèse d’activité, trésorerie et priorités opérationnelles pour le dirigeant.',
    icon: Briefcase,
    color: 'bg-amber-500',
    colorLight: 'bg-amber-50',
    colorText: 'text-amber-700',
    colorBorder: 'border-amber-200',
    capabilities: ['Tableaux de bord', 'Trésorerie prévisionnelle', 'Priorités du jour'],
  },
];

const SAFETY = ` ${ATLAS_AI_SAFETY_NOTICE}`;

export const ATLAS_AGENT_SYSTEM_PROMPTS: Record<AtlasAgentType, string> = {
  fiscal: `Tu es l'Agent Fiscal ZAFIRIX PRO pour les entreprises marocaines. Tu maîtrises TVA, IS, IR, échéances DGI et CGI. Réponds en français (ou darija si l'utilisateur écrit en darija), de façon concise et structurée.${SAFETY}`,
  comptable: `Tu es l'Agent Comptable ZAFIRIX PRO. Tu aides à comprendre écritures, factures, paiements et indicateurs comptables au Maroc. Réponds de façon pratique et prudente.${SAFETY}`,
  juridique: `Tu es l'Agent Juridique ZAFIRIX PRO, spécialisé droit des sociétés marocain. Tu proposes des brouillons et explications ; rappelle que tout acte doit être validé par un professionnel habilité.${SAFETY}`,
  rh: `Tu es l'Agent RH ZAFIRIX PRO. Tu aides sur paie, contrats, CNSS, AMO et IR salarial au Maroc. Les montants sont indicatifs — à valider avec un expert paie.${SAFETY}`,
  business: `Tu es l'Agent Business ZAFIRIX PRO. Tu synthétises la situation de l'entreprise, la trésorerie et les priorités opérationnelles pour un dirigeant marocain.${SAFETY}`,
};

export function isAtlasAgentType(v: string): v is AtlasAgentType {
  return (['fiscal', 'comptable', 'juridique', 'rh', 'business'] as string[]).includes(v);
}

export function agentDefinition(type: AtlasAgentType): AtlasAgentDefinition {
  const def = ATLAS_AGENT_DEFINITIONS.find((d) => d.type === type);
  if (!def) throw new Error(`Unknown agent type: ${type}`);
  return def;
}

'use client';
import { useState } from 'react';
import { fetchAi } from '../lib/fetch-ai';
import { Receipt, Users, TrendingUp, Shield, Bell, Play, Pause, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { ProductionBlockedSurface } from '@/app/components/safety/ProductionBlockedSurface';
import { isDemoFeatureBlocked } from '@/app/lib/atlas-runtime-guards';

const agents = [
  {
    id: 'tva',
    name: 'Agent TVA',
    role: 'Spécialiste TVA',
    icon: Receipt,
    color: 'bg-blue-500',
    colorLight: 'bg-blue-50',
    colorText: 'text-blue-600',
    colorBorder: 'border-blue-200',
    description: 'Analyse vos factures, calcule la TVA et prépare vos déclarations automatiquement.',
    tasks: [
      'Analyse des factures par OCR',
      'Calcul TVA collectée/déductible',
      'Génération XML DGI automatique',
      'Alerte avant échéance 20 du mois',
    ],
    stats: { done: 12, pending: 2, alerts: 1 },
    lastActivity: 'Il y a 2 heures',
    status: 'active',
  },
  {
    id: 'paie',
    name: 'Agent Paie',
    role: 'Spécialiste RH & Paie',
    icon: Users,
    color: 'bg-green-500',
    colorLight: 'bg-green-50',
    colorText: 'text-green-600',
    colorBorder: 'border-green-200',
    description: 'Calcule les salaires, gère CNSS/AMO/IR et génère les bulletins de paie chaque mois.',
    tasks: [
      'Calcul automatique CNSS/AMO/IR',
      'Génération bulletins de paie PDF',
      'Export XML CNSS mensuel',
      'Alerte virement salaires',
    ],
    stats: { done: 8, pending: 1, alerts: 0 },
    lastActivity: 'Il y a 5 heures',
    status: 'active',
  },
  {
    id: 'is',
    name: 'Agent IS',
    role: 'Spécialiste Fiscalité',
    icon: TrendingUp,
    color: 'bg-purple-500',
    colorLight: 'bg-purple-50',
    colorText: 'text-purple-600',
    colorBorder: 'border-purple-200',
    description: 'Surveille vos bénéfices, prévoit l\'IS et suggère des optimisations fiscales légales.',
    tasks: [
      'Suivi résultat fiscal en temps réel',
      'Prévision IS fin d\'exercice',
      'Calcul acomptes provisionnels',
      'Optimisation fiscale légale',
    ],
    stats: { done: 4, pending: 1, alerts: 1 },
    lastActivity: 'Il y a 1 jour',
    status: 'active',
  },
  {
    id: 'audit',
    name: 'Agent Audit',
    role: 'Contrôleur & Auditeur',
    icon: Shield,
    color: 'bg-amber-500',
    colorLight: 'bg-amber-50',
    colorText: 'text-amber-600',
    colorBorder: 'border-amber-200',
    description: 'Vérifie toutes vos opérations, détecte les erreurs et garantit la conformité légale.',
    tasks: [
      'Vérification quotidienne des écritures',
      'Détection anomalies et doublons',
      'Score de conformité /100',
      'Rapport hebdomadaire d\'audit',
    ],
    stats: { done: 45, pending: 3, alerts: 2 },
    lastActivity: 'Il y a 30 min',
    status: 'active',
  },
  {
    id: 'alert',
    name: 'Agent Alert',
    role: 'Gestionnaire des Alertes',
    icon: Bell,
    color: 'bg-red-500',
    colorLight: 'bg-red-50',
    colorText: 'text-red-600',
    colorBorder: 'border-red-200',
    description: 'Surveille tous vos délais fiscaux et vous alerte avant chaque échéance importante.',
    tasks: [
      'Calendrier fiscal automatique',
      'Alertes J-7, J-3, J-1',
      'Résumé quotidien du matin',
      'Priorités du jour',
    ],
    stats: { done: 28, pending: 4, alerts: 3 },
    lastActivity: 'Il y a 10 min',
    status: 'active',
  },
];

export default function AgentsPage() {
  if (isDemoFeatureBlocked('agents_mock')) {
    return <ProductionBlockedSurface title="Agents IA" featureId="agents_mock" />;
  }
  return <AgentsPageContent />;
}

function AgentsPageContent() {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<Record<string, boolean>>({
    tva: true, paie: true, is: true, audit: true, alert: true,
  });
  const [chat, setChat] = useState<Record<string, { role: string; content: string }[]>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleAgent = (id: string) => {
    setAgentStatus(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const sendMessage = async (agentId: string) => {
    if (!input.trim()) return;
    const agent = agents.find(a => a.id === agentId);
    const userMsg = { role: 'user', content: input };
    setChat(prev => ({ ...prev, [agentId]: [...(prev[agentId] || []), userMsg] }));
    setInput('');
    setLoading(true);

    try {
      const response = await fetchAi({
        message: input,
        type: 'consultant',
        systemPrompt: `Tu es ${agent?.name}, un agent IA spécialisé en ${agent?.role} pour les entreprises marocaines. Tu réponds de manière concise et professionnelle en français ou darija selon la question.`,
      });
      const data = await response.json().catch(() => ({}));
      setChat(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), {
          role: 'assistant',
          content: response.ok && typeof data.response === 'string'
            ? data.response
            : (typeof data.error === 'string' ? data.error : 'Erreur de connexion ou session expirée.'),
        }],
      }));
    } catch {
      setChat(prev => ({
        ...prev,
        [agentId]: [...(prev[agentId] || []), { role: 'assistant', content: 'Erreur de connexion.' }]
      }));
    }
    setLoading(false);
  };

  const selected = agents.find(a => a.id === activeAgent);

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar
        variant="module"
        footer={
          <div className="px-4 py-4 border-t border-white/10">
            <p className="text-white/30 text-xs mb-2">Agents actifs</p>
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1.5">
                <div className={`w-2 h-2 rounded-full ${agentStatus[a.id] ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="text-white/50 text-xs flex-1">{a.name}</span>
                {a.stats.alerts > 0 && (
                  <span className="w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">{a.stats.alerts}</span>
                )}
              </div>
            ))}
          </div>
        }
      />

      <main className="flex-1 flex overflow-hidden">
        {/* Agents List */}
        <div className={`${activeAgent ? 'hidden lg:flex' : 'flex'} flex-col flex-1 overflow-hidden`}>
          <header className="bg-white border-b border-gray-200 px-8 py-4">
            <h1 className="text-xl font-bold text-gray-800">Agents IA — Equipe Virtuelle</h1>
            <p className="text-xs text-gray-400 mt-0.5">Votre équipe de comptables et fiscalistes virtuels 24/7</p>
          </header>

          <div className="shrink-0 px-8 pt-3">
            <BetaSurfaceBadge label="Bêta · Agents & démonstrations" />
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {/* Global Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400">Tâches complétées</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{agents.reduce((s, a) => s + a.stats.done, 0)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400">En cours</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{agents.reduce((s, a) => s + a.stats.pending, 0)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400">Alertes actives</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{agents.reduce((s, a) => s + a.stats.alerts, 0)}</p>
              </div>
            </div>

            {/* Agents Cards */}
            {agents.map(agent => (
              <div key={agent.id} className={`bg-white rounded-xl shadow-sm border ${agentStatus[agent.id] ? agent.colorBorder : 'border-gray-100'} overflow-hidden transition-all`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 ${agent.color} rounded-xl flex items-center justify-center shrink-0`}>
                      <agent.icon size={24} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-bold text-gray-800">{agent.name}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agentStatus[agent.id] ? agent.colorLight + ' ' + agent.colorText : 'bg-gray-100 text-gray-400'}`}>
                          {agentStatus[agent.id] ? '● Actif' : '○ Inactif'}
                        </span>
                        {agent.stats.alerts > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                            {agent.stats.alerts} alerte(s)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{agent.role}</p>
                      <p className="text-sm text-gray-600 mt-2">{agent.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {agent.tasks.map((task, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                        <CheckCircle size={12} className="text-green-500 shrink-0" />
                        {task}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><CheckCircle size={12} className="text-green-500" /> {agent.stats.done} faites</span>
                      <span className="flex items-center gap-1"><Clock size={12} className="text-amber-500" /> {agent.stats.pending} en cours</span>
                      <span>{agent.lastActivity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveAgent(agent.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${agent.colorLight} ${agent.colorText} hover:opacity-80 transition-opacity`}
                      >
                        <MessageSquare size={12} /> Discuter
                      </button>
                      <button
                        onClick={() => toggleAgent(agent.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${agentStatus[agent.id] ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                      >
                        {agentStatus[agent.id] ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Activer</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Chat */}
        {activeAgent && selected && (
          <div className="flex flex-col flex-1 lg:max-w-md border-l border-gray-200 bg-white">
            <div className={`${selected.color} px-4 py-3 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <selected.icon size={20} className="text-white" />
                <div>
                  <p className="font-bold text-white text-sm">{selected.name}</p>
                  <p className="text-white/70 text-xs">{selected.role}</p>
                </div>
              </div>
              <button onClick={() => setActiveAgent(null)} className="text-white/70 hover:text-white text-xs">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!(chat[activeAgent]?.length) && (
                <div className={`${selected.colorLight} rounded-xl p-4 text-sm ${selected.colorText}`}>
                  Bonjour! Je suis {selected.name}. Comment puis-je vous aider aujourd&apos;hui?
                </div>
              )}
              {(chat[activeAgent] || []).map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-3 py-2 rounded-xl text-sm ${m.role === 'user' ? 'bg-[#1B2A4A] text-white' : selected.colorLight + ' ' + selected.colorText}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-1 p-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:'0.1s'}}></div>
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage(activeAgent)}
                  placeholder={`Parlez à ${selected.name}...`}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <button onClick={() => sendMessage(activeAgent)} disabled={loading} className={`px-3 py-2 ${selected.color} text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50`}>
                  →
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
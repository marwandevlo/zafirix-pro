'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Archive,
  FileText,
  Gavel,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { AppSidebar } from '@/app/components/shell/AppSidebar';
import { BetaSurfaceBadge } from '@/app/components/safety/BetaSurfaceBadge';
import { getActiveCompanyDbRowId } from '@/app/lib/atlas-active-company';
import { onCompanySwitched } from '@/app/lib/atlas-company-switch-event';
import {
  fetchEnterpriseModule,
  ModuleLoadErrorBanner,
  ModuleNoCompanyState,
} from '@/app/lib/use-enterprise-module-fetch';
import type {
  AtlasBoardMeeting,
  AtlasBoardMember,
  AtlasGovernanceDocument,
  AtlasShareholderResolution,
  AssemblyType,
  BoardAccessLevel,
  BoardRole,
  GovernanceAccessContext,
  GovernanceAccessLogEntry,
  GovernanceAccessTier,
  GovernanceArchiveSummary,
  GovernanceArchiveTab,
  GovernanceDocumentType,
  MeetingType,
} from '@/app/types/atlas-corporate-governance';
import {
  ACCESS_TIER_LABELS,
  ASSEMBLY_TYPE_LABELS,
  BOARD_ACCESS_LABELS,
  BOARD_ROLE_LABELS,
  GOVERNANCE_DOC_TYPE_LABELS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  RESOLUTION_STATUS_LABELS,
} from '@/app/types/atlas-corporate-governance';

const TIER_COLORS: Record<GovernanceAccessTier, string> = {
  public_internal: 'bg-blue-100 text-blue-800',
  executive: 'bg-amber-100 text-amber-800',
  board_confidential: 'bg-red-100 text-red-800',
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function AccessBadge({ access }: { access: GovernanceAccessContext | null }) {
  if (!access) return null;
  const label = access.isOwner
    ? 'Propriétaire — accès complet'
    : access.isBoardMember
      ? `${BOARD_ROLE_LABELS[access.boardRole!]} — ${BOARD_ACCESS_LABELS[access.accessLevel!]}`
      : `Direction — ${ACCESS_TIER_LABELS[access.maxTier]}`;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
      <Lock size={12} /> {label}
    </span>
  );
}

export default function GouvernancePage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tab, setTab] = useState<GovernanceArchiveTab>('all');
  const [access, setAccess] = useState<GovernanceAccessContext | null>(null);
  const [boardMembers, setBoardMembers] = useState<AtlasBoardMember[]>([]);
  const [meetings, setMeetings] = useState<AtlasBoardMeeting[]>([]);
  const [resolutions, setResolutions] = useState<AtlasShareholderResolution[]>([]);
  const [documents, setDocuments] = useState<AtlasGovernanceDocument[]>([]);
  const [accessLog, setAccessLog] = useState<GovernanceAccessLogEntry[]>([]);
  const [summary, setSummary] = useState<GovernanceArchiveSummary>({
    totalMeetings: 0, totalResolutions: 0, totalDocuments: 0, boardMembers: 0,
    draftMeetings: 0, confidentialItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<GovernanceAccessTier | 'all'>('all');
  const [showForm, setShowForm] = useState<'meeting' | 'resolution' | 'document' | 'board' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [meetingForm, setMeetingForm] = useState({
    title: '', meetingDate: new Date().toISOString().slice(0, 10),
    meetingType: 'ordinary' as MeetingType, accessTier: 'board_confidential' as GovernanceAccessTier,
    location: '', agenda: '', minutesBody: '', fileUrl: '',
  });
  const [resolutionForm, setResolutionForm] = useState({
    title: '', resolutionDate: new Date().toISOString().slice(0, 10),
    assemblyType: 'ago' as AssemblyType, resolutionText: '', accessTier: 'executive' as GovernanceAccessTier,
    votesFor: '', fileUrl: '',
  });
  const [documentForm, setDocumentForm] = useState({
    title: '', documentType: 'policy' as GovernanceDocumentType,
    accessTier: 'executive' as GovernanceAccessTier, description: '', versionLabel: '', fileUrl: '',
  });
  const [boardForm, setBoardForm] = useState({
    fullName: '', email: '', boardRole: 'member' as BoardRole,
    accessLevel: 'read_only' as BoardAccessLevel, memberUserId: '',
  });

  const load = useCallback(async (cid: string, currentTab: GovernanceArchiveTab, q: string, tier: GovernanceAccessTier | 'all') => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ companyId: cid });
    if (currentTab !== 'board' && currentTab !== 'access_log') {
      params.set('tab', currentTab === 'all' ? 'all' : currentTab);
    }
    if (q) params.set('q', q);
    if (tier !== 'all') params.set('tier', tier);

    const result = await fetchEnterpriseModule<{
      access?: GovernanceAccessContext;
      boardMembers?: AtlasBoardMember[];
      meetings?: AtlasBoardMeeting[];
      resolutions?: AtlasShareholderResolution[];
      documents?: AtlasGovernanceDocument[];
      accessLog?: GovernanceAccessLogEntry[];
      summary?: GovernanceArchiveSummary;
    }>(`/api/governance?${params.toString()}`);

    if (!result.ok) {
      setLoadError(result.error);
      setMeetings([]);
    } else {
      setAccess(result.data.access ?? null);
      setBoardMembers(result.data.boardMembers ?? []);
      setMeetings(result.data.meetings ?? []);
      setResolutions(result.data.resolutions ?? []);
      setDocuments(result.data.documents ?? []);
      setAccessLog(result.data.accessLog ?? []);
      setSummary(result.data.summary ?? {
        totalMeetings: 0, totalResolutions: 0, totalDocuments: 0, boardMembers: 0,
        draftMeetings: 0, confidentialItems: 0,
      });
      if (result.warning) setLoadError(result.warning);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const cid = await getActiveCompanyDbRowId();
      setCompanyId(cid);
      if (cid) await load(cid, tab, search, tierFilter);
    })();
  }, [load, tab, search, tierFilter]);

  useEffect(() => {
    return onCompanySwitched(() => {
      void (async () => {
        const cid = await getActiveCompanyDbRowId();
        setCompanyId(cid);
        if (cid) await load(cid, tab, search, tierFilter);
      })();
    });
  }, [load, tab, search, tierFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const post = async (body: Record<string, unknown>) => {
    if (!companyId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyId, ...body }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? data.message ?? 'action_failed');
      setShowForm(null);
      await load(companyId, tab, search, tierFilter);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  };

  const canWrite = access?.canWrite ?? false;
  const canManageBoard = access?.canManageBoard ?? false;

  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar variant="module" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Scale className="h-5 w-5 text-indigo-600" />
                <h1 className="text-xl font-bold text-gray-800">Gouvernance &amp; archives du CA</h1>
                <BetaSurfaceBadge />
                <AccessBadge access={access} />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                PV conseil, résolutions associés, documents de gouvernance — accès restreint aux membres autorisés.
              </p>
            </div>
            <div className="flex gap-2">
              {canWrite && (
                <div className="relative group">
                  <button type="button" className="inline-flex items-center gap-1 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                    <Plus size={14} /> Ajouter
                  </button>
                  <div className="hidden group-hover:block absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg z-10 py-1">
                    <button type="button" onClick={() => setShowForm('meeting')} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">PV réunion CA</button>
                    <button type="button" onClick={() => setShowForm('resolution')} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Résolution associés</button>
                    <button type="button" onClick={() => setShowForm('document')} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Document gouvernance</button>
                    {canManageBoard && (
                      <button type="button" onClick={() => setShowForm('board')} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Membre du CA</button>
                    )}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => companyId && void load(companyId, tab, search, tierFilter)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>
          </div>

          {!companyId && <ModuleNoCompanyState moduleLabel="la gouvernance" />}
          {loadError && <ModuleLoadErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 className="animate-spin" size={20} /> Chargement archive…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Gavel className="h-3 w-3" /> PV CA</p>
                  <p className="text-2xl font-semibold">{summary.totalMeetings}</p>
                  {summary.draftMeetings > 0 && <p className="text-xs text-amber-600">{summary.draftMeetings} brouillon(s)</p>}
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">Résolutions</p>
                  <p className="text-2xl font-semibold">{summary.totalResolutions}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><FileText className="h-3 w-3" /> Documents</p>
                  <p className="text-2xl font-semibold">{summary.totalDocuments}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Shield className="h-3 w-3 text-red-500" /> Confidentiel CA</p>
                  <p className="text-2xl font-semibold text-red-600">{summary.confidentialItems}</p>
                  <p className="text-xs text-gray-400">{summary.boardMembers} membre(s) CA</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="search"
                    placeholder="Rechercher PV, résolutions, documents…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg"
                  />
                  {searchInput && (
                    <button type="button" onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <select
                  className="border border-gray-200 rounded-lg px-3 py-2 text-xs"
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value as GovernanceAccessTier | 'all')}
                >
                  <option value="all">Tous niveaux</option>
                  {Object.entries(ACCESS_TIER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>Tout</TabBtn>
                <TabBtn active={tab === 'meetings'} onClick={() => setTab('meetings')}>PV CA</TabBtn>
                <TabBtn active={tab === 'resolutions'} onClick={() => setTab('resolutions')}>Résolutions</TabBtn>
                <TabBtn active={tab === 'documents'} onClick={() => setTab('documents')}>Documents</TabBtn>
                <TabBtn active={tab === 'board'} onClick={() => setTab('board')}>Membres CA</TabBtn>
                <TabBtn active={tab === 'access_log'} onClick={() => setTab('access_log')}>Journal accès</TabBtn>
              </div>

              {showForm === 'meeting' && (
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Nouveau PV de réunion du conseil</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Titre *" className="border rounded-lg px-3 py-2 text-sm" value={meetingForm.title}
                      onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} />
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={meetingForm.meetingDate}
                      onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })} />
                    <select className="border rounded-lg px-3 py-2 text-sm" value={meetingForm.meetingType}
                      onChange={(e) => setMeetingForm({ ...meetingForm, meetingType: e.target.value as MeetingType })}>
                      {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="border rounded-lg px-3 py-2 text-sm" value={meetingForm.accessTier}
                      onChange={(e) => setMeetingForm({ ...meetingForm, accessTier: e.target.value as GovernanceAccessTier })}>
                      {Object.entries(ACCESS_TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <textarea placeholder="Ordre du jour" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={meetingForm.agenda} onChange={(e) => setMeetingForm({ ...meetingForm, agenda: e.target.value })} />
                  <textarea placeholder="Compte-rendu / PV" rows={4} className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={meetingForm.minutesBody} onChange={(e) => setMeetingForm({ ...meetingForm, minutesBody: e.target.value })} />
                  <input placeholder="URL document signé" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={meetingForm.fileUrl} onChange={(e) => setMeetingForm({ ...meetingForm, fileUrl: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" disabled={submitting || !meetingForm.title.trim()}
                      onClick={() => void post({ action: 'create_meeting', ...meetingForm, fileUrl: meetingForm.fileUrl || undefined })}
                      className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg disabled:opacity-50">Enregistrer</button>
                    <button type="button" onClick={() => setShowForm(null)} className="px-4 py-2 text-sm border rounded-lg">Annuler</button>
                  </div>
                </div>
              )}

              {showForm === 'resolution' && (
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Nouvelle résolution d&apos;assemblée</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Titre *" className="border rounded-lg px-3 py-2 text-sm" value={resolutionForm.title}
                      onChange={(e) => setResolutionForm({ ...resolutionForm, title: e.target.value })} />
                    <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={resolutionForm.resolutionDate}
                      onChange={(e) => setResolutionForm({ ...resolutionForm, resolutionDate: e.target.value })} />
                    <select className="border rounded-lg px-3 py-2 text-sm" value={resolutionForm.assemblyType}
                      onChange={(e) => setResolutionForm({ ...resolutionForm, assemblyType: e.target.value as AssemblyType })}>
                      {Object.entries(ASSEMBLY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="border rounded-lg px-3 py-2 text-sm" value={resolutionForm.accessTier}
                      onChange={(e) => setResolutionForm({ ...resolutionForm, accessTier: e.target.value as GovernanceAccessTier })}>
                      {Object.entries(ACCESS_TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <textarea placeholder="Texte de la résolution *" rows={4} className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={resolutionForm.resolutionText} onChange={(e) => setResolutionForm({ ...resolutionForm, resolutionText: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" disabled={submitting || !resolutionForm.title.trim() || !resolutionForm.resolutionText.trim()}
                      onClick={() => void post({ action: 'create_resolution', ...resolutionForm, votesFor: resolutionForm.votesFor ? Number(resolutionForm.votesFor) : undefined, fileUrl: resolutionForm.fileUrl || undefined })}
                      className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg disabled:opacity-50">Enregistrer</button>
                    <button type="button" onClick={() => setShowForm(null)} className="px-4 py-2 text-sm border rounded-lg">Annuler</button>
                  </div>
                </div>
              )}

              {showForm === 'document' && (
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Document de gouvernance</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Titre *" className="border rounded-lg px-3 py-2 text-sm" value={documentForm.title}
                      onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })} />
                    <select className="border rounded-lg px-3 py-2 text-sm" value={documentForm.documentType}
                      onChange={(e) => setDocumentForm({ ...documentForm, documentType: e.target.value as GovernanceDocumentType })}>
                      {Object.entries(GOVERNANCE_DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="border rounded-lg px-3 py-2 text-sm" value={documentForm.accessTier}
                      onChange={(e) => setDocumentForm({ ...documentForm, accessTier: e.target.value as GovernanceAccessTier })}>
                      {Object.entries(ACCESS_TIER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input placeholder="Version (ex. v2.1)" className="border rounded-lg px-3 py-2 text-sm" value={documentForm.versionLabel}
                      onChange={(e) => setDocumentForm({ ...documentForm, versionLabel: e.target.value })} />
                  </div>
                  <input placeholder="URL du fichier" className="w-full border rounded-lg px-3 py-2 text-sm" value={documentForm.fileUrl}
                    onChange={(e) => setDocumentForm({ ...documentForm, fileUrl: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" disabled={submitting || !documentForm.title.trim()}
                      onClick={() => void post({ action: 'create_document', ...documentForm, fileUrl: documentForm.fileUrl || undefined })}
                      className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg disabled:opacity-50">Enregistrer</button>
                    <button type="button" onClick={() => setShowForm(null)} className="px-4 py-2 text-sm border rounded-lg">Annuler</button>
                  </div>
                </div>
              )}

              {showForm === 'board' && canManageBoard && (
                <div className="bg-white rounded-xl border p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4" /> Membre du conseil d&apos;administration</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <input placeholder="Nom complet *" className="border rounded-lg px-3 py-2 text-sm" value={boardForm.fullName}
                      onChange={(e) => setBoardForm({ ...boardForm, fullName: e.target.value })} />
                    <input placeholder="Email" className="border rounded-lg px-3 py-2 text-sm" value={boardForm.email}
                      onChange={(e) => setBoardForm({ ...boardForm, email: e.target.value })} />
                    <select className="border rounded-lg px-3 py-2 text-sm" value={boardForm.boardRole}
                      onChange={(e) => setBoardForm({ ...boardForm, boardRole: e.target.value as BoardRole })}>
                      {Object.entries(BOARD_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="border rounded-lg px-3 py-2 text-sm" value={boardForm.accessLevel}
                      onChange={(e) => setBoardForm({ ...boardForm, accessLevel: e.target.value as BoardAccessLevel })}>
                      {Object.entries(BOARD_ACCESS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input placeholder="ID utilisateur Atlas (optionnel)" className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
                      value={boardForm.memberUserId} onChange={(e) => setBoardForm({ ...boardForm, memberUserId: e.target.value })} />
                  </div>
                  <p className="text-xs text-gray-500">Liez l&apos;ID utilisateur Atlas pour activer l&apos;accès sécurisé au portail.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={submitting || !boardForm.fullName.trim()}
                      onClick={() => void post({ action: 'create_board_member', ...boardForm, email: boardForm.email || undefined, memberUserId: boardForm.memberUserId || undefined })}
                      className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg disabled:opacity-50">Ajouter membre</button>
                    <button type="button" onClick={() => setShowForm(null)} className="px-4 py-2 text-sm border rounded-lg">Annuler</button>
                  </div>
                </div>
              )}

              {(tab === 'all' || tab === 'meetings') && (
                <section className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-sm font-semibold">Procès-verbaux du conseil</h2>
                  </div>
                  {meetings.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun PV enregistré.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Réf.</th>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Titre</th>
                          <th className="px-4 py-2">Accès</th>
                          <th className="px-4 py-2">Statut</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {meetings.map((m) => (
                          <FragmentRow key={m.id} id={m.id} expandedId={expandedId} setExpandedId={setExpandedId}
                            detail={m.minutesBody ?? m.agenda ?? '—'}>
                            <td className="px-4 py-2 font-mono text-xs">{m.referenceNumber}</td>
                            <td className="px-4 py-2 text-xs">{m.meetingDate}</td>
                            <td className="px-4 py-2 font-medium">
                              {m.fileUrl ? <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{m.title}</a> : m.title}
                            </td>
                            <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${TIER_COLORS[m.accessTier]}`}>{ACCESS_TIER_LABELS[m.accessTier]}</span></td>
                            <td className="px-4 py-2 text-xs">{MEETING_STATUS_LABELS[m.status]}</td>
                            <td className="px-4 py-2">
                              {canWrite && m.status !== 'archived' && (
                                <button type="button" onClick={() => void post({ action: 'archive', entityType: 'meeting', entityId: m.id })}
                                  className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1"><Archive size={12} /> Archiver</button>
                              )}
                            </td>
                          </FragmentRow>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {(tab === 'all' || tab === 'resolutions') && (
                <section className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-semibold">Résolutions associés (AGO/AGE)</h2></div>
                  {resolutions.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">Aucune résolution.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Réf.</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2 text-left">Titre</th>
                          <th className="px-4 py-2">Accès</th>
                          <th className="px-4 py-2">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {resolutions.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs">{r.referenceNumber}</td>
                            <td className="px-4 py-2 text-xs">{ASSEMBLY_TYPE_LABELS[r.assemblyType]}</td>
                            <td className="px-4 py-2">
                              <span className="font-medium">{r.title}</span>
                              <span className="block text-xs text-gray-400 truncate max-w-md">{r.resolutionText}</span>
                            </td>
                            <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${TIER_COLORS[r.accessTier]}`}>{ACCESS_TIER_LABELS[r.accessTier]}</span></td>
                            <td className="px-4 py-2 text-xs">{RESOLUTION_STATUS_LABELS[r.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {(tab === 'all' || tab === 'documents') && (
                <section className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-semibold">Documents de gouvernance</h2></div>
                  {documents.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun document.</p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Titre</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2">Version</th>
                          <th className="px-4 py-2">Accès</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {documents.map((d) => (
                          <tr key={d.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              {d.fileUrl ? <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-medium">{d.title}</a> : d.title}
                            </td>
                            <td className="px-4 py-2 text-xs">{GOVERNANCE_DOC_TYPE_LABELS[d.documentType]}</td>
                            <td className="px-4 py-2 text-xs">{d.versionLabel ?? '—'}</td>
                            <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${TIER_COLORS[d.accessTier]}`}>{ACCESS_TIER_LABELS[d.accessTier]}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {tab === 'board' && (
                <section className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-1"><Users className="h-4 w-4" /> Membres du conseil &amp; droits d&apos;accès</h2>
                    {canManageBoard && (
                      <button type="button" onClick={() => setShowForm('board')} className="text-xs text-indigo-600 hover:underline">+ Ajouter</button>
                    )}
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Nom</th>
                        <th className="px-4 py-2">Rôle</th>
                        <th className="px-4 py-2">Accès</th>
                        <th className="px-4 py-2">Statut</th>
                        {canManageBoard && <th className="px-4 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {boardMembers.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucun membre enregistré.</td></tr>
                      ) : boardMembers.map((m) => (
                        <tr key={m.id}>
                          <td className="px-4 py-2">
                            <span className="font-medium">{m.fullName}</span>
                            {m.email && <span className="block text-xs text-gray-400">{m.email}</span>}
                          </td>
                          <td className="px-4 py-2 text-xs">{BOARD_ROLE_LABELS[m.boardRole]}</td>
                          <td className="px-4 py-2 text-xs">{BOARD_ACCESS_LABELS[m.accessLevel]}</td>
                          <td className="px-4 py-2 text-xs capitalize">{m.status}</td>
                          {canManageBoard && (
                            <td className="px-4 py-2">
                              {m.accessLevel !== 'full' && (
                                <button type="button" onClick={() => void post({ action: 'update_board_member', memberId: m.id, accessLevel: 'full' })}
                                  className="text-xs text-indigo-600 hover:underline mr-2">Accès complet</button>
                              )}
                              {m.status === 'active' && (
                                <button type="button" onClick={() => void post({ action: 'update_board_member', memberId: m.id, status: 'inactive' })}
                                  className="text-xs text-red-600 hover:underline">Révoquer</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {tab === 'access_log' && (
                <section className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-semibold">Journal d&apos;accès sécurisé</h2></div>
                  <table className="min-w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2">Action</th>
                        <th className="px-4 py-2 text-left">Entité</th>
                        <th className="px-4 py-2 text-left">Titre</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {accessLog.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucune entrée.</td></tr>
                      ) : accessLog.map((log) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 text-xs font-mono">{new Date(log.createdAt).toLocaleString('fr-MA')}</td>
                          <td className="px-4 py-2 text-xs">{log.action}</td>
                          <td className="px-4 py-2 text-xs">{log.entityType}</td>
                          <td className="px-4 py-2 text-xs">{log.entityTitle ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function FragmentRow({
  id, expandedId, setExpandedId, detail, children,
}: {
  id: string;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  detail: string;
  children: ReactNode;
}) {
  const open = expandedId === id;
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(open ? null : id)}>
        {children}
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50 text-xs text-gray-600 whitespace-pre-wrap">{detail}</td>
        </tr>
      )}
    </>
  );
}

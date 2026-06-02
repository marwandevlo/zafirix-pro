'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  HardDrive, Cloud, CheckCircle, AlertTriangle, Loader2, ExternalLink,
  RefreshCw, Trash2, CloudOff, Download, FileText, History, Info,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type DriveStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  lastRefreshed: string | null;
};

type Backup = {
  id: string;
  entity_type: string;
  entity_id: string;
  provider: string;
  file_format: string;
  filename: string;
  file_size_bytes: number | null;
  provider_url: string | null;
  sync_status: string;
  error_message: string | null;
  last_synced_at: string | null;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-MA', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  syncing:   'bg-blue-100 text-blue-700',
  failed:    'bg-red-100 text-red-700',
  pending:   'bg-gray-100 text-gray-600',
};

const FORMAT_COLORS: Record<string, string> = {
  pdf:  'bg-red-100 text-red-700',
  xlsx: 'bg-green-100 text-green-700',
  json: 'bg-purple-100 text-purple-700',
  csv:  'bg-blue-100 text-blue-700',
  xml:  'bg-amber-100 text-amber-700',
  zip:  'bg-gray-100 text-gray-700',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function GoogleDriveCard({ status, onConnect, onDisconnect }: {
  status: DriveStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!confirm('Déconnecter Google Drive ? Les sauvegardes existantes resteront sur Drive.')) return;
    setDisconnecting(true);
    await fetch('/api/integrations/google-drive/disconnect', { method: 'DELETE', credentials: 'include' });
    setDisconnecting(false);
    onDisconnect();
  };

  if (!status) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-4">
        <Loader2 size={20} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Chargement…</span>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
        <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Google Drive non configuré</p>
          <p className="text-xs text-amber-700 mt-1">
            Ajoutez <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code>,{' '}
            <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> et{' '}
            <code className="bg-amber-100 px-1 rounded">GOOGLE_REDIRECT_URI</code> dans vos variables d&apos;environnement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-5 ${status.connected ? 'bg-white border-green-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status.connected ? 'bg-green-100' : 'bg-gray-100'}`}>
            {status.connected ? <Cloud size={20} className="text-green-600" /> : <CloudOff size={20} className="text-gray-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Google Drive</p>
            {status.connected ? (
              <p className="text-xs text-gray-500">{status.email} · Connecté {fmtDate(status.connectedAt)}</p>
            ) : (
              <p className="text-xs text-gray-400">Non connecté</p>
            )}
          </div>
        </div>

        {status.connected ? (
          <button
            onClick={() => void handleDisconnect()}
            disabled={disconnecting}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Déconnecter
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Cloud size={14} />
            Connecter Google Drive
          </button>
        )}
      </div>

      {status.connected && (
        <div className="mt-4 p-3 bg-green-50 rounded-xl text-xs text-green-700 flex items-center gap-2">
          <CheckCircle size={12} />
          Structure de dossiers créée automatiquement : <span className="font-mono">Zafirix Pro / Entreprise / Documents IA / …</span>
        </div>
      )}
    </div>
  );
}

function BackupTable({ backups, loading }: { backups: Backup[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Chargement de l&apos;historique…</span>
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="text-center py-12">
        <History size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Aucune sauvegarde enregistrée.</p>
        <p className="text-xs text-gray-400 mt-1">Sauvegardez un document depuis Documents IA.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fichier</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Format</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taille</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
          </tr>
        </thead>
        <tbody>
          {backups.map(b => (
            <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <td className="py-3 px-4 text-xs text-gray-500">{fmtDate(b.created_at)}</td>
              <td className="py-3 px-4">
                <span className="text-xs text-gray-700 font-medium truncate max-w-[200px] block" title={b.filename}>
                  {b.filename}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${FORMAT_COLORS[b.file_format] ?? 'bg-gray-100 text-gray-600'}`}>
                  {b.file_format}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${b.provider === 'google_drive' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {b.provider === 'google_drive' ? '☁ Google Drive' : '💻 Local'}
                </span>
              </td>
              <td className="py-3 px-4 text-xs text-gray-500">{formatBytes(b.file_size_bytes)}</td>
              <td className="py-3 px-4">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[b.sync_status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {b.sync_status === 'completed' ? '✓ Terminé' :
                   b.sync_status === 'syncing' ? '↻ En cours…' :
                   b.sync_status === 'failed' ? '✕ Échec' : 'En attente'}
                </span>
                {b.error_message && (
                  <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[120px]" title={b.error_message}>
                    {b.error_message}
                  </p>
                )}
              </td>
              <td className="py-3 px-4">
                {b.provider_url ? (
                  <a
                    href={b.provider_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink size={11} />
                    Ouvrir
                  </a>
                ) : b.provider === 'local_export' ? (
                  <a
                    href={`/api/documents/${b.entity_id}/export?format=${b.file_format}`}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
                    download
                  >
                    <Download size={11} />
                    Télécharger
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BackupCenterPage() {
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/integrations/google-drive/status', { credentials: 'include' });
    if (res.ok) setDriveStatus(await res.json() as DriveStatus);
  }, []);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/backups?limit=50', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as { backups: Backup[] };
      setBackups(data.backups);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadBackups();

    // Check URL params for post-OAuth feedback
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'google_drive') {
      void loadStatus();
      window.history.replaceState({}, '', '/backup');
    }
  }, [loadStatus, loadBackups]);

  const handleConnect = () => {
    window.location.href = '/api/integrations/google-drive/connect';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Centre de sauvegarde</h1>
          <p className="text-sm text-gray-500 mt-1">Gérez vos sauvegardes cloud et consultez l&apos;historique.</p>
        </div>
        <button
          onClick={() => { void loadBackups(); }}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={12} />
          Actualiser
        </button>
      </div>

      {/* Destinations */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Destinations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GoogleDriveCard
            status={driveStatus}
            onConnect={handleConnect}
            onDisconnect={() => { void loadStatus(); }}
          />

          {/* OneDrive placeholder */}
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-5 flex items-center gap-3 opacity-60">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Cloud size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">OneDrive</p>
              <p className="text-xs text-gray-400">Bientôt disponible</p>
            </div>
          </div>

          {/* Dropbox placeholder */}
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-5 flex items-center gap-3 opacity-60">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
              <HardDrive size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Dropbox</p>
              <p className="text-xs text-gray-400">Bientôt disponible</p>
            </div>
          </div>
        </div>
      </section>

      {/* Setup instructions (only when Drive not configured) */}
      {driveStatus && !driveStatus.configured && (
        <section className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-semibold">Configuration requise — Google Cloud Console</p>
              <ol className="list-decimal list-inside text-xs text-blue-700 space-y-0.5 mt-2">
                <li>Créez un projet sur <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">console.cloud.google.com</a></li>
                <li>Activez l&apos;API Google Drive</li>
                <li>Créez des identifiants OAuth2 (type : application web)</li>
                <li>Ajoutez l&apos;URI de redirection : <code className="bg-blue-100 px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/google-drive/callback</code></li>
                <li>Copiez le Client ID et Client Secret dans vos variables d&apos;environnement</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* Backup history */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Historique des sauvegardes
          </h2>
          <span className="text-xs text-gray-400">{backups.length} entrée{backups.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <BackupTable backups={backups} loading={loading} />
        </div>
      </section>

      {/* Supported formats info */}
      <section className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">Formats supportés</p>
        <div className="flex flex-wrap gap-2">
          {['PDF','Excel XLSX','JSON','CSV','XML','ZIP'].map(f => (
            <span key={f} className="flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg">
              <FileText size={10} className="text-gray-400" />
              {f}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Chaque sauvegarde inclut : document original, extraction OCR, classification, corrections, statut de validation.
        </p>
      </section>
    </div>
  );
}

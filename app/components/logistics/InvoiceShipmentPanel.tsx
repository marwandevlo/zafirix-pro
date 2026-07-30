'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Truck, X } from 'lucide-react';
import type { AtlasDelivery, AtlasDeliveryPartner } from '@/app/types/atlas-enterprise-modules';
import { deliveryStatusLabel } from '@/app/lib/atlas-logistics';
import { ShipmentStatusBadge } from '@/app/components/logistics/ShipmentStatusBadge';

export type InvoiceShipmentTarget = {
  id: string;
  number: string;
  clientName: string;
  totalTTC: number;
  reste?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  invoice: InvoiceShipmentTarget;
  existingDelivery?: AtlasDelivery | null;
  onSaved: () => void;
};

export function InvoiceShipmentPanel({
  open,
  onClose,
  companyId,
  invoice,
  existingDelivery,
  onSaved,
}: Props) {
  const [partners, setPartners] = useState<AtlasDeliveryPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    partnerId: '',
    waybillNumber: '',
    trackingId: '',
    codAmount: '',
    recipientName: '',
    recipientPhone: '',
    notes: '',
  });

  const loadPartners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logistics/partners?companyId=${encodeURIComponent(companyId)}`, {
        credentials: 'include',
      });
      const data = (await res.json()) as { partners?: AtlasDeliveryPartner[] };
      setPartners(data.partners ?? []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (existingDelivery) {
      setForm({
        partnerId: existingDelivery.partnerId ?? '',
        waybillNumber: existingDelivery.waybillNumber,
        trackingId: existingDelivery.trackingId ?? '',
        codAmount: String(existingDelivery.codAmount || invoice.totalTTC),
        recipientName: existingDelivery.recipientName ?? invoice.clientName,
        recipientPhone: existingDelivery.recipientPhone ?? '',
        notes: existingDelivery.notes ?? '',
      });
    } else {
      setForm({
        partnerId: '',
        waybillNumber: '',
        trackingId: '',
        codAmount: String(Math.round(invoice.reste ?? invoice.totalTTC)),
        recipientName: invoice.clientName,
        recipientPhone: '',
        notes: '',
      });
    }
    void loadPartners();
  }, [open, existingDelivery, invoice, loadPartners]);

  const saveShipment = async () => {
    if (!form.waybillNumber.trim()) {
      setError('Le numéro de bon de livraison est requis.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (existingDelivery) {
        const res = await fetch('/api/logistics/deliveries', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingDelivery.id,
            trackingId: form.trackingId,
            notes: form.notes,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? 'Mise à jour impossible.');
        }
      } else {
        const res = await fetch('/api/logistics/deliveries', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            invoiceId: invoice.id,
            partnerId: form.partnerId || undefined,
            waybillNumber: form.waybillNumber.trim(),
            trackingId: form.trackingId.trim() || undefined,
            codAmount: Number(form.codAmount) || 0,
            recipientName: form.recipientName.trim() || undefined,
            recipientPhone: form.recipientPhone.trim() || undefined,
            notes: form.notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? 'Création impossible.');
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (status: string) => {
    if (!existingDelivery) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/logistics/deliveries', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existingDelivery.id, status }),
      });
      if (!res.ok) throw new Error('Mise à jour du statut impossible.');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  const reconcileCod = async () => {
    if (!existingDelivery) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/logistics/cod-reconciliation', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          deliveryId: existingDelivery.id,
          collectedAmount: Number(form.codAmount) || existingDelivery.codAmount,
          collectionMethod: 'cash',
          recordInvoicePayment: true,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Rapprochement COD impossible.');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-[#1B2A4A]" />
            <div>
              <h3 className="font-semibold text-gray-800">Livraison &amp; COD</h3>
              <p className="text-xs text-gray-400">Facture {invoice.number} · {invoice.clientName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {existingDelivery && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex items-center justify-between gap-3">
              <ShipmentStatusBadge delivery={existingDelivery} />
              {existingDelivery.trackingUrl && (
                <a
                  href={existingDelivery.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  Suivi <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : (
            <>
              {!existingDelivery && (
                <label className="block text-xs text-gray-500">
                  Transporteur
                  <select
                    value={form.partnerId}
                    onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— Manuel —</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-500 col-span-2 sm:col-span-1">
                  N° BL *
                  <input
                    value={form.waybillNumber}
                    onChange={(e) => setForm({ ...form, waybillNumber: e.target.value })}
                    disabled={!!existingDelivery}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                    placeholder="BL-2026-001"
                  />
                </label>
                <label className="block text-xs text-gray-500 col-span-2 sm:col-span-1">
                  ID suivi transporteur
                  <input
                    value={form.trackingId}
                    onChange={(e) => setForm({ ...form, trackingId: e.target.value })}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="TRK123456789"
                  />
                </label>
                <label className="block text-xs text-gray-500 col-span-2 sm:col-span-1">
                  Montant COD (MAD)
                  <input
                    value={form.codAmount}
                    onChange={(e) => setForm({ ...form, codAmount: e.target.value })}
                    type="number"
                    min="0"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs text-gray-500 col-span-2 sm:col-span-1">
                  Destinataire
                  <input
                    value={form.recipientName}
                    onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                    disabled={!!existingDelivery}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="block text-xs text-gray-500 col-span-2">
                  Téléphone
                  <input
                    value={form.recipientPhone}
                    onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
                    disabled={!!existingDelivery}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                  />
                </label>
                <label className="block text-xs text-gray-500 col-span-2">
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {existingDelivery?.trackingEvents && existingDelivery.trackingEvents.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">Historique statuts</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {existingDelivery.trackingEvents.map((ev) => (
                  <li key={ev.id} className="text-xs text-gray-600 flex justify-between gap-2">
                    <span>{deliveryStatusLabel(ev.status)}{ev.note ? ` — ${ev.note}` : ''}</span>
                    <span className="text-gray-400 shrink-0">{new Date(ev.recordedAt).toLocaleDateString('fr-FR')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Fermer</button>
          {existingDelivery?.status === 'pending' && (
            <button type="button" disabled={saving} onClick={() => void advanceStatus('in_transit')} className="px-4 py-2 text-sm border rounded-lg">Expédier</button>
          )}
          {existingDelivery?.status === 'in_transit' && (
            <button type="button" disabled={saving} onClick={() => void advanceStatus('delivered')} className="px-4 py-2 text-sm border rounded-lg">Marquer livré</button>
          )}
          {existingDelivery && existingDelivery.codAmount > 0 && existingDelivery.status === 'delivered' && (
            <button type="button" disabled={saving} onClick={() => void reconcileCod()} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg">
              Encaisser COD &amp; rapprocher
            </button>
          )}
          {!existingDelivery && (
            <button type="button" disabled={saving} onClick={() => void saveShipment()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">
              {saving ? 'Enregistrement…' : 'Créer expédition'}
            </button>
          )}
          {existingDelivery && (
            <button type="button" disabled={saving} onClick={() => void saveShipment()} className="px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg">
              {saving ? 'Enregistrement…' : 'Enregistrer suivi'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

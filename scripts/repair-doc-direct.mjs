/**
 * Repair a failed document by running OCR directly via Anthropic PDF document block.
 * Usage: node scripts/repair-doc-direct.mjs <documentId>
 */
import { readFileSync, existsSync } from 'fs';

const docId = process.argv[2];
if (!docId) { console.error('Usage: node repair-doc-direct.mjs <documentId>'); process.exit(1); }

// Load env
if (existsSync('.env.local')) {
  const lines = readFileSync('.env.local', 'utf-8').split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const k = line.slice(0, eqIdx).trim();
      const v = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch document
const { data: doc, error } = await supabase
  .from('atlas_documents')
  .select('id, user_id, storage_path, filename, mime_type, size_bytes, processing_status')
  .eq('id', docId)
  .maybeSingle();

if (error || !doc) { console.error('Doc not found:', error?.message ?? 'null'); process.exit(1); }
console.log('Document:', doc.id, doc.filename, doc.processing_status);

if (doc.processing_status === 'processed') {
  console.log('Already processed, skipping');
  process.exit(0);
}

// Download PDF
const { data: blob, error: dlErr } = await supabase.storage
  .from('atlas-documents')
  .download(doc.storage_path);

if (dlErr || !blob) { console.error('Download failed:', dlErr?.message); process.exit(1); }
const pdfBytes = Buffer.from(await blob.arrayBuffer());
console.log('Downloaded:', pdfBytes.length, 'bytes');

// Mark as processing
await supabase.from('atlas_documents').update({
  processing_status: 'processing',
  updated_at: new Date().toISOString()
}).eq('id', docId);

// Run direct Anthropic OCR
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PDF_SYSTEM = `Tu es un expert en extraction de données de factures marocaines.
Analyse le document PDF et extrais TOUTES les factures.
Retourne un JSON valide: { "total_pages": N, "invoices": [{ "page_number": 1, "numero_facture": "...", "date": "...", "fournisseur": "...", "montant_ht": 0, "taux_tva": 20, "montant_tva": 0, "montant_ttc": 0, "description": "..." }] }
JSON uniquement, sans texte.`;

console.log('Running Anthropic OCR...');
const t0 = Date.now();
const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 4096,
  system: PDF_SYSTEM,
  messages: [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBytes.toString('base64') } },
      { type: 'text', text: `Extrais toutes les factures de ${doc.filename} en JSON.` }
    ]
  }]
});

const elapsed = Date.now() - t0;
const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
console.log(`Response in ${elapsed}ms, length: ${rawText.length}`);

let parsed;
try {
  parsed = JSON.parse(rawText.replace(/^```json?\s*/,'').replace(/\s*```$/,'').trim());
} catch(e) {
  console.error('JSON parse failed:', e.message);
  console.error('Raw text:', rawText.slice(0, 200));
  // Store as failed
  await supabase.from('atlas_documents').update({
    processing_status: 'failed',
    extracted_text: rawText,
    metadata: { ocr: { error: { code: 'json_parse_failed', message: e.message }, progress_phase: 'failed' } },
    updated_at: new Date().toISOString()
  }).eq('id', docId);
  process.exit(1);
}

console.log('Parsed:', JSON.stringify(parsed, null, 2));

const invoices = parsed.invoices ?? [];
const bestInvoice = invoices.reduce((a, b) => ((a.montant_ttc ?? 0) >= (b.montant_ttc ?? 0) ? a : b), invoices[0] ?? {});

const now = new Date().toISOString();
const ocrMeta = {
  page_count: parsed.total_pages ?? (invoices.length > 0 ? invoices.length : 1),
  total_pages: parsed.total_pages ?? (invoices.length > 0 ? invoices.length : 1),
  pages_processed: parsed.total_pages ?? (invoices.length > 0 ? invoices.length : 1),
  invoices,
  file_name: doc.filename,
  mime_type: doc.mime_type,
  size_bytes: doc.size_bytes,
  completed_at: now,
  progress_phase: 'completed',
  progress_percent: 100,
  original_mime_type: doc.mime_type,
  ...(bestInvoice ? {
    numero_facture: bestInvoice.numero_facture,
    date: bestInvoice.date,
    fournisseur: bestInvoice.fournisseur,
    montant_ht: bestInvoice.montant_ht,
    taux_tva: bestInvoice.taux_tva,
    montant_tva: bestInvoice.montant_tva,
    montant_ttc: bestInvoice.montant_ttc,
  } : {}),
};

const { error: updateErr } = await supabase.from('atlas_documents').update({
  processing_status: 'processed',
  extracted_text: rawText,
  content: bestInvoice,
  metadata: { storage: { original_storage_path: doc.storage_path }, ocr: ocrMeta },
  updated_at: now
}).eq('id', docId);

if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }

console.log(`\n✓ REPAIRED ${docId}`);
console.log(`  pages: ${ocrMeta.page_count}`);
console.log(`  invoices: ${invoices.length}`);
console.log(`  fournisseur: ${bestInvoice.fournisseur ?? 'N/A'}`);
console.log(`  montant_ttc: ${bestInvoice.montant_ttc ?? 'N/A'}`);

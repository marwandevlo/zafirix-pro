/**
 * Robust extraction of JSON from LLM responses (markdown fences, "json {" prefixes, etc.).
 */

export function stripAiJsonWrappers(text: string): string {
  let clean = text.trim();
  clean = clean.replace(/^json\s*/i, '');
  clean = clean.replace(/^```(?:json)?\s*/i, '');
  clean = clean.replace(/\s*```$/i, '');
  return clean.trim();
}

/** Extract the outermost JSON object from free-form AI text. */
export function extractJsonObjectFromAiText(text: string): string | null {
  const stripped = stripAiJsonWrappers(text);
  if (stripped.startsWith('{') && stripped.endsWith('}')) return stripped;

  const start = stripped.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }

  return null;
}

export function parseAiJsonResponse<T = Record<string, unknown>>(text: string): T {
  const direct = stripAiJsonWrappers(text);
  try {
    return JSON.parse(direct) as T;
  } catch {
    const block = extractJsonObjectFromAiText(text);
    if (!block) throw new SyntaxError('No JSON object found in AI response');
    return JSON.parse(block) as T;
  }
}

export function looksLikeRawJsonText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  return t.startsWith('{') || t.startsWith('[') || /^json\s*[\[{]/i.test(t);
}

/** Parse classification when stored as string or nested under "classification". */
export function parseNestedClassification(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try {
      const parsed = parseAiJsonResponse<Record<string, unknown>>(raw);
      if (parsed.detected_type) return parsed;
      if (parsed.classification && typeof parsed.classification === 'object') {
        return parsed.classification as Record<string, unknown>;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    if (rec.detected_type) return rec;
    if (rec.classification && typeof rec.classification === 'object') {
      return rec.classification as Record<string, unknown>;
    }
  }

  return null;
}

export function sanitizeClassificationReason(reason: string | null | undefined): string {
  const text = String(reason ?? '').trim();
  if (!text) return '';
  if (looksLikeRawJsonText(text)) {
    const nested = parseNestedClassification(text);
    if (nested?.classification_reason) return String(nested.classification_reason);
    if (nested?.detected_type) return String(nested.detected_type).replace(/_/g, ' ');
  }
  return text.replace(/^json\s*/i, '').trim();
}

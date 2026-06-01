/**
 * Pricing table + cost calc, shared between the status-bar monitor, the
 * per-step epic attribution, and the suggest-engine. Mirrors
 * https://github.com/novapizza/claude-token-monitor (monitor.py:PRICING).
 *
 * Per 1M tokens, USD. Prefix-substring match against the model name in
 * the JSONL `message.model` field.
 *
 * Cache writes split by TTL (Anthropic API ≥ May 2026):
 *   cw_5m — ephemeral 5-minute cache write (1.25× input price)
 *   cw_1h — ephemeral 1-hour cache write   (2×   input price)
 */
export interface ModelPrice {
  in: number;
  out: number;
  cr: number;
  cw_5m: number;
  cw_1h: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // Opus 4.5+ — reduced pricing. Must be listed before 'claude-opus-4' so the
  // prefix-substring match hits the more specific entries first.
  'claude-opus-4-7':   { in:  5.0, out: 25.0, cr: 0.50, cw_5m:  6.25, cw_1h: 10.0 },
  'claude-opus-4-6':   { in:  5.0, out: 25.0, cr: 0.50, cw_5m:  6.25, cw_1h: 10.0 },
  'claude-opus-4-5':   { in:  5.0, out: 25.0, cr: 0.50, cw_5m:  6.25, cw_1h: 10.0 },
  // Legacy Opus 4 / 4.1
  'claude-opus-4':     { in: 15.0, out: 75.0, cr: 1.50, cw_5m: 18.75, cw_1h: 30.0 },
  'claude-sonnet-4':   { in:  3.0, out: 15.0, cr: 0.30, cw_5m:  3.75, cw_1h:  6.0 },
  'claude-haiku-4':    { in:  1.0, out:  5.0, cr: 0.10, cw_5m:  1.25, cw_1h:  2.0 },
  'claude-3-5-sonnet': { in:  3.0, out: 15.0, cr: 0.30, cw_5m:  3.75, cw_1h:  6.0 },
  'claude-3-5-haiku':  { in:  0.8, out:  4.0, cr: 0.08, cw_5m:  1.00, cw_1h:  1.6 },
  'claude-3-opus':     { in: 15.0, out: 75.0, cr: 1.50, cw_5m: 18.75, cw_1h: 30.0 },
  'claude-3-haiku':    { in: 0.25, out: 1.25, cr: 0.03, cw_5m:  0.30, cw_1h: 0.48 },
};

export const DEFAULT_PRICE: ModelPrice = { in: 3.0, out: 15.0, cr: 0.30, cw_5m: 3.75, cw_1h: 6.0 };

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  /** Legacy single-field format — treated as 5-min TTL when cache_creation is absent. */
  cache_creation_input_tokens: number;
  /** New split-TTL format (Anthropic API ≥ May 2026). Takes precedence over the legacy field. */
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

export function modelPrice(model: string): ModelPrice {
  const m = (model || '').toLowerCase();
  for (const [prefix, price] of Object.entries(PRICING)) {
    if (m.includes(prefix)) { return price; }
  }
  return DEFAULT_PRICE;
}

export function calcCost(usage: Usage, model: string): number {
  const p = modelPrice(model);
  const creation = usage.cache_creation;
  let cw_5m: number;
  let cw_1h: number;
  if (creation && (creation.ephemeral_5m_input_tokens !== undefined || creation.ephemeral_1h_input_tokens !== undefined)) {
    cw_5m = Number(creation.ephemeral_5m_input_tokens) || 0;
    cw_1h = Number(creation.ephemeral_1h_input_tokens) || 0;
  } else {
    // Legacy: single cache_creation_input_tokens treated as 5-minute TTL
    cw_5m = usage.cache_creation_input_tokens;
    cw_1h = 0;
  }
  return (
    usage.input_tokens * p.in / 1_000_000 +
    usage.output_tokens * p.out / 1_000_000 +
    usage.cache_read_input_tokens * p.cr / 1_000_000 +
    cw_5m * p.cw_5m / 1_000_000 +
    cw_1h * p.cw_1h / 1_000_000
  );
}

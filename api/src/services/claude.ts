// Claude-Moderation für Blog-Kommentare (Muster: heimvio-sidecar claude.ts —
// erzwungenes tool_use liefert garantiert strukturiertes JSON).
// Fehlerpolitik des AUFRUFERS: wirft diese Funktion, wird der Kommentar auf
// status='review' gesetzt und per Mail gemeldet — nie automatisch veröffentlicht.
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Gleiches Modell wie die heimvio-Belegextraktion — ein Modell im Bestand. */
const MODERATION_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `Du moderierst Kommentare für einen deutschen Immobilien-/Mietrecht-Blog
(Zielgruppe: Kleinvermieter und Mieter; Themen: Nebenkostenabrechnung, Heizkosten,
Anlage V, Messdienstleister).

Entscheide für jeden Kommentar:
- reject:  Spam, Werbung/Links auf fremde Produkte, Beleidigungen, Hassrede,
           sinnloser Inhalt (Zeichenmüll), komplett Off-Topic.
- review:  Rechtlich fragwürdige oder womöglich falsche Rechtsaussagen, unklare
           Grenzfälle, Kritik die echt sein könnte aber geprüft werden sollte,
           personenbezogene Angaben Dritter.
- approve: Sachlich, themenbezogen, konstruktiv — auch kritische Meinungen und
           einfache Fragen.

Im Zweifel review, nie approve. Begründung kurz und auf Deutsch.`;

const MODERATION_TOOL = {
  name: 'moderation_result',
  description: 'Moderationsentscheidung für den Kommentar.',
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['decision', 'reason'],
    properties: {
      decision: { type: 'string', enum: ['approve', 'review', 'reject'] },
      reason: { type: 'string', description: 'kurze Begründung auf Deutsch' },
    },
  },
};

export type ModerationDecision = { decision: 'approve' | 'review' | 'reject'; reason: string };

export async function moderateComment(authorName: string, content: string): Promise<ModerationDecision> {
  const c = getClient();
  const response = await c.messages.create({
    model: MODERATION_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [MODERATION_TOOL],
    tool_choice: { type: 'tool', name: MODERATION_TOOL.name },
    messages: [
      { role: 'user', content: `Kommentar von "${authorName}":\n\n${content}` },
    ],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('moderation_failed_no_tool_use');

  const input = block.input as ModerationDecision;
  if (!['approve', 'review', 'reject'].includes(input.decision)) {
    throw new Error(`moderation_invalid_decision: ${String(input.decision)}`);
  }
  return { decision: input.decision, reason: String(input.reason ?? '') };
}

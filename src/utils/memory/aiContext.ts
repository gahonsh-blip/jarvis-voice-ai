// ==============================================================================
// HERMES JARVIS — AI CONTEXT MODULE (backlog item 35)
//
// Builds the bounded context package handed to the language model: who the user
// is, what long-term memory holds, and the recent conversation. The module owns
// the budget so a large memory store cannot crowd out the current turn, and it
// reports what it dropped instead of silently truncating.
// ==============================================================================

export interface ContextNote {
  id: string;
  title: string;
  content: string;
}

export interface ContextTurn {
  role: 'user' | 'jarvis' | 'system' | 'model';
  content: string;
}

export interface AiContextInput {
  userName?: string;
  notes?: ContextNote[];
  customKeyValues?: Record<string, string>;
  history?: ContextTurn[];
  /** Rough character budget for the assembled context. */
  charBudget?: number;
  /** How many recent turns to consider before the budget is applied. */
  maxTurns?: number;
}

export interface AssembledContext {
  systemInstruction: string;
  turns: ContextTurn[];
  /** Facts folded into the system instruction. */
  includedNotes: string[];
  /** Long-term entries that did not fit the budget, named so callers can see them. */
  droppedNotes: string[];
  droppedTurns: number;
  charCount: number;
  withinBudget: boolean;
}

const DEFAULT_CHAR_BUDGET = 6000;
const DEFAULT_MAX_TURNS = 6;

/**
 * Assemble the model context without exceeding `charBudget`.
 *
 * The current turn is always kept; history is trimmed oldest-first. Notes are
 * added while they fit and the rest are reported as dropped rather than being
 * silently cut, so a caller can tell the difference between "no memory" and
 * "memory too large to include".
 */
export function assembleAiContext(input: AiContextInput): AssembledContext {
  const budget = Math.max(500, input.charBudget ?? DEFAULT_CHAR_BUDGET);
  const maxTurns = Math.max(0, input.maxTurns ?? DEFAULT_MAX_TURNS);

  // Keep only the most recent turns the caller is willing to consider.
  const fullHistory = input.history ?? [];
  const candidates = fullHistory.slice(-maxTurns);
  const turns: ContextTurn[] = [];
  let spent = 0;

  // Walk newest first on a scratch copy, then restore order. This keeps the
  // turns closest to the current message when the budget is tight.
  const kept: ContextTurn[] = [];
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const turn = candidates[i];
    const cost = turn.content?.length ?? 0;
    if (spent + cost > budget) break;
    kept.push(turn);
    spent += cost;
  }
  kept.reverse();
  turns.push(...kept);

  const headerParts = [`User's name: ${input.userName || 'Sir / Guest'}.`];

  const includedNotes: string[] = [];
  const droppedNotes: string[] = [];

  const keyValues = Object.entries(input.customKeyValues ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.length > 0,
  );
  if (keyValues.length > 0) {
    const kvText = keyValues.map(([k, v]) => `${k}: ${v}`).join('; ');
    if (spent + kvText.length <= budget) {
      headerParts.push(`Known facts: ${kvText}.`);
      spent += kvText.length;
    }
  }

  for (const note of input.notes ?? []) {
    const entry = `${note.title}: ${note.content}`;
    if (spent + entry.length > budget) {
      droppedNotes.push(note.title);
      continue;
    }
    includedNotes.push(entry);
    spent += entry.length;
  }

  if (includedNotes.length > 0) {
    headerParts.push(`Long-term memory:\n- ${includedNotes.join('\n- ')}`);
  }

  return {
    systemInstruction: headerParts.join('\n'),
    turns,
    includedNotes,
    droppedNotes,
    droppedTurns: fullHistory.length - turns.length,
    charCount: spent,
    withinBudget: spent <= budget,
  };
}
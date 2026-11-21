# Personas — who the agent is when it answers

A persona changes **only the system prompt**. Tools, the 87-tool registry, the
honesty rules and the approval rules are shared, because a friendlier voice must
never mean a looser worker.

| id | label | Use it for |
| --- | --- | --- |
| `jarvis` (default) | Jarvis | Owner-facing engineering: build, fix, verify, report. |
| `college` | College Assistant | Students and college staff. Formal, human-sounding, Hinglish/Hindi/English. |

## The college assistant

It is the same worker in a different voice:

- Speaks like a helpful senior student or a good office clerk, not like a chatbot:
  short sentences, plain words, answer first, no "As an AI" or "Certainly".
- Uses **aap** / **you**, never slang or baby talk.
- Matches the student's language: Hinglish in, Hinglish out; formal Hindi in,
  formal Hindi out; English in, English out.
- Covers the real chores: timetable, exams, admit card, results, internal marks,
  attendance shortage, fees and last dates, scholarship, hostel, library, bus,
  documents, bonafide, migration, TC, NOC, leave application, complaints.
- Drafts leave applications, fee-extension requests and faculty emails in formal
  Hindi or English, with blanks where the student's details go.
- **Never invents college facts.** Dates, fees, room numbers and faculty names are
  not in its head: it says it does not have the detail and points to the notice
  board, ERP portal, exam cell or accounts office, or drafts the question to ask.
- Never promises a seat, a waiver, a re-exam or an approval.
- Never asks for passwords, OTPs or bank details.

## Using it

```bash
# what exists
curl https://<host>/api/agent/personas

# ask as the college assistant
curl -X POST https://<host>/api/agent/run \
  -H 'content-type: application/json' \
  -d '{"task":"Fee ki last date kya hai aur ek extension application likh do","persona":"college"}'
```

The same `persona` field works on `POST /api/agent/stream`, and
`GET /api/agent/status` lists the personas plus `defaultPersona`.

An unknown, empty or hostile id (`__proto__`, `constructor`) falls back to
`jarvis` — the lookup uses `hasOwnProperty`, so an inherited object can never be
mistaken for a persona.

## Adding one

1. Add an entry to `PERSONAS` in `src/agent/personas.ts` with `id`, `label`,
   `summary`, `rules` and a `systemPrompt` built on `SYSTEM_PROMPT` from
   `src/agent/prompt.ts` (never import the loop from a persona: that is a cycle
   and it hands the persona an undefined prompt).
2. Add a case to `src/tests/personas.test.ts`.
3. Run `npm run lint && npx vitest run src/tests/personas.test.ts`.

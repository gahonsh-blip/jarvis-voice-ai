# Personas — one worker, several voices

A persona changes **only the system prompt**. The 87 tools, the honesty rules, the
approval gate and the tool protocol are identical in every voice, because a
friendlier tone must never mean a looser worker.

| id | label | Who it is for |
| --- | --- | --- |
| `jarvis` | Jarvis | Default. The owner-facing engineer: builds, fixes, verifies, reports. |
| `call` | Call Agent | Anyone phoning in. Short spoken turns that sound like a real person. |

`jarvis` is the default, so `POST /api/agent/run` without a `persona` behaves
exactly as before. Unknown ids fall back to `jarvis` instead of failing.

## The call agent

Used when a call comes in and the answer is spoken aloud (TTS or a live phone
bridge). It is written for the ear, not for a screen:

- **Spoken only.** No markdown, no bullets, no emoji, no link read out letter by
  letter. One or two short sentences per turn, about 25 words, then it stops and
  listens.
- **One question at a time**, and it never talks over a caller. If the caller
  interrupts, it answers the new point first.
- **Numbers as words.** "Cheh sau pachaas rupaye", "pandrah December, subah gyarah
  baje". Never a raw digit string. Important details are read back to confirm:
  name, phone, date, time, guest count.
- **Sounds human.** Warm, calm, unhurried, mirroring the caller's Hindi, Hinglish
  or English. No "As an AI", no "Certainly", no "I'd be happy to help".
- **Does the phone work.** Answers what the business offers, timings, location,
  basic rates and availability; takes a booking or an enquiry and reads it back;
  takes a message with a callback time; passes price negotiation, complaints,
  refunds, legal or medical matters to the owner.
- **Stays honest.** It never invents a date, rate, availability or promise, never
  confirms a booking it did not record, never says a payment was received, and
  never asks for a password, OTP, card or bank detail. If asked directly whether
  it is a human or a recording, it says plainly that it is the owner's AI
  assistant, then carries on helping.
- **Ends like a person.** "Theek hai, main note kar leta hoon. Aur kuch?" then a
  short goodbye, with no summary dump.

## Using it

```bash
# what is available
curl https://<host>/api/agent/personas
# {"default":"jarvis","personas":[{"id":"jarvis",...},{"id":"call",...}]}

# answer a call as the call agent
curl -X POST https://<host>/api/agent/run \
  -H 'content-type: application/json' \
  -d '{"task":"Namaste, shaadi ke liye 15 December ko hall khali hai?","persona":"call"}'
```

`GET /api/agent/status` also lists `personas` and `defaultPersona`, so a phone
bridge can discover the voice without hard-coding it.

## Adding a persona

1. Add a rules string in `src/agent/personas.ts`.
2. Register it in `PERSONAS` with `id`, `label`, `summary`, `rules` and
   `systemPrompt: ENGINEER_PROMPT + rules + SHARED_TAIL`.
3. Add a case to `src/tests/personas.test.ts` pinning the behaviour you care
   about (tone, honesty, no robotic openers).

`SHARED_TAIL` is appended to every persona on purpose: it carries the tool
protocol and the "never claim it before you checked it" rule.

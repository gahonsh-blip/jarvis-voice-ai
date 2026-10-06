// Console/history phrases that must be recognised *before* the outbound-call
// branch. Both begin with the bare prefix "call " (and "call history" also
// contains the substring "call "), so a `startsWith('call ')` outbound test
// swallows them: "call hub" staged an outbound call to the literal target
// "hub" behind a Level-4 approval prompt while the telephony console the user
// asked for never opened. The server classifier and the offline engine share
// these predicates so the two surfaces cannot drift.

const TELEPHONY_HUB_PHRASES = [
  'call hub',
  'open dialer',
  'open phone',
  'phone dialer',
  'telephony hub',
  'telephony system',
  'कॉल हब',
  'फोन डायलर',
];

const CALL_HISTORY_PHRASES = [
  'call history',
  'call logs',
  'call log',
  'recent calls',
  'who called',
  'कॉल हिस्ट्री',
  'किसका कॉल आया',
];

// Call-control phrases. Like the console/history phrases above, several of them
// contain the substring "phone call", which the outbound-call branch treats as a
// dial trigger. "end phone call" therefore staged an outbound call to the default
// number and "disconnect phone call" was read as an outbound request, instead of
// hanging up. Each list spells out the "... phone call" forms so the outbound
// branch can exclude the whole control family, not just the short forms.
const ANSWER_CALL_PHRASES = [
  'answer call',
  'answer the phone call',
  'pick up the phone call',
  'pick up the phone',
  'pick up the call',
  'answer the phone',
  'कॉल उठाओ',
  'फोन उठाओ',
  'phone uthao',
];

const HANGUP_CALL_PHRASES = [
  'hang up',
  'end call',
  'end the phone call',
  'end phone call',
  'cut the call',
  'cut the phone call',
  'disconnect call',
  'disconnect the phone call',
  'disconnect phone call',
  'कॉल काटो',
  'फोन काटो',
  'call kato',
];

const REJECT_CALL_PHRASES = [
  'reject call',
  'reject the phone call',
  'reject phone call',
  'decline call',
  'decline the phone call',
  'decline phone call',
  'कॉल रिजेक्ट करो',
];

export function isTelephonyHubRequest(lower: string): boolean {
  return TELEPHONY_HUB_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isCallHistoryRequest(lower: string): boolean {
  return CALL_HISTORY_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isAnswerCallRequest(lower: string): boolean {
  return ANSWER_CALL_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isHangupCallRequest(lower: string): boolean {
  return HANGUP_CALL_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isRejectCallRequest(lower: string): boolean {
  return REJECT_CALL_PHRASES.some((phrase) => lower.includes(phrase));
}

// Every telephony intent that is not an outbound dial. The outbound-call branch
// must exclude this whole family, otherwise any control phrase that happens to
// contain "phone call" (or starts with "call ") is dialled as a literal target.
export function isTelephonyControlRequest(lower: string): boolean {
  return (
    isTelephonyHubRequest(lower) ||
    isCallHistoryRequest(lower) ||
    isAnswerCallRequest(lower) ||
    isHangupCallRequest(lower) ||
    isRejectCallRequest(lower)
  );
}

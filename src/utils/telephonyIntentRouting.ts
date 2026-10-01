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
  'recent calls',
  'who called',
  'कॉल हिस्ट्री',
  'किसका कॉल आया',
];

export function isTelephonyHubRequest(lower: string): boolean {
  return TELEPHONY_HUB_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isCallHistoryRequest(lower: string): boolean {
  return CALL_HISTORY_PHRASES.some((phrase) => lower.includes(phrase));
}

// ==============================================================================
// HERMES JARVIS — TELEPHONY PRIVACY DISPLAY TRUTH
//
// The call HUD and the Telephony Hub rendered a "MASKED" / "PRIVACY MASKED"
// badge next to an unknown inbound caller, but the phone number printed
// directly underneath was the raw carrier value. The badge asserted privacy
// while the UI leaked the number it claimed to hide — the caller's name was
// reduced to "Unknown Caller" and their full number shown anyway.
//
// These helpers derive the displayed number from the same predicate the badge
// already uses, so the badge can never render over an unmasked number.
// ==============================================================================

import { ContactItem, isNumberInContacts } from '../types/telephony';
import { maskPhoneNumber } from './telephonyPermissions';

/**
 * True when the privacy policy requires this party's identity to be hidden:
 * masking is enabled and the number is not a known contact.
 */
export function shouldMaskParty(
  number: string | undefined | null,
  contactsList: ContactItem[],
  maskUnknownEnabled: boolean
): boolean {
  if (!maskUnknownEnabled || !number) return false;
  return !isNumberInContacts(number, contactsList);
}

/**
 * Number to render for a call party. Returns the masked form exactly when the
 * masking badge applies, otherwise the value unchanged.
 */
export function resolveDisplayNumber(
  number: string | undefined | null,
  contactsList: ContactItem[],
  maskUnknownEnabled: boolean
): string {
  if (!number) return '';
  return shouldMaskParty(number, contactsList, maskUnknownEnabled) ? maskPhoneNumber(number) : number;
}

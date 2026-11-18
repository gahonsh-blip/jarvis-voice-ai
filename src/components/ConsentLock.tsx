import React, { useEffect, useState } from 'react';
import {
  ConsentRequest,
  describe,
  hasPasscode,
  isUnlocked,
  setPasscode,
  unlock,
  logConsent,
} from '../lib/consent';

/**
 * The single confirmation surface for anything that changes the outside world.
 * It always shows what will happen, then asks for the local passcode, so a
 * mistaken tap or a mixed-up voice command can never act on its own.
 */
export interface ConsentLockProps {
  request: ConsentRequest | null;
  onDecide: (granted: boolean) => void;
}

export default function ConsentLock({ request, onDecide }: ConsentLockProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    setCode('');
    setError('');
    setSettingUp(Boolean(request) && !hasPasscode());
  }, [request]);

  if (!request) return null;

  const finish = (granted: boolean) => {
    logConsent({ ...request, at: new Date().toISOString(), granted });
    onDecide(granted);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (settingUp) {
        await setPasscode(code);
        finish(true);
      } else if (isUnlocked()) {
        finish(true);
      } else if (await unlock(code)) {
        finish(true);
      } else {
        setError('That passcode does not match. Nothing was done.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm this action"
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(3,10,12,.82)', backdropFilter: 'blur(6px)',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 430, background: '#0f2024',
          border: '1px solid #1f3b3f', borderRadius: 16, padding: 22,
          color: '#e8f3f1', boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        }}
      >
        <p style={{ margin: '0 0 6px', fontSize: 12, letterSpacing: '.14em', color: '#7fd1c4' }}>
          PERMISSION NEEDED
        </p>
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{describe(request)}</h3>
        <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{request.title}</p>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.6, color: '#a9c4c1' }}>
          {request.detail}
        </p>

        <label style={{ display: 'block', fontSize: 12.5, color: '#8fb0ad', marginBottom: 6 }}>
          {settingUp ? 'Set your screen-lock passcode (min 4 characters)' : 'Enter your screen-lock passcode'}
        </label>
        <input
          type="password"
          inputMode="text"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="••••"
          style={{
            width: '100%', padding: '11px 12px', borderRadius: 10,
            border: '1px solid #24464a', background: '#0a171a',
            color: '#e8f3f1', fontSize: 16, letterSpacing: '.22em',
          }}
        />
        {error && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#ff9b9b' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => finish(false)}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
              background: 'transparent', color: '#9fb8b5', border: '1px solid #24464a',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            style={{
              flex: 1.4, padding: '11px 0', borderRadius: 10, border: 0, cursor: 'pointer',
              background: code.trim().length < 4 ? '#1d4145' : '#12776a',
              color: '#fff', fontWeight: 700,
            }}
          >
            {settingUp ? 'Set passcode & allow' : 'Unlock & allow'}
          </button>
        </div>

        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: '#6f8a87', lineHeight: 1.5 }}>
          Nothing runs before you unlock. Every decision is written to the consent log so you
          can see afterwards what was approved and when.
        </p>
      </form>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import ConsentLock from './ConsentLock';
import { ConsentRequest, readConsentLog, hasPasscode, isUnlocked, lock } from '../lib/consent';

/**
 * One panel that makes the three things the owner asked for visible and usable:
 *   1. a permission gate with a screen-lock passcode (nothing acts without it)
 *   2. somewhere to paste an AI provider key (Google / Groq / OpenRouter ...)
 *   3. an install surface: run it in the browser, or install it as an app
 */

const PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', hint: 'AIza...' },
  { id: 'groq', label: 'Groq', hint: 'gsk_...' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'sk-or-...' },
  { id: 'openai', label: 'OpenAI', hint: 'sk-...' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'sk-...' },
];

const KEY_STORE = 'jarvis.provider.keys';

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

export default function SuperAgentGate() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'permission' | 'keys' | 'app'>('permission');
  const [request, setRequest] = useState<ConsentRequest | null>(null);
  const [lastResult, setLastResult] = useState('');
  const [logVersion, setLogVersion] = useState(0);
  const [provider, setProvider] = useState('gemini');
  const [keyValue, setKeyValue] = useState('');
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  const keys = useMemo<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(KEY_STORE) || '{}'); } catch { return {}; }
  }, [open, keyValue]);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const saveKey = () => {
    if (!keyValue.trim()) return;
    const next = { ...keys, [provider]: keyValue.trim() };
    localStorage.setItem(KEY_STORE, JSON.stringify(next));
    setKeyValue('');
    setLastResult(`${PROVIDERS.find((p) => p.id === provider)?.label} key saved on this device.`);
  };

  const demoAction: ConsentRequest = {
    action: 'file:delete',
    title: 'Delete "client-invoice-final.pdf" from the workspace',
    detail: 'Jarvis will remove the file from storage. This is a demonstration of the gate that every real action passes through.',
    irreversible: true,
  };

  const logs = useMemo(() => readConsentLog(), [logVersion, open]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed', right: 18, bottom: 18, zIndex: 150, border: 0,
          borderRadius: 999, padding: '12px 18px', cursor: 'pointer',
          background: 'linear-gradient(135deg,#0f766e,#0e7490)', color: '#fff',
          fontWeight: 700, fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        }}
      >
        {open ? 'Close' : '⚡ Super Agent'}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', right: 18, bottom: 74, zIndex: 150, width: 'min(410px, calc(100vw - 36px))',
            background: '#0b1a1e', border: '1px solid #1f3b3f', borderRadius: 16,
            color: '#e8f3f1', padding: 16, boxShadow: '0 24px 70px rgba(0,0,0,.55)',
          }}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['permission', 'keys', 'app'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer', fontSize: 12.5,
                  border: '1px solid ' + (tab === t ? '#12776a' : '#1f3b3f'),
                  background: tab === t ? '#0f3b38' : 'transparent',
                  color: tab === t ? '#9ff0e2' : '#9fb8b5', fontWeight: 600,
                }}
              >
                {t === 'permission' ? 'Permission' : t === 'keys' ? 'AI keys' : 'App'}
              </button>
            ))}
          </div>

          {tab === 'permission' && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#9fb8b5', lineHeight: 1.6 }}>
                Every action that touches the outside world asks first, then needs your
                screen-lock passcode. Passcode: {hasPasscode() ? (isUnlocked() ? 'unlocked' : 'set') : 'not set yet'}.
              </p>
              <button
                onClick={() => setRequest(demoAction)}
                style={{ width: '100%', padding: 11, borderRadius: 10, border: 0, cursor: 'pointer', background: '#12776a', color: '#fff', fontWeight: 700 }}
              >
                Try a protected action
              </button>
              {hasPasscode() && (
                <button
                  onClick={() => { lock(); setLogVersion((v) => v + 1); }}
                  style={{ width: '100%', marginTop: 8, padding: 9, borderRadius: 10, cursor: 'pointer', background: 'transparent', color: '#9fb8b5', border: '1px solid #1f3b3f' }}
                >
                  Lock now
                </button>
              )}
              {lastResult && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9ff0e2' }}>{lastResult}</p>}
              {logs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: '.12em', color: '#6f8a87' }}>CONSENT LOG</p>
                  {logs.slice(0, 4).map((l, i) => (
                    <p key={i} style={{ margin: '0 0 4px', fontSize: 11.5, color: l.granted ? '#9ff0e2' : '#ff9b9b' }}>
                      {l.granted ? 'allowed' : 'refused'} · {l.title.slice(0, 48)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'keys' && (
            <div>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 10, background: '#0a171a', color: '#e8f3f1', border: '1px solid #24464a', marginBottom: 8 }}
              >
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={PROVIDERS.find((p) => p.id === provider)?.hint}
                style={{ width: '100%', padding: 10, borderRadius: 10, background: '#0a171a', color: '#e8f3f1', border: '1px solid #24464a' }}
              />
              <button
                onClick={saveKey}
                style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 10, border: 0, cursor: 'pointer', background: '#12776a', color: '#fff', fontWeight: 700 }}
              >
                Save key on this device
              </button>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#6f8a87', lineHeight: 1.5 }}>
                Saved keys stay in this browser only. For the server-side agent put them in the
                host environment instead, so they never travel to a client.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#9fb8b5' }}>
                Configured: {Object.keys(keys).length ? Object.keys(keys).join(', ') : 'none yet'}
              </p>
            </div>
          )}

          {tab === 'app' && (
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#9fb8b5', lineHeight: 1.6 }}>
                Run Jarvis in the browser, or install it on the phone so it opens like a normal app.
              </p>
              <button
                onClick={async () => { if (installEvent) { await installEvent.prompt(); setInstallEvent(null); } }}
                disabled={!installEvent}
                style={{ width: '100%', padding: 11, borderRadius: 10, border: 0, cursor: installEvent ? 'pointer' : 'not-allowed', background: installEvent ? '#12776a' : '#1d4145', color: '#fff', fontWeight: 700 }}
              >
                {installEvent ? 'Install app on this device' : 'Install prompt not available here'}
              </button>
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#6f8a87', lineHeight: 1.5 }}>
                Android: Chrome menu, then Add to Home screen. iPhone: Share, then Add to Home Screen.
                The same build runs as a web app, so nothing is lost by skipping the install.
              </p>
            </div>
          )}
        </div>
      )}

      <ConsentLock
        request={request}
        onDecide={(granted) => {
          setLastResult(granted ? 'Unlocked: the action was allowed and written to the log.' : 'Cancelled: nothing was done.');
          setRequest(null);
          setLogVersion((v) => v + 1);
        }}
      />
    </>
  );
}

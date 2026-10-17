// HERMES JARVIS — Autonomous Tools filesystem-write honesty (backlog item 13).
//
// `POST /api/tools/fs/write` writes the file, then reports two independent
// facts: `success` (the bytes reached disk) and `auditPersisted` (its VERIFIED
// audit row reached durable storage). The AutonomousToolsModal FS tab branched
// only on `data.success` and always printed "File written successfully", so a
// write whose audit trail could not be persisted — the route even returns an
// `error` string saying so — was rendered as a clean success.
//
// These guards pin the modal wiring that surfaces `auditPersisted: false` as an
// info verdict instead.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const modalSource = fs.readFileSync(
  path.resolve(__dirname, '../components/AutonomousToolsModal.tsx'),
  'utf-8'
);
const serverSource = fs.readFileSync(
  path.resolve(__dirname, '../../server.ts'),
  'utf-8'
);

describe('AutonomousToolsModal FS write — the audit durability flag is read', () => {
  const modalFlat = modalSource.replace(/\s+/g, ' ');

  it('branches on the route auditPersisted flag before claiming success', () => {
    expect(modalFlat).toMatch(/data\.auditPersisted === false/);
    expect(modalFlat).toMatch(/audit record NOT written to durable storage/);
    expect(modalFlat).toMatch(/if \(data\.auditPersisted === false\) \{ showFeedback\([\s\S]*?durable storage\.[\s\S]*?'info' \)/);
  });
});

describe('POST /api/tools/fs/write returns an independent audit durability flag', () => {
  it('reports auditPersisted from a durable read-back, not the write boolean', () => {
    const start = serverSource.indexOf("app.post('/api/tools/fs/write'");
    expect(start).toBeGreaterThan(-1);
    const route = serverSource.slice(start, start + 1600);
    expect(route).toMatch(/auditPersisted/);
    expect(route).toMatch(/recordDurableAuditRow\(/);
    expect(route).toMatch(/auditPersisted[\s\S]*?error:[\s\S]*?audit record could not be persisted/);
  });
});

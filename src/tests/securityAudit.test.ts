import { describe, it, expect } from 'vitest';
import { runSecurityAudit, isAuditClean, summariseAudit } from '../utils/hardening/securityAudit';

describe('runSecurityAudit', () => {
  it('flags a committed credential', () => {
    const report = runSecurityAudit([
      { path: 'src/config.ts', content: `const KEY = "ghp_${'a'.repeat(40)}";`, tracked: true },
    ]);
    expect(report.findings[0].severity).toBe('CRITICAL');
    expect(report.findings[0].line).toBe(1);
  });

  it('does not flag an example placeholder', () => {
    const report = runSecurityAudit([
      { path: '.env.example', content: 'GITHUB_TOKEN=your_token_here', tracked: true },
    ]);
    expect(report.findings).toEqual([]);
  });

  it('flags a hardcoded secret literal', () => {
    const report = runSecurityAudit([
      { path: 'src/config.ts', content: `const SECRET = "s3cr3t-value-1234";`, tracked: true },
    ]);
    expect(report.findings[0].severity).toBe('CRITICAL');
    expect(report.findings[0].message).toContain('Hardcoded value');
  });

  it('does not flag a variable read from the environment', () => {
    const report = runSecurityAudit([
      { path: 'src/config.ts', content: `const token = process.env.SECRET;`, tracked: true },
    ]);
    expect(report.findings).toEqual([]);
  });

  it('does not flag object property access as a credential', () => {
    // An earlier, broader scan reported every `conn.accessToken = x` as a
    // leaked secret, which buried the real findings.
    const report = runSecurityAudit([
      { path: 'src/conn.ts', content: `conn.accessToken = decrypted;`, tracked: true },
    ]);
    expect(report.findings).toEqual([]);
  });

  it('reports a test-file fixture at LOW, not CRITICAL', () => {
    const report = runSecurityAudit([
      { path: 'src/tests/bridge.test.ts', content: `const SECRET = "test-signing-secret";`, tracked: true },
    ]);
    expect(report.findings[0].severity).toBe('LOW');
  });

  it('does not flag a placeholder value in tracked source', () => {
    const report = runSecurityAudit([
      { path: 'src/setup.ts', content: 'const token = "paste_your_token_here";', tracked: true },
    ]);
    expect(report.findings).toEqual([]);
  });

  it('flags a tracked .env file', () => {
    const report = runSecurityAudit([
      { path: '.env', content: 'NAME=Gaurav', tracked: true },
    ]);
    expect(report.findings.some((f) => f.severity === 'CRITICAL' && f.file === '.env')).toBe(true);
  });

  it('does not flag an untracked .env file', () => {
    const report = runSecurityAudit([{ path: '.env', content: 'NAME=Gaurav', tracked: false }]);
    expect(report.findings.some((f) => f.file === '.env')).toBe(false);
  });

  it('flags a .gitignore that does not ignore .env', () => {
    const report = runSecurityAudit([
      { path: '.gitignore', content: 'node_modules/\ndist/\n', tracked: true },
    ]);
    expect(report.findings.some((f) => f.severity === 'HIGH')).toBe(true);
  });

  it('accepts a .gitignore that ignores .env', () => {
    const report = runSecurityAudit([
      { path: '.gitignore', content: 'node_modules/\n.env\n', tracked: true },
    ]);
    expect(report.findings.some((f) => f.file === '.gitignore')).toBe(false);
  });

  it('reports its own scope', () => {
    const report = runSecurityAudit([{ path: 'a.ts', content: '', tracked: true }]);
    expect(report.scope).toEqual(['a.ts']);
    expect(report.scannedFiles).toBe(1);
  });
});

describe('audit helpers', () => {
  it('treats a report with only low findings as clean', () => {
    expect(isAuditClean({ scannedFiles: 1, findings: [{ severity: "LOW" as const, file: "x", message: "" }], scope: [], scannedLines: 1 })).toBe(true);
  });

  it('treats a critical finding as not clean', () => {
    expect(isAuditClean({ scannedFiles: 1, findings: [{ severity: "CRITICAL" as const, file: "x", message: "" }], scope: [], scannedLines: 1 })).toBe(false);
  });

  it('counts findings by severity', () => {
    const counts = summariseAudit({
      scannedFiles: 2,
      scope: [],
      scannedLines: 3,
      findings: [
        { severity: "CRITICAL" as const, file: "a", message: "" },
        { severity: "CRITICAL" as const, file: "b", message: "" },
        { severity: "LOW" as const, file: "c", message: "" },
      ],
    });
    expect(counts.CRITICAL).toBe(2);
    expect(counts.LOW).toBe(1);
    expect(counts.HIGH).toBe(0);
  });
});
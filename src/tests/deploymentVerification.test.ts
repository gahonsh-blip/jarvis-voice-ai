import { describe, it, expect } from 'vitest';
import { verifyDeployment, deploymentBlockers, type DeploymentInputs } from '../utils/hardening/deploymentVerification';

const ready: DeploymentInputs = {
  vaultConfigured: true,
  isDevMode: false,
  port: 3000,
  dataDirWritable: true,
  httpsConfigured: true,
  blockingBugs: 0,
  backupVerified: true,
};

describe('verifyDeployment', () => {
  it('reports ready when every check passes', () => {
    const report = verifyDeployment(ready);
    expect(report.ready).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.unknown).toBe(0);
  });

  it('is not ready without a vault secret', () => {
    const report = verifyDeployment({ ...ready, vaultConfigured: false });
    expect(report.ready).toBe(false);
    expect(report.checks.find((c) => c.name.includes('vault'))?.status).toBe('FAIL');
  });

  it('is not ready when running a dev server', () => {
    expect(verifyDeployment({ ...ready, isDevMode: true }).ready).toBe(false);
  });

  it('is not ready without HTTPS', () => {
    const report = verifyDeployment({ ...ready, httpsConfigured: false });
    expect(report.ready).toBe(false);
    expect(report.checks.find((c) => c.name.includes('transport'))?.status).toBe('FAIL');
  });

  it('is not ready when blocking bugs remain', () => {
    expect(verifyDeployment({ ...ready, blockingBugs: 2 }).ready).toBe(false);
  });

  it('is not ready when the data directory is unwritable', () => {
    expect(verifyDeployment({ ...ready, dataDirWritable: false }).ready).toBe(false);
  });

  it('blocks readiness on an unknown check rather than assuming it passed', () => {
    // An unexercised backup is not evidence that backups work.
    const report = verifyDeployment({ ...ready, backupVerified: false });
    expect(report.unknown).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.ready).toBe(false);
  });

  it('reports an unknown port as unknown, not as a pass', () => {
    const report = verifyDeployment({ ...ready, port: null });
    expect(report.checks.find((c) => c.name.includes('port'))?.status).toBe('UNKNOWN');
    expect(report.ready).toBe(false);
  });

  it('counts each status correctly', () => {
    const report = verifyDeployment({
      ...ready,
      vaultConfigured: false,
      backupVerified: false,
      port: null,
    });
    expect(report.passed).toBe(4);
    expect(report.failed).toBe(1);
    expect(report.unknown).toBe(2);
  });
});

describe('deploymentBlockers', () => {
  it('lists every non-passing check with its reason', () => {
    const report = verifyDeployment({ ...ready, httpsConfigured: false, vaultConfigured: false });
    const blockers = deploymentBlockers(report);
    expect(blockers).toHaveLength(2);
    expect(blockers.join(' ')).toContain('HTTPS');
    expect(blockers.join(' ')).toContain('vault');
  });

  it('returns nothing for a ready deployment', () => {
    expect(deploymentBlockers(verifyDeployment(ready))).toEqual([]);
  });
});
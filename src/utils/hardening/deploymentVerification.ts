// ==============================================================================
// HERMES JARVIS — DEPLOYMENT VERIFICATION (backlog item 58)
//
// Checks the conditions a deployment must satisfy before it can be called
// production-ready. The result is a list of passes and failures, not a bare
// boolean, so an operator can see what is missing.
//
// A check that cannot be evaluated reports 'UNKNOWN'. Treating an unevaluated
// check as a pass is how a deployment gets declared ready when it is not.
// ==============================================================================

export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface DeploymentCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface DeploymentReport {
  ready: boolean;
  checks: DeploymentCheck[];
  passed: number;
  failed: number;
  unknown: number;
}

export interface DeploymentInputs {
  /** Whether APP_SECRET or SESSION_SECRET is set. */
  vaultConfigured: boolean;
  /** True when the process is running a development server rather than built assets. */
  isDevMode: boolean;
  /** Port the server is listening on. */
  port: number | null;
  /** Whether a data directory is writable. */
  dataDirWritable: boolean;
  /** Whether HTTPS termination is configured in front of this process. */
  httpsConfigured: boolean;
  /** Number of known blocking bugs. */
  blockingBugs: number;
  /** Whether backup/restore has been exercised successfully. */
  backupVerified: boolean;
}

/**
 * Evaluates deployment readiness. Nothing here reaches the network: every input
 * is observed by the caller, so the report cannot be satisfied by a mock.
 */
export function verifyDeployment(inputs: DeploymentInputs): DeploymentReport {
  const checks: DeploymentCheck[] = [];

  checks.push({
    name: 'token vault secret configured',
    status: inputs.vaultConfigured ? 'PASS' : 'FAIL',
    detail: inputs.vaultConfigured
      ? 'APP_SECRET or SESSION_SECRET is set.'
      : 'No vault secret is set; stored tokens use a per-process key and will not survive a restart.',
  });

  checks.push({
    name: 'production build',
    status: inputs.isDevMode ? 'FAIL' : 'PASS',
    detail: inputs.isDevMode
      ? 'Running the development server; build the client before deploying.'
      : 'Serving built assets.',
  });

  checks.push({
    name: 'listening port',
    status: inputs.port ? 'PASS' : 'UNKNOWN',
    detail: inputs.port ? `Listening on port ${inputs.port}.` : 'Port could not be determined.',
  });

  checks.push({
    name: 'writable data directory',
    status: inputs.dataDirWritable ? 'PASS' : 'FAIL',
    detail: inputs.dataDirWritable
      ? 'Memory store directory is writable.'
      : 'Memory store directory is not writable; persistence will fail.',
  });

  checks.push({
    name: 'transport security',
    status: inputs.httpsConfigured ? 'PASS' : 'FAIL',
    detail: inputs.httpsConfigured
      ? 'HTTPS termination is configured.'
      : 'No HTTPS termination detected. Tokens would cross the network in clear text.',
  });

  checks.push({
    name: 'no blocking bugs',
    status: inputs.blockingBugs === 0 ? 'PASS' : 'FAIL',
    detail:
      inputs.blockingBugs === 0
        ? 'No blocking bugs recorded.'
        : `${inputs.blockingBugs} blocking bug(s) recorded.`,
  });

  checks.push({
    name: 'backup verified',
    status: inputs.backupVerified ? 'PASS' : 'UNKNOWN',
    detail: inputs.backupVerified
      ? 'A backup has been created and round-trip verified.'
      : 'Backup/restore has not been exercised in this deployment.',
  });

  const passed = checks.filter((c) => c.status === 'PASS').length;
  const failed = checks.filter((c) => c.status === 'FAIL').length;
  const unknown = checks.filter((c) => c.status === 'UNKNOWN').length;

  // An UNKNOWN check blocks readiness. Declaring ready with an unexamined
  // condition would be exactly the false-success claim this project forbids.
  return { ready: failed === 0 && unknown === 0, checks, passed, failed, unknown };
}

/** Explains why the deployment is not ready, one line per blocking check. */
export function deploymentBlockers(report: DeploymentReport): string[] {
  return report.checks
    .filter((c) => c.status !== 'PASS')
    .map((c) => `${c.name}: ${c.detail}`);
}
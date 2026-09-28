// ==============================================================================
// HERMES JARVIS — SECURITY AUDIT (backlog items 51, 54)
//
// Inspects a set of files for the mistakes that leak credentials:
//
//   - a secret literal committed in source
//   - a .env file that is not git-ignored
//   - a hardcoded fallback secret
//
// Detection is deliberately narrow. An earlier version reused the broad
// redaction patterns and reported 100 "credentials" in server.ts, every one of
// them a code reference such as `conn.accessToken = decrypted`. An audit that
// cries wolf is worse than none: it trains the reader to ignore it. This scan
// therefore only flags a quoted literal value, or a token whose shape is
// self-evidently a credential.
// ==============================================================================



export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditFinding {
  severity: FindingSeverity;
  file: string;
  /** 1-based line number, when the finding is tied to a line. */
  line?: number;
  message: string;
}

export interface AuditReport {
  scannedFiles: number;
  findings: AuditFinding[];
  /** Files examined, so the report can show its own scope. */
  scope: string[];
  /** Lines examined in total. */
  scannedLines: number;
}

export interface AuditInputFile {
  path: string;
  content: string;
  /** Whether the path is tracked by git. */
  tracked?: boolean;
}

/** Paths whose contents are expected to include example credentials. */
const ALLOWLISTED_PATHS = ['.env.example', 'README.md', '.md'];

/** Files that hold live secrets and must never be committed. */
const SECRET_FILE_PATTERNS = [/\.env$/, /\.env\.(local|production|staging)$/, /id_rsa$/, /\.pem$/];

const PLACEHOLDER_HINTS = [
  'your_', 'your-', '<', 'xxx', 'example', 'placeholder', 'changeme',
  'insert_', 'paste_', 'dummy', 'test_key', 'fake', 'redacted', 'here',
];

/** A secret-named variable assigned a quoted literal of real length. */
const LITERAL_ASSIGNMENT =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|app[_-]?secret|access[_-]?key)\b\s*[:=]\s*(['"])([^'"]{8,})\2/i;

/** Token shapes that are unmistakably credentials regardless of context. */
const HIGH_CONFIDENCE_TOKENS = [
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AIzaSy[A-Za-z0-9_-]{33}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
];

function isPlaceholder(text: string): boolean {
  const lower = text.toLowerCase();
  return PLACEHOLDER_HINTS.some((h) => lower.includes(h));
}

function isAllowlisted(path: string): boolean {
  return ALLOWLISTED_PATHS.some((a) => path.endsWith(a));
}

/**
 * Test files commonly define signing secrets as fixtures. Those are still
 * hardcoded values worth seeing, but they are not production leaks, so they are
 * reported at LOW instead of CRITICAL.
 */
function isTestPath(path: string): boolean {
  return /(^|\/)(tests?|__tests__)\//.test(path) || /\.(test|spec)\.[jt]sx?$/.test(path);
}

/**
 * Scans files and returns everything suspicious, most severe first.
 */
export function runSecurityAudit(files: AuditInputFile[]): AuditReport {
  const findings: AuditFinding[] = [];
  const scope: string[] = [];
  let scannedLines = 0;

  for (const file of files) {
    scope.push(file.path);

    // 1. A secret file that git is tracking.
    if (file.tracked && SECRET_FILE_PATTERNS.some((p) => p.test(file.path))) {
      findings.push({
        severity: 'CRITICAL',
        file: file.path,
        message: 'File appears to hold live secrets and is tracked by git.',
      });
    }

    // 2. Committed credential literals, unless the file is an example/template.
    if (file.tracked && !isAllowlisted(file.path)) {
      const lines = file.content.split('\n');
      scannedLines += lines.length;

      lines.forEach((line, index) => {
        if (isPlaceholder(line)) return;

        if (HIGH_CONFIDENCE_TOKENS.some((t) => t.test(line))) {
          findings.push({
            severity: 'CRITICAL',
            file: file.path,
            line: index + 1,
            message: 'Contains a string shaped like a live credential.',
          });
          return;
        }

        const literal = LITERAL_ASSIGNMENT.exec(line);
        if (literal) {
          // A literal that points at the environment is not itself a secret.
          const value = literal[3];
          if (/process\.env|env\.|import\.meta/.test(value)) return;

          findings.push({
            severity: isTestPath(file.path) ? 'LOW' : 'CRITICAL',
            file: file.path,
            line: index + 1,
            message: `Hardcoded value assigned to "${literal[1]}".`,
          });
        }
      });
    }
  }

  // 3. Any .env file that exists must be git-ignored.
  const gitignore = files.find((f) => f.path.endsWith('.gitignore'));
  if (gitignore && !/^\s*\.env\s*$/m.test(gitignore.content)) {
    findings.push({
      severity: 'HIGH',
      file: gitignore.path,
      message: '.gitignore does not ignore .env, so local secrets could be committed.',
    });
  }

  const order: Record<FindingSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { scannedFiles: files.length, findings, scope, scannedLines };
}

/** True when nothing worse than LOW was found. */
export function isAuditClean(report: AuditReport): boolean {
  return !report.findings.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
}

export function summariseAudit(report: AuditReport): Record<FindingSeverity, number> {
  const counts: Record<FindingSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of report.findings) counts[f.severity] += 1;
  return counts;
}
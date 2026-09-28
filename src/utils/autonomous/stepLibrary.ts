// ==============================================================================
// HERMES JARVIS — AUTONOMOUS STEP LIBRARY (backlog items 40-43)
//
// The set of step kinds the goal runner can execute. Each kind is a small,
// auditable operation with a real verifier attached — never an arbitrary code
// payload from the network.
//
// A step descriptor names a kind and its arguments. Anything unrecognised is
// rejected by `buildGoalSteps` rather than executed, so a malformed or hostile
// request cannot smuggle code into the runner.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { buildReceipt, makeEvidence, type ExecutionReceipt } from '../executionTruth';
import type { GoalStep } from './goalRunner';

export const SUPPORTED_STEP_KINDS = [
  'fs.mkdir',
  'fs.writeFile',
  'fs.appendFile',
  'fs.readFile',
  'run.command',
] as const;

export type SupportedStepKind = (typeof SUPPORTED_STEP_KINDS)[number];

export interface StepDescriptor {
  id?: string;
  kind: string;
  description?: string;
  /** Absolute, or relative to `cwd` (defaults to process.cwd()). */
  path?: string;
  content?: string;
  /** Allow-listed executable plus argv for `run.command`. */
  command?: string;
  args?: string[];
  cwd?: string;
  requiresApproval?: boolean;
  retryable?: boolean;
}

/** Commands the runner will invoke. Anything else is refused. */
const COMMAND_ALLOWLIST = new Set(['git', 'node', 'npm', 'npx']);

function resolvePath(target: string, cwd = process.cwd()): string {
  return path.isAbsolute(target) ? target : path.resolve(cwd, target);
}

function runCommand(
  file: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000,
): Promise<{ code: number | null; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && typeof (err as any).code === 'string') {
        // Spawn-level failure (ENOENT, EACCES): nothing ran.
        resolve({ code: null, stdout: '', stderr: '', error: (err as any).message });
        return;
      }
      resolve({
        code: err ? ((err as any).code ?? 1) : 0,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      });
    });
  });
}

/**
 * Turn declarative descriptors into runnable steps.
 *
 * Returns the accepted steps and the ids of any rejected descriptors so the
 * caller can report exactly which kinds were unsupported.
 */
export function buildGoalSteps(descriptors: StepDescriptor[]): {
  steps: GoalStep[];
  rejected: string[];
} {
  const steps: GoalStep[] = [];
  const rejected: string[] = [];

  descriptors.forEach((d, index) => {
    const id = d.id || `step-${index + 1}`;
    const kind = String(d.kind || '');
    const description = d.description || `${kind}`;

    switch (kind) {
      case 'fs.mkdir': {
        const target = resolvePath(String(d.path), d.cwd);
        steps.push({
          id,
          description,
          requiresApproval: d.requiresApproval,
          retryable: d.retryable,
          execute: async () => {
            fs.mkdirSync(target, { recursive: true });
            return target;
          },
          verify: () => fs.existsSync(target) && fs.statSync(target).isDirectory(),
        });
        break;
      }

      case 'fs.writeFile': {
        const target = resolvePath(String(d.path), d.cwd);
        const content = String(d.content ?? '');
        steps.push({
          id,
          description,
          requiresApproval: d.requiresApproval,
          retryable: d.retryable,
          execute: async () => {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, content, 'utf-8');
            return target;
          },
          verify: () => {
            // Content is checked, not just existence: a write that silently
            // truncated or raced another writer is not success.
            if (!fs.existsSync(target)) return false;
            return fs.readFileSync(target, 'utf-8') === content;
          },
        });
        break;
      }

      case 'fs.appendFile': {
        const target = resolvePath(String(d.path), d.cwd);
        const content = String(d.content ?? '');
        steps.push({
          id,
          description,
          requiresApproval: d.requiresApproval,
          retryable: d.retryable,
          execute: async () => {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.appendFileSync(target, content, 'utf-8');
            return target;
          },
          verify: () => {
            if (!fs.existsSync(target)) return false;
            return fs.readFileSync(target, 'utf-8').includes(content);
          },
        });
        break;
      }

      case 'fs.readFile': {
        const target = resolvePath(String(d.path), d.cwd);
        steps.push({
          id,
          description,
          requiresApproval: d.requiresApproval,
          retryable: d.retryable,
          execute: async () => {
            if (!fs.existsSync(target)) return null;
            return fs.readFileSync(target, 'utf-8');
          },
          verify: (result) =>
            typeof result === 'string'
              ? buildReceipt({
                  action: 'autonomous.fs.readFile',
                  target,
                  outcome: 'VERIFIED',
                  detailEn: `Read ${result.length} characters from ${target}.`,
                  detailHi: `फ़ाइल पढ़ी गई: ${target}`,
                  evidence: makeEvidence('local_file', `Read ${target}`, { ref: target }),
                })
              : buildReceipt({
                  action: 'autonomous.fs.readFile',
                  target,
                  outcome: 'FAILED',
                  detailEn: `File not found: ${target}`,
                  detailHi: `फ़ाइल नहीं मिली: ${target}`,
                  failureReason: 'ENOENT',
                }),
        });
        break;
      }

      case 'run.command': {
        const file = String(d.command || '');
        const args = Array.isArray(d.args) ? d.args.map(String) : [];
        const cwd = d.cwd ? resolvePath(d.cwd) : process.cwd();

        if (!COMMAND_ALLOWLIST.has(file)) {
          rejected.push(`${id}:${kind}(${file || 'missing'})`);
          break;
        }

        steps.push({
          id,
          description,
          requiresApproval: d.requiresApproval ?? true,
          retryable: d.retryable,
          execute: async () => runCommand(file, args, cwd),
          verify: (result) => {
            const r = result as { code: number | null; stdout: string; stderr: string; error?: string };
            if (r.error) {
              return buildReceipt({
                action: 'autonomous.runCommand',
                target: `${file} ${args.join(' ')}`,
                outcome: 'FAILED',
                detailEn: `Command did not start: ${r.error}`,
                detailHi: 'कमांड प्रारंभ नहीं हो सका।',
                failureReason: r.error,
              });
            }
            // Exit code 0 is the OS-level proof the process ran and succeeded.
            return buildReceipt({
              action: 'autonomous.runCommand',
              target: `${file} ${args.join(' ')}`,
              outcome: r.code === 0 ? 'VERIFIED' : 'FAILED',
              detailEn:
                r.code === 0
                  ? `Command exited 0.`
                  : `Command exited ${r.code}: ${r.stderr.slice(0, 200)}`,
              detailHi: r.code === 0 ? 'कमांड सफल।' : 'कमांड विफल।',
              evidence:
                r.code === 0
                  ? makeEvidence('os_command', `${file} exited 0`, { ref: `${file} ${args.join(' ')}` })
                  : null,
              failureReason: r.code === 0 ? undefined : `exit code ${r.code}`,
            });
          },
        });
        break;
      }

      default:
        rejected.push(`${id}:${kind}`);
    }
  });

  return { steps, rejected };
}

export type { ExecutionReceipt };
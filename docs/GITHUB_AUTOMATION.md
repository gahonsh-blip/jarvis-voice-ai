# HERMES JARVIS — GitHub / Project Automation

Backlog items 14–24. This module discovers repositories, reports their real
state, runs the project's own checks, produces a reviewable fix plan, and — only
behind an explicit human approval — applies a change, retests it, and commits it
to a feature branch.

Every claim carries an `ExecutionReceipt` from `src/utils/executionTruth.ts`. A
stage that did not run is reported as `NOT_CONFIGURED`, `PERMISSION_REQUIRED` or
`FAILED`. Nothing is reported as success without evidence.

## Configuration

The module reads a token from the environment, in this order:

1. `GITHUB_AUTOMATION_TOKEN`
2. `GITHUB_TOKEN`

If neither is set, every endpoint reports `NOT_CONFIGURED` and names the missing
variable. No network call is attempted without a token.

The token needs these scopes for the full workflow:

| Scope | Needed for |
| --- | --- |
| `repo` | Reading repository, branch, commit and PR state; pushing a feature branch |
| `workflow` | Reading Actions run conclusions |
| `read:user` | Listing the repositories the token can reach |

The token is read at call time and never written to disk, logged, or included in
a receipt.

## Modules

| File | Backlog items | Purpose |
| --- | --- | --- |
| `src/utils/github/repoScanner.ts` | 14, 15, 16, 18 | Repository discovery, branch/PR/CI state |
| `src/utils/github/localHealth.ts` | 17, 21 | Real lint / test / build execution and output parsing |
| `src/utils/github/fixPlanner.ts` | 19 | Turns observed signals into an ordered fix plan |
| `src/utils/github/automationWorkflow.ts` | 20, 22, 23 | Permission-gated modify → retest → commit → push → PR |
| `src/utils/github/approvalQueue.ts` | 20, 44 | Pending human approvals with expiry |
| `src/utils/github/nightlyScheduler.ts` | 24 | Scheduling, run records, missed-run detection |

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/github/status` | Whether automation is configured; nightly schedule |
| `GET` | `/api/github/repositories` | Repositories the token can reach |
| `POST` | `/api/github/scan` | Scan one repository (`{"repository":"owner/name"}`) or all (`{"all":true}`) |
| `POST` | `/api/github/health-check` | Run real `lint` / `test` / `build` in this checkout |
| `POST` | `/api/github/fix-plan` | Build a fix plan from scan and health signals |
| `GET` | `/api/github/approvals` | Pending and settled approval requests |
| `POST` | `/api/github/approvals/:id/decision` | Record a human decision (`approved`, `decidedBy`) |
| `GET` | `/api/github/nightly` | Schedule, next run, missed-run flag, run history |
| `POST` | `/api/github/nightly/run` | Run the nightly check now (read-only) |

All endpoints answer with an explicit `outcome` field so a caller never has to
infer status from an HTTP code.

## The honesty rules

These are the behaviours the test suite exists to protect.

**A repository that cannot be read is not a clean repository.** A repo the token
cannot see returns `reachable: false` with the API's own message. The sweep totals
count it as unreachable, and the sweep's own outcome becomes `DISPATCHED` rather
than `VERIFIED`.

**A sub-read that fails is named, not hidden.** When branches, PRs or workflow
runs cannot be fetched, the repository scan is downgraded to `DISPATCHED` and the
`detailEn` string lists which part was unreadable. A malformed response body is
treated as a failed read, not as an empty list.

**A cancelled workflow run is not a failure.** `failure`, `timed_out`,
`action_required` and `startup_failure` are failures. `cancelled`, `stale`,
`skipped` and `neutral` are recorded separately as aborted runs and produce a
low-risk manual review step. This distinction is why the aborted-run test exists:
an over-eager failure count would raise a false alarm.

**A 404 on the Actions API means CI is not configured.** It is a real answer, not
a read failure, so a repository without Actions is still scanned as `VERIFIED`.

**A check that cannot run is not a failed check.** `localHealth` reads
`package.json` before running anything. If the script is absent, the outcome is
`NOT_CONFIGURED` with the script name in the message, rather than npm's non-zero
exit being read as a broken build.

**A hung check is killed and reported as a timeout.** Long-running checks are
terminated by process group after the timeout, and the outcome is `FAILED` with
`CHECK_TIMEOUT`. The runner does not wait for the orphaned pipe to close.

**A missing test summary is not zero failures.** `parseVitestOutput` returns
`undefined` when the runner printed no recognisable counts. The caller must
treat that as unknown, not as a pass.

## The approval gate

`modifyAndPropose` walks this pipeline and stops at the first refusal:

```
PLANNING → CHECKING → FOUND → ASKING_PERMISSION → APPROVED
         → EXECUTING → VERIFYING → COMPLETED | FAILED | BLOCKED
```

Four gates protect the repository:

1. **The target branch name must not be protected.** `main`, `master`, `trunk`,
   `develop`, `production` and `prod` are refused as a write target. The check is
   case-insensitive and tolerant of surrounding whitespace.
2. **The current checkout must not be on a protected branch.** This prevents a
   change being applied on top of `main` by accident.
3. **A human must approve.** The default gate is `denyingApprovalGate`, which
   refuses everything. A deployment must wire in a real approver (the HUD or the
   Telegram confirmation flow) before any change can be applied. The approval
   prompt shows the summary, the risk level, the files, and the branch.
4. **Post-change checks must pass.** The configured checks are rerun against the
   modified workspace. If any fails, the change is left applied but uncommitted,
   the outcome is `FAILED`, and the receipt says nothing was committed.

Only after all four does the pipeline commit, and only if `push: true` was passed
does it push — always to the feature branch, never to a protected one.

A failed push or a failed PR step does not leave the result reading as success:
a push failure makes the outcome `FAILED`, and a PR failure after a successful
push makes it `DISPATCHED`. In both cases the commit SHA is returned, because the
commit is real even when the delivery step was not.

### Approval requests expire

`ApprovalQueue` holds a request open for a fixed TTL (15 minutes by default) and
then resolves it as **denied** with the reason recorded. An unanswered request is
never an implicit yes, and a late approval cannot revive an expired record.

## The nightly check

`runNightlyCheck` is registered in the server scheduler at **03:00 IST**. It is
strictly read-only: it scans repositories and prepares a plan, and never edits,
commits or pushes. This is deliberate — an unattended write is exactly what the
approval gate exists to prevent.

Each run records scanned count, unreachable count, repositories with failing CI,
repositories with open PRs, and planned step count. A run that could not scan
anything is recorded as `FAILED` with the API's reason, not as a quiet night.

`nightlyHistory` reports a `missedRun` flag when the last completed run predates
the previous scheduled slot, for example because the process was offline. The gap
is surfaced rather than silently skipped.

## Tests

| File | Covers |
| --- | --- |
| `src/tests/githubRepoScanner.test.ts` | Discovery, scanning, failure and partial-scan handling |
| `src/tests/githubLocalHealth.test.ts` | Real process execution, parsing, timeouts, missing scripts |
| `src/tests/githubAutomationWorkflow.test.ts` | Branch guards, approval paths, real commits in a temp repo |
| `src/tests/githubFixPlanner.test.ts` | Plan derivation, scheduling, missed-run detection |
| `src/tests/githubApprovalQueue.test.ts` | Approval, rejection, expiry, idempotent decisions |

The workflow tests build a real git repository in a temp directory and assert
against real branches and commits — nothing is mocked. The health tests run real
`tsc` and real npm scripts, including one that hangs and one that exits non-zero.

Run them with:

```bash
npx vitest run src/tests/githubRepoScanner.test.ts src/tests/githubLocalHealth.test.ts \
  src/tests/githubAutomationWorkflow.test.ts src/tests/githubFixPlanner.test.ts \
  src/tests/githubApprovalQueue.test.ts
```

## Known limitations

- **No PR is merged automatically, and none ever will be.** `modifyAndPropose`
  can create a pull request, but merging into the default branch is a human
  decision outside this module.
- **No automated code repair implementation ships here.** `executeFixPlan`
  requires a `materialize` function to turn a plan step into a concrete change.
  Without one, each step is reported as `NOT_CONFIGURED`. This is intentional:
  automated modification is only enabled where a real strategy exists and a human
  has approved it.
- **`describeFixScope` does not read or modify code.** It reports candidate files
  for a human to review before approving; it does not resolve the fix itself.
- **Sequential scanning.** `scanAllRepositories` scans repositories one at a
  time, which is friendlier to the API rate limit but slower on large accounts.
- **Nightly timing is IST-only.** The scheduler reuses the existing IST clock
  rather than a general timezone configuration.
- **The repository listing is capped at 100 repos** by the `/user/repos`
  pagination. Accounts larger than that need pagination, which is not yet
  implemented.
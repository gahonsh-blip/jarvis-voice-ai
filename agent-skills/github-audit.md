# Repository audit playbook

1. `GET /user/repos` and list every repo with language, size and pushed_at. Empty repos (size < 20KB, no code) get built from scratch or archived.
2. Clone with depth 1 into a temp folder. Run `npm ci` then `npm run build` and `npm test`. Record the exact failing command.
3. CI red for months is usually resource exhaustion: 196 test files in parallel runs out of memory. Fix with `--maxWorkers=2`, not by deleting tests.
4. Permission-shaped failures inside a sandbox are not product bugs. Re-run as a normal user before reporting.
5. Grep for secrets: `firebase apiKey`, `AIza`, `sk-`, `.pem`, `service_role`. Remove the file and rotate the key; deleting the commit is not enough.
6. Every repo needs a README with: what it does, how to run, env vars, live URL, status. Add it if missing.
7. Write the final report per repo: found, fixed, still open, who must act.

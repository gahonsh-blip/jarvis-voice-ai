# Supabase playbook

- Run SQL in the SQL Editor, not through a client that rewrites quotes. Paste only SQL; stray prose causes syntax errors at line 1.
- Vault secrets: `select vault.create_secret('https://app.example.com','app_url');` then read with `select decrypted_secret from vault.decrypted_secrets where name='app_url';`
- pg_cron needs the extension in `extensions` schema, and the job body should read the secret instead of hardcoding it.
- Empty string is not null. A text column compared to a timestamp fails; convert `''` to `null` in the adapter before insert.
- RLS: enable, then write the policy for `auth.uid() = user_id`. Test as an anonymous client, not as the dashboard owner.
- After any schema change, re-fetch one row through the public API to prove the client still reads it.

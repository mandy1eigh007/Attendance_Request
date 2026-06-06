# CLAUDE.md — start here

**Read `HANDOFF.md` in this repo IN FULL before doing anything.** It is the complete transferred working
memory for this project (architecture, state, what's shipped, what's pending, Signal integration, how to
deploy, how to work with Mandy).

Non-negotiables for cohotrack:
- **This is a PUBLIC repo — NEVER commit secret values** (admin password, Supabase service/anon keys,
  EmailJS private key, GitHub tokens, phone numbers, server IPs). Secrets live in Cloudflare Pages env vars
  and Supabase secrets, referenced by name only.
- **`main` AUTO-DEPLOYS to production** (`cohotrack.pages.dev`). `node --check` every Function you touch,
  reason through the logic, and confirm anything risky with Mandy before pushing. No half-baked pushes.
- **All DB access goes through Cloudflare Pages Functions** with the service-role key (RLS is on, no anon
  policies) — the browser never talks to Supabase directly.
- **`functions/respond.js` only ROUTES to the dashboard, never DECIDES** approve/deny — preserve this
  (the "auto-deny fix", commit `cd79974`). Don't re-add email-link decisions.

See `HANDOFF.md` for everything else.

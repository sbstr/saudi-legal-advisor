# المستشار القانوني الذكي (Saudi Legal Advisor)

Arabic chat assistant for preliminary guidance on Saudi laws and regulations, powered by the Anthropic API. Not a substitute for a licensed lawyer.

Accounts can sign up with email/password or Google Sign-In. New accounts get one free
consultation; after that, chat access requires an active paid plan (see `data/plans.json`
for the tiers shown on the pricing page). Payment collection itself is not wired up yet —
the pricing page shows the tiers and prompts users to contact you until a payment gateway
(e.g. Moyasar/HyperPay/Stripe) is integrated.

## Run locally

```bash
cp .env.example .env
# add your ANTHROPIC_API_KEY, and generate a JWT_SECRET (see .env.example), to .env
npm start
```

Open http://localhost:4174

`npm start` loads `.env` via Node's `--env-file` flag, which requires Node 20.6+.

## Enabling "Sign in with Google" (optional)

Without a `GOOGLE_CLIENT_ID`, the app still works fully with email/password — the Google
button is simply hidden. To enable it:

1. Go to https://console.cloud.google.com/apis/credentials (create/select a project first).
2. Click **Create Credentials → OAuth client ID**.
3. If prompted, configure the OAuth consent screen first (External user type is fine for
   a public app; add your app name and support email).
4. Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add the exact origin(s) you'll serve the site
   from, e.g. `http://localhost:4174` for local dev and your production domain
   (`https://yourdomain.com`) once deployed. No redirect URIs are needed — the app uses
   Google Identity Services' one-tap/button flow, not a redirect-based OAuth flow.
6. Copy the generated **Client ID** into `GOOGLE_CLIENT_ID` in `.env`.
7. Restart the server. The Google button should now appear on the login screen.

## Structure

- `index.html`, `styles.css`, `app.js`, `auth.js` — static chat UI, login/register forms, and session handling
- `pricing.html`, `pricing.js` — subscription plans page (`data/plans.json`)
- `backend/server.js` — zero-dependency Node HTTP server: serves static files, proxies chat requests to the Anthropic API, and exposes the auth/plans API routes
- `backend/auth.js` — session tokens, password hashing, Google ID token verification
- `backend/users.js` — JSON-file user store, free-trial/plan quota logic (`data/users.json`, gitignored — never commit it, it holds emails and password hashes)
- `docs/system-prompt.md` — the system prompt that defines the advisor's persona, legal scope, and methodology

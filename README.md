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

## Publishing to app stores

The app is now a fully installable **Progressive Web App** (PWA): `manifest.json` +
`service-worker.js` give it a home-screen icon, offline app shell, and standalone
(no-browser-chrome) window, which is the actual technical prerequisite for store
publishing either way. `privacy.html` and `support.html` are also in place — both
Google Play and Apple's App Store require a working privacy policy URL before they'll
review a listing.

What's **not** done here, because it needs tools and accounts this environment doesn't
have:

- **Android (Google Play)**: the realistic path from a PWA is a Trusted Web Activity,
  generated with [PWABuilder](https://www.pwabuilder.com/) (paste your deployed HTTPS
  URL in, it packages an `.aab` for you) or Google's own
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) CLI (needs a JDK + Android
  SDK installed locally). Either way you need a Google Play Console developer account
  (one-time $25) and a signing key.
- **iOS (App Store)**: requires wrapping the PWA (e.g. with
  [Capacitor](https://capacitorio.com/)) and building through Xcode **on a Mac**, plus
  an Apple Developer Program account ($99/yr). This cannot be built from this Windows
  machine — PWABuilder can also scaffold the iOS project for you to hand to a Mac/Xcode.
- The site must be deployed to a real **HTTPS domain** first (service workers and app
  store review both require it) — set `COOKIE_SECURE=true` once it is.
- Replace `icons/*.png` — they're programmatically generated placeholders (see
  `scripts/generate-icons.js`), not a real logo. Store listings also need extra
  marketing assets (screenshots, feature graphic) that aren't part of the app itself.

## Structure

- `index.html`, `styles.css`, `app.js`, `auth.js` — static chat UI, login/register forms, and session handling
- `pricing.html`, `pricing.js` — subscription plans page (`data/plans.json`)
- `privacy.html` — privacy policy (draft — have it reviewed against Saudi PDPL before relying on it)
- `support.html`, `support.js` — FAQ + contact form, posts to `/api/support`
- `manifest.json`, `service-worker.js`, `pwa.js`, `icons/` — PWA installability (home-screen install, offline app shell)
- `backend/server.js` — zero-dependency Node HTTP server: serves static files, proxies chat requests to the Anthropic API, and exposes the auth/plans/support API routes
- `backend/auth.js` — session tokens, password hashing, Google ID token verification
- `backend/users.js` — JSON-file user store, free-trial/plan quota logic (`data/users.json`, gitignored — never commit it, it holds emails and password hashes)
- `backend/support.js` — JSON-file support ticket store (`data/support-tickets.json`, gitignored)
- `docs/system-prompt.md` — the system prompt that defines the advisor's persona, legal scope, and methodology

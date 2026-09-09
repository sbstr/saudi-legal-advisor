# المستشار القانوني الذكي (Saudi Legal Advisor)

Arabic chat assistant for preliminary guidance on Saudi laws and regulations, powered by the Anthropic API. Not a substitute for a licensed lawyer.

## Run locally

```bash
cp .env.example .env
# add your ANTHROPIC_API_KEY to .env
npm start
```

Open http://localhost:4174

## Structure

- `index.html`, `styles.css`, `app.js` — static chat UI
- `backend/server.js` — zero-dependency Node HTTP server: serves the static files and proxies chat requests to the Anthropic API
- `docs/system-prompt.md` — the system prompt that defines the advisor's persona, legal scope, and methodology

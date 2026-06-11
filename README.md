# aistudio

A minimal, self-hosted Lovable alternative. Sign in, describe an app, and chat it into existence: the builder writes browser-runnable files, you see a live preview on the right, console errors can be fixed with one click, and every app is shareable by link (private, public, or specific emails).

Apps you build can use AI themselves via the injected `window.ai.chat()` — powered by this server's OpenRouter key, no keys needed inside generated apps.

## Stack

- Next.js 16 (App Router) + React 19, Tailwind v4
- Clerk — authentication
- Turso (libSQL) — projects, chat history, virtual files
- OpenRouter — builder chat + in-app AI proxy

## Local development

```bash
bun install
cp .env.example .env.local
```

Fill in `.env.local`:

1. **Database**: set `TURSO_DATABASE_URL=file:local.db` (no token needed) or use a real Turso DB.
2. **Clerk**: create an app at [dashboard.clerk.com](https://dashboard.clerk.com), copy the publishable + secret keys.
3. **OpenRouter**: create a key at [openrouter.ai/keys](https://openrouter.ai/keys).

Then:

```bash
bun dev
```

Tables are created automatically on first request.

## Deploying to Vercel

```bash
# one-time setup
turso auth login
turso db create aistudio
turso db show aistudio --url          # -> TURSO_DATABASE_URL
turso db tokens create aistudio      # -> TURSO_AUTH_TOKEN

vercel link
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_SECRET_KEY production
vercel env add OPENROUTER_API_KEY production

# deploy
bun run deploy
```

For Clerk in production, use a production instance's keys and add your Vercel domain in the Clerk dashboard.

## How generated apps run

Each project's files live in the database. `/p/<id>` composes them into a single HTML document (local `styles.css` / `app.js` references are inlined), injects a small runtime, and serves it inside a sandboxed origin (CSP `sandbox`), so generated code can never touch aistudio cookies or APIs with a viewer's credentials.

The injected runtime provides:

- `window.ai.chat(prompt | messages, { system?, json? })` — AI via the server's OpenRouter key
- console/error forwarding to the workspace console (the "Fix with AI" loop)
- an in-memory `localStorage` shim (real storage is unavailable in an opaque origin)

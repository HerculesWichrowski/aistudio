# aistudio

A minimal, self-hosted Lovable alternative. Sign in, describe an app, and chat it into existence: the builder plans the change, generates browser-runnable files one by one, validates them before they're saved, and shows a live preview on the right. Every app is shareable by link (private, public, or specific emails), restorable to any earlier version, and downloadable as a single HTML file.

Apps you build can use AI themselves via the injected `window.ai.chat()` and persist data via `window.db` — powered by this server, no keys needed inside generated apps.

## Features

- **Chat-to-app building** — a planning pass streams a short reply and a hidden build plan (which files to create/update/delete, with a one-line brief per file), then each file is generated in dependency order with the briefs as the cross-file contract.
- **Self-healing builds** — every generated JS/JSON/HTML file is statically validated (acorn syntax parse, JSON shape checks, truncation detection). Failures trigger one corrective regeneration with the error fed back; unresolved `@app/` imports get their missing modules generated automatically.
- **Live preview** with desktop / tablet / phone widths, console capture, and one-click **"Fix errors with AI"**.
- **Click-to-edit** — toggle the crosshair, click any element in the preview (shadow DOM aware), and your next message carries that element and its component file as context.
- **Version history** — every build checkpoints the files it's about to change; restore any checkpoint with one click (restores are themselves checkpointed, so they're undoable).
- **Built-in database** — apps declare tables in `database.rules.json` and get validated CRUD via `window.db`; rows are browsable/editable in the workspace's Data tab.
- **Built-in AI proxy** — `window.ai.chat()` inside generated apps, rate-limited per project+IP.
- **Sharing & portability** — private / public / email-restricted links, project duplication, and single-file HTML export that keeps `window.ai` / `window.db` working.
- **Model picker** — free OpenRouter models out of the box; add a per-project OpenRouter key to unlock paid models, the Auto router, and custom model IDs.

## Stack

- Next.js 16 (App Router) + React 19, Tailwind v4
- Clerk — authentication
- Turso (libSQL) — projects, chat history, virtual files, build runs/checkpoints
- OpenRouter — builder chat + in-app AI proxy
- acorn — server-side syntax validation of generated JS
- bun:test — engine test suite

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
bun dev        # start the app
bun test src   # run the engine test suite
bun run lint   # eslint
bun run typecheck
```

Tables are created/migrated automatically on first request.

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

## How the build engine works

A build is a server-side **run** (`build_runs` table) that survives page reloads — the workspace just polls the run's snapshot. Sending a message:

1. **Plan** (`src/lib/builder.ts` → `generatePlan`): one streaming completion produces the visible chat reply plus a hidden `build_plan` block:

   ```json
   {"summary":"...","upsert":[{"path":"components/todo-list.js","brief":"<todo-list>: renders rows from window.db 'todos', fires 'todo-toggled'"}],"delete":[]}
   ```

   The per-file **briefs are the contract** that keeps independently generated files consistent (element tags, events, exports). If the model forgets the block, a repair completion and finally keyword-based path inference (`src/lib/plan.ts`) recover it.

2. **Checkpoint**: before any file changes, the current file tree is snapshotted onto the run (this powers version history / restore).

3. **Generate** (`generateFile`): files are produced one at a time in dependency order (`database.rules.json` → `lib/` → `components/` → `styles.css` → `app.js` → `index.html`). Each call sees the project structure, the relevant file contents (budgeted in `src/lib/context.ts`), the plan briefs, and everything generated earlier in the same run.

4. **Validate** (`src/lib/validate.ts`): JS is parsed with acorn (module mode), JSON is parsed (plus a shape check for `database.rules.json`), HTML is checked for a complete document. A failed file is regenerated once with the validation error as feedback; if it still fails, the best attempt is saved and the file chip shows the error.

5. **Complete** (`src/lib/imports.ts`): after the planned files, any `@app/` imports that don't resolve to a real file get their modules generated too (bounded), so the preview doesn't break on a forgotten file.

6. **Reply**: the assistant message is stored with a `file_operation` block that renders as clickable file chips in chat.

## How generated apps run

Each project's files live in the database. `/p/<id>` composes them into a single HTML document (`src/lib/compose.ts`):

- local `styles.css` / classic scripts are inlined; local ES modules are mapped to `@app/...` data-URL entries in the import map (`src/lib/module-compose.ts`)
- bare npm imports missing from the page's import map are auto-resolved to esm.sh (subpaths reuse the pinned version of the mapped package root), so a model forgetting an import-map entry doesn't crash the app
- a small runtime is injected, and the document is served in a sandboxed opaque origin (CSP `sandbox`), so generated code can never touch aistudio cookies or APIs with a viewer's credentials

The injected runtime provides:

- `window.ai.chat(prompt | messages, { system?, json? })` — AI via the server's OpenRouter key (rate-limited per project + IP)
- `window.db.list/get/insert/update/delete(table, ...)` — schema-validated persistence backed by `database.rules.json`
- console/error forwarding to the workspace console (the "Fix with AI" loop)
- an inspect mode used by the workspace's click-to-edit (shadow-DOM-aware element picking)
- an in-memory `localStorage` shim (real storage is unavailable in an opaque origin)

"Download HTML" exports exactly this composed document — it runs anywhere and keeps calling back to your deployment for AI and data.

## Project layout

```
src/
  app/                  # routes (App Router)
    api/                #   chat, files, messages, models, build-runs,
                        #   projects (+ data/duplicate/export/history/restore),
                        #   app-ai + app-data (public, rate-limited), p/[id]
  components/
    AppWorkspace.tsx    # workspace orchestrator
    workspace/          # Composer, Messages, CodePanel, DataPanel, PreviewPane,
                        # ConsoleDock, History/Settings dialogs, useBuildRun hook
  lib/
    builder.ts          # LLM orchestration (plan + per-file generation)
    prompts.ts          # system prompts
    plan.ts             # pure plan/file-fence parsing (client-safe)
    llm.ts              # OpenRouter streaming/completions + context assembly
    context.ts          # file-content selection under a char budget
    validate.ts         # static validation of generated files
    imports.ts          # ES-module import scanning / missing-import detection
    execute-build.ts    # the build-run state machine
    build-runs.ts       # run persistence, snapshots, history
    compose.ts          # app composition + injected runtime
    module-compose.ts   # import-map handling + esm.sh auto-resolution
    database.ts/rules.ts# window.db rules + data operations
    rate-limit.ts       # in-memory limiter for public app APIs
  lib/__tests__/        # bun:test suite for the engine
```

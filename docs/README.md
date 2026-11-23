# Skeleton Crew: Docs Index and Status

Last updated at the end of the first design session. Read this file first.

## 1. What this project is

A reusable app skeleton (a template repository) for paid and freemium APIs with a companion website, server-centered, with occasional mobile apps. It is also an entry for the Kiroween 2026 hackathon, Skeleton Crew category.

The skeleton is the focus. It must serve future projects too, not only the two apps planned to prove it. Each app lives in its own repository, created from the skeleton. There is no monorepo.

Core ideas:

- Functions are small steps chained into strips (one strip per feature). Every step returns a `Result`, so a failure can never be mistaken for a value.
- Each step declares what it takes, returns, and touches. Each strip declares a permission budget. A generated catalog lists them all.
- Databases, caches, storage, payments, and similar services sit behind ports with swappable adapters.
- Apps run fully offline on a PC for development and demos, with dev data kept separate from production data.
- Rules are enforced by scripts and hooks that list every violation, not by instructions the agent has to remember.

## 2. Status

| Item | State |
|---|---|
| Design documents (below) | Written, draft |
| `scripts/check-coverage.mjs` | Built and tested. Checks a filled-in app coverage file. |
| `.kiro/specs/enforcement-setup/requirements.md` | Approved |
| `.kiro/specs/enforcement-setup/design.md` | Written, awaiting review. Tasks not started. |
| `.kiro` steering, hooks, custom agent | Not created (specified in the enforcement-setup spec) |
| Conformance script (checks the code rules) | Not created, designed in plan section 15 |
| Skeleton code (`Result`, `defineStep`, `defineStrip`, ports, adapters) | Not created |
| Storybook setup | Not created |
| Any app | Not started, and out of scope for the skeleton work |

## 3. Documents

| File | Contents |
|---|---|
| `function-strips-plan.md` | Main design: error model, step wrapper, function classes, manifests and permissions, strips, catalog, ports rules, cache rules, logging, Storybook, enforcement, decisions |
| `provider-ports.md` | Port list, per-port decisions, contract tests, how to switch a provider |
| `environments.md` | Profiles (`local`, `dev`, `staging`, `prod`), offline local mode, data separation, provider differences between dev and prod |
| `app-parts-checklist.md` | 63 parts of an app, grouped, with a build order |
| `app-coverage.template.md` | Copy per app. Mark each of the 63 items `planned`, `unplanned`, `not-needed`, or `deferred` |
| `../scripts/check-coverage.mjs` | `node scripts/check-coverage.mjs <file> [--strict]` validates a coverage file |

## 4. Decisions made

Skeleton decisions:

1. Own code for `Result`, `defineStep()`, and `defineStrip()`.
2. Strips run on the server only, at first. The UI gets `Result`-shaped props.
3. Apps start from a GitHub template repository. Core folders (`lib/`, `ports/`, `adapters/`) stay separable so a package is possible later.
4. Auth uses a library behind a port. Which library is open.
5. Scope order: core (checklist items 1 to 9 and 48 to 50), then billing, entitlements, metering, and rate limits (10 to 13). Ingestion and marketplace features stay in the apps until two apps need the same thing.
6. The database port has no raw queries, only named methods.
7. `no-console` everywhere. Only the logger adapter may call `console`.
8. UI previews through Storybook, to avoid running the heavy app on a low-spec PC.
9. Errors carry an `audience` field (`user` or `internal`, default `internal`). Only `user` errors reach toasts, with a written `userMessage`.
10. Steps report facts (`kind`). Strips decide routing and presentation.

Platform decisions:

- Web and API hosting target: Cloudflare Workers through the OpenNext adapter.
- The skeleton promises swappable data and service adapters. It does not promise leaving the Worker runtime.
- Databases and ingestion are chosen per app. The apps planned so far use PocketBase (SQLite) with a Go scraping program on a VPS or PocketBase Cloud, and one of them may move to a Supabase-based production database.
- Each app must run offline on a PC for development and demos, and keep its dev environment after production launches.

## 5. Still open

Decide when building the part concerned:

- Lint strictness at first.
- Where production logs go.
- How a deliberate permission widening is approved.
- Timestamp format at the database port.
- Auth library.
- Mailer, notifier, and LLM providers.
- Whether `staging` is required when dev and prod databases differ.
- How seed and demo data are defined, and whether demo mode differs from `local`.

Per app (not skeleton decisions):

- Which local database each app uses.
- Where PocketBase is hosted and how the web and API reach it.
- How an external ingestion program writes into the database.
- Whether a platform database (such as Supabase) is used as plain Postgres or as a whole platform.

## 6. Problems this design answers

Taken from past trouble described during the session.

| Problem | Design answer | Where |
|---|---|---|
| Errors look like output, especially when everything is a string | `Result` type, errors as a separate shape, lint against returning `error.message` | plan 4, 5 |
| Minified or anonymous functions in error reports | Explicit step name strings, source maps, component stacks | plan 4, 5 |
| Hard to follow one feature across functions | `stripId` on every log line, one trace per strip | plan 13 |
| Some errors must reach the user, most must not | `audience` field, `userMessage`, generic message plus reference code for the rest | plan 4, 8 |
| Functions shaped to one provider (SQL) | Domain-term ports, import boundary, two adapters, contract tests | plan 11, ports |
| Cache and local storage corruption after switching or turning off | Versioned envelopes, corrupt equals miss, namespaced keys, cache-off tested, no browser storage before hydration | plan 12 |
| Similarly named functions confused | Unique structured names, generated catalog, near-duplicate warning | plan 9 |
| Agent reuses a step with the wrong inputs, outputs, or too much permission | Step manifests, strip permission budgets, injected ports, no widening of existing steps | plan 7, 8, 10 |
| Agent applies a requirement to a few functions, then skips the rest | Conformance script lists every violation, a Stop hook blocks finishing until it passes | plan 15 |
| Dev and prod data mixing | Separate instances and credentials, startup host guard, destructive commands refuse on prod | environments 4 |
| Dev database differs from production database | Contract suite on both engines in CI, optional staging | environments 5 |

## 7. How Kiro features fit (from Kiro's documentation)

- **Steering** (`.kiro/steering/*.md`): `always` loads every time. `fileMatch` loads when matching files are in play (for example `src/steps/db/**`). `manual` loads on request. `auto` loads when the request matches its description. `#[[file:path]]` pulls another file in.
- **Hooks** (`.kiro/hooks/*.json`): a command or an agent prompt on an event. A command hook that exits with an error on a Stop event sends the agent back to work. A pre-tool hook can block an action. Prompt-submit hooks cannot block.
- **Specs** (`.kiro/specs/<name>/`): requirements, design, and tasks. They are not loaded automatically. They enter context through the spec workflow or an explicit reference.
- **Custom agents** do not load steering unless it is listed under `resources`. Resources have a size budget (documented as 32 files and 100,000 characters in total), so steering must stay short.
- **Compaction** summarizes older conversation, so details given early can be lost. This is why requirements are enforced by checks.
- File-save and file-create hooks fire only for the agent's changes, not manual edits.

## 8. Needs verifying before relying on it

- Exact hook trigger names (check `/hooks` or the hook docs when writing them).
- Cloudflare: current runtime limits, local emulation of bindings, D1 transaction behavior, rate-limit options.
- PocketBase: deployment, backups, local migrations. It runs as a long-lived server with a local SQLite file, so it does not run inside a Worker.
- Supabase: local development options.
- Paystack: payout, split, and transfer support.
- Storybook: whether a Vite-based builder works with the installed Next.js version.
- Kiroween official rules (see below).

## 9. Risks and cautions noted

- **Source terms.** Scraped content can be protected by copyright and terms of use, and public availability does not mean commercial reuse is allowed. Check each source's terms and license before republishing it through a paid API. This matters most for third-party reference sites. Keep source, URL, fetch time, and license note on each record.
- **Medical or safety-related data.** If answers could affect health, show sources and disclaimers, and treat model output as data, not instructions.
- **Payments.** Sources describe Nigeria and Ghana as markets where Stripe operates through its Paystack network, not through standard direct accounts. Check current terms.
- **App store billing.** Mobile apps that sell subscriptions usually must use the store's purchase system.
- **Eventually consistent caches.** Workers KV updates can take up to about 60 seconds to appear globally (per OpenNext docs). Do not keep counters, balances, or order state there.
- **Different database engines in dev and prod** hide some bugs. The contract suite and staging reduce this, and do not remove it.

## 10. Competition notes

- Category: Skeleton Crew, Kiroween 2026. Entries describe it as a template lean enough to be clear but flexible enough to support two distinct apps.
- Submissions close December 4 at 2:00 PM PT, per kiro.dev/events (not re-checked since).
- The official rules have not been read. Check Devpost for requirements, such as whether two demo apps are mandatory.
- A small number of areas working end to end, plus a clear module pattern for the rest, will likely show better than a long list of stubs.

## 11. Next steps

1. Write the `.kiro` setup: an `always` steering file, `fileMatch` steering per function class, and the Stop hook.
2. Write the conformance script.
3. Build the core: `Result`, `defineStep()`, `defineStrip()`, the logger port, and the first ports with two adapters each.
4. Prove it with one small example strip, including its Storybook stories.
5. Create the template repository, then start each app from it.

Steps 1 to 4 are good candidates for Kiro's spec workflow (requirements, design, tasks), reviewed one stage at a time before any code is written.

## 12. Sources

- Kiro docs: [steering](https://kiro.dev/docs/steering.md), [hooks](https://kiro.dev/docs/hooks.md), [specs](https://kiro.dev/docs/specs.md), [custom agents](https://kiro.dev/docs/custom-agents.md), [compaction](https://kiro.dev/docs/compaction.md)
- [Kiro events](https://kiro.dev/events/)
- Cloudflare: [OpenNext adapter docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [adapter announcement](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/), [OpenNext caching notes](https://opennext.js.org/cloudflare/former-releases/0.5/caching)
- Payments: [Stripe Nigeria payment methods](https://docs.stripe.com/payments/countries/nigeria?locale=en-GB), [Paystack on Stripe in Nigeria](https://paystack.com/stripe/nigeria)

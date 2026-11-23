---
created: 2026-11-23
updated: 2026-11-23
---

# App Planning Process (Draft v0.1)

How an app built from this skeleton is planned, before any feature spec. Feature work after planning follows `change-process.md`.

## 1. Principles

1. **No assumption becomes a plan.** Anything the agent would otherwise assume is written as a question with a proposed default.
2. **Every default is shown before it is applied.** A proposed default is not a decision. It becomes one only when the user confirms or changes it. This is the purpose of the plan documents.
3. **Questions are asked per stage**, in small batches, never all at once.
4. **No fixed question bank.** The stages and their required topics are fixed. The questions are written for the app at hand, from what earlier stages already settled.
5. **No question the documents already answer.** The agent reads the earlier stages and the skeleton docs first.
6. **Answers live in the documents**, not only in the chat.
7. **Approved means committed.** A stage document is approved when the user commits it with all decisions confirmed. The next stage starts only then.

## 2. Stages

Each stage produces one short document in the app repository's `docs/plan/`, reviewable in one sitting.

| # | Stage | Document | Repeats for every app |
|---|---|---|---|
| 1 | App brief | `01-brief.md` | Yes |
| 2 | Architecture | `02-architecture.md` | Yes |
| 3 | Domain model | `03-domain.md` | Yes |
| 4 | Feature map | `04-features.md` | Yes |
| 5 | Feature specs | `.kiro/specs/<feature>/` | Once per feature, following `change-process.md` |

Stages 1 to 4 happen for every app. Their topics are the same each time, and the questions within them differ per app.

### Stage 1: App brief

Required topics:

- Problem and the people who have it.
- Users and roles.
- Revenue model (paid, freemium, free) and what is charged for.
- Platforms (API, website, mobile) and which come first.
- Countries, languages, currencies, and legal constraints that follow from them.
- Hard constraints (deadlines, budget, hardware, offline needs).
- What is explicitly out of scope.

Also produced: the app's coverage file (`docs/coverage/<app>.md`, from `app-coverage.template.md`), with each of the 63 items given a proposed status and reason.

### Stage 2: Architecture

Required topics:

- The adapter for each port in each profile (`local`, `dev`, `prod`), per `environments.md`.
- Programs that run outside the app (for example a separate scraper or worker), where they run, and how they exchange data with the app.
- Hosting for each part.
- Which data each part owns and writes.
- External services and their test or sandbox options.
- Offline local setup and demo data.

### Stage 3: Domain model

Required topics:

- Entities and their fields at the level steps need (names, keys, ownership).
- Who owns each record, and who may read or change it.
- Lifecycles and state changes (for example an order's states and allowed transitions).
- Rules that must always hold.
- Data from outside sources, with provenance fields.

Strip permissions and step manifests refer to these entities, so this stage comes before features.

### Stage 4: Feature map

Required topics:

- Features, each broken into strips.
- For each strip: trigger, receiver, end states (success, user error, internal error), and the entities it reads and writes.
- Releases, with a small first slice that can be demonstrated end to end.
- Which skeleton parts each release needs, linked to the coverage file.

## 3. How questions are asked

For each stage, the agent:

1. Reads the skeleton docs and every approved earlier stage.
2. Writes a draft of the stage document. Every point it cannot take from an earlier answer is written as a decision row with status `proposed` and a default.
3. Lists the questions in the chat, in a small batch, grouped by topic. Each question shows its proposed default and the reason for it.
4. Tags each question:
   - **decide now**: the stage cannot be approved without it.
   - **decide later**: it can wait until a later stage or a feature spec. It stays visible in the document with its default.
   - **skeleton**: it concerns the skeleton, not this app. It is moved to the skeleton's docs.
5. Updates the document with the answers. Confirmed defaults become `confirmed`. Changed ones become `changed`, with the user's answer.
6. Repeats until no `decide now` item is still `proposed`.

A question is only asked if its answer changes the plan. Questions are written in the user's terms, and a question the user did not understand is rephrased, with an explanation of why it matters, rather than skipped.

## 4. Decision rows

Every stage document ends with a decisions table:

```markdown
## Decisions

| ID | Topic | Decision | Status | Reason |
|---|---|---|---|---|
| B3 | Revenue | Freemium: free tier with a monthly quota, paid plans by request volume | proposed | Matches the API-with-website model |
| B4 | First platform | API and website first, mobile later | confirmed | |
| A2 | Production database | Different provider from dev | changed | User: "prod might use Supabase" |
```

Statuses:

- `proposed`: a default the agent suggests. Not yet a decision.
- `confirmed`: the user accepted the default.
- `changed`: the user gave a different answer, recorded in the Decision column.
- `deferred`: deliberately left for later, with the stage or condition that will settle it.

Rules:

- A stage cannot be approved with any `decide now` row still `proposed`.
- Later stages may rely only on `confirmed` and `changed` rows. A later stage that needs a `proposed` or `deferred` row must ask about it first.
- IDs are prefixed by stage (`B` brief, `A` architecture, `D` domain, `F` features) so later documents and specs can cite them.

A future check can parse these tables, like the coverage checker does, and fail when an approved document still contains `proposed` rows in the `decide now` set.

## 5. Traceability

- Every strip in the feature map cites the entities (stage 3) it reads and writes.
- Every feature spec cites its feature map entry and the decision IDs it depends on.
- Every coverage item marked `planned` points to the stage document or spec that covers it.
- A future check can flag a strip in the code that is not in the feature map, and a feature with neither a spec nor a `deferred` status.

## 6. What the agent must not do during planning

- Write code, create repositories, or scaffold projects.
- Pick a provider, host, or library without showing it as a proposed default.
- Treat an example the user mentions ("a site like that") as a decision.
- Merge decisions across apps. Each app is planned in its own repository.
- Move to the next stage before the current one is approved.

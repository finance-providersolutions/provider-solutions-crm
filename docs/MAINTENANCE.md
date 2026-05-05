# MAINTENANCE — keeping STATE.md and ROADMAP.md useful

These two docs exist to keep mobile brainstorming sessions in claude.ai chat in sync with what is actually true in this app. They are not for documenting code; the code documents itself. They are for situational awareness when Jason is on his phone thinking about what to build next.

## What to update, when

Update STATE.md whenever any of the following changes:

- Architecture — providers added or removed, page or hook structure reshaped, routing model changed, auth flow altered, file layout reorganized in a way that affects mental model.
- Integrations — a new external system wired in, an existing integration retired, a Supabase project change, a hosting move, a new storage bucket, a new edge function.
- Core domain rules — RLS policy changes, schema rules that affect day-to-day behavior (cascading deletes, soft-delete adoption, audit-column changes), changes to how money or estimates are rendered, design-token changes.
- Known issues — an item was fixed and should be removed, or a new latent risk was discovered and should be added.

Update ROADMAP.md whenever any of the following happens:

- Work starts on something — move it from Next up into In flight, with one to three sentences on what is being built.
- Work completes — remove it from In flight. If it was structural enough to belong in STATE.md, update STATE.md too.
- Something is parked — move it into Considered and parked with one short reason for the park.
- Something is unparked — move it back into Next up.
- A new initiative is decided but not started — add it to Next up.

## Style rules

Both files must stay mobile-readable. That means prose and short lists, no code blocks, no tables, no nested bullets more than one level deep. Each file should fit comfortably under two pages on a phone — STATE.md trends longer because it covers the whole app, ROADMAP.md should stay tight.

Sentences should be complete and self-contained. A reader on a phone, away from the codebase, should be able to pick up either document cold and reason about strategy. Avoid jargon that only makes sense if you have the repo open.

These documents are not code documentation. Do not copy file paths and function names just to have them; include only the path or name when it materially aids understanding (a config file someone will look for, a key URL, a directory name a future doc reader needs to recognize). When in doubt, prefer prose over a list of identifiers.

## Suite-level docs

Cross-app and suite-level concerns live separately at ps-apps-suite/docs/. When a change affects how this app talks to ps-app-dashboard, the QBO proxy worker, the future scheduling app, or the future provider portal, flag the suite-level docs for update too — do not duplicate suite-level content into this app's STATE.md.

## Operating principle

The aim is that any new claude.ai chat about the CRM can start with "read docs/STATE.md and docs/ROADMAP.md" and immediately have a complete, accurate, current picture without trawling source. If a chat ever has to correct the docs based on the live code, the docs failed and are due for an update.

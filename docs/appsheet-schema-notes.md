# AppSheet schema notes — Stage 1 study (2026-05-05 snapshot)

> **Purpose**: understand what the legacy AppSheet workbook captures and why,
> so the CRM's Phase 2 schema can be designed deliberately rather than mimicked.
> AppSheet is being retired across the suite; the CRM is the new source of
> truth for organizations, providers, and opportunities. Shifts and daily
> logs eventually move to a separate scheduling app + provider portal.
>
> **Source**: `_reference/Snapshot of AppSheet Data - Provider Solutions (2026-05-05).xlsx`.
> Read-only — never written.
>
> **Scope**: priority tabs only — Locations, Opportunities, Providers, Shifts,
> Daily Shift Logs. Other tabs are surfaced in §F as open questions, not modeled.
>
> **Note on path**: the Stage 2 prompt referenced `app-ps-crm/docs/...`; the
> actual folder is `ps-app-crm/docs/`. This file is at the actual path. Listed
> in §F as a clarification item.

---

## A. Field inventory

### A.1 Locations (3 data rows)

One row per facility. Tiny table — three hospitals (Billings Clinic, Baptist
Oxford, Birmingham Grandview).

| col | apparent type | sample / notes | req? | derived? | role |
|---|---|---|---|---|---|
| Location ID | text (8-char hex) | `76589f37` | yes | no | **PK** — referenced by Opportunities, Shifts, Daily Shift Logs |
| Location Name | text | `Billings Clinic` | yes | no | display |
| City, ST | text | `Billings, MT` | yes | no | display label, denormalized from Address |
| Address | text | `801 N 29th St, Billings, MT 59101, USA` | yes | no | full street address, single string (not parsed) |
| Website | url | `http://www.billingsclinic.com` | optional | no | |
| Location Tourist Site | url | `https://www.visitbillings.com/` | optional | no | provider-recruiting flavor |
| Logo | image path | `Locations_Images/76589f37.Logo.195617.jpg` | optional | no | AppSheet image storage path |
| Image | image path | `Locations_Images/76589f37.Image.230939.jpg` | optional | no | facility photo (separate from logo) |
| Location Long Description | text (long) | recruiting-pitch paragraph | optional | no | marketing copy for providers |

**No FKs out** — Locations is a top-level entity.

### A.2 Opportunities (4 data rows)

One row per **role/setting combination per Location**. Two rows for Billings
Clinic (Inpatient + Outpatient), one each for Baptist Oxford and Birmingham
Grandview. This is where standard rates live.

| col | apparent type | sample / notes | req? | derived? | role |
|---|---|---|---|---|---|
| Opportunity ID | text (8-char hex) | `8b4806ac` | yes | no | **PK** |
| Location ID | text (FK) | → Locations | yes | no | **FK** |
| Title | text (enum-like) | `M.D.` | yes | no | provider title (only `M.D.` in active data) |
| Specialty | text (enum-like) | `Gastro.` | yes | no | only `Gastro.` in active data |
| Provider Type | text (composite) | `M.D./Gastro.` | yes | yes (concat of Title + Specialty) | |
| Shift Type | text (enum-like) | `Inpatient` \| `Outpatient` | yes | no | setting |
| Opportunity Name | text | `Billings Clinic - M.D./Gastro. (Inpatient)` | yes | yes (Location Name + Provider Type + Shift Type) | display |
| Time In | time | `07:00:00` | yes | no | shift start of day |
| Time Out | time | `17:00:00` | yes | no | shift end of day |
| Regular Hours | numeric | `10.0` | yes | no | guaranteed regular hours per day |
| Hours Guaranteed? | bool | `True` everywhere observed | yes | no | bill regardless of actual hours worked |
| Timesheet Note | text (long) | reminder copy injected on daily logs | optional | no | template text |
| Timesheet Note (Orientation) | text (long) | orientation-day variant | optional | no | template text |
| **Reg. Hourly Rate** | numeric (USD/hr) | `480.00`, `438.90`, `475.00`, `500.00` | yes | no | **bill rate** to client, regular hours |
| Overtime Hours | numeric | `0.0` everywhere | optional | no | OT threshold; 0 means no OT applies |
| **OT Hourly Rate** | numeric (USD/hr) | `480.00` (when present) | optional | no | **bill rate** for OT hours |
| **On Call** | bool | `True` (3 of 4) \| `False` (1 of 4) | yes | no | flag — does this opportunity include on-call coverage |
| Call Start Time | time | `17:00:00` | conditional on On Call | no | |
| Call End Time | time | `07:00:00` | conditional on On Call | no | overnight call window |
| **On Call Daily Rate** | numeric (USD/day) | `500.00`, `1000.00` | conditional on On Call | no | **bill rate** for one on-call night |
| **Call Back Hourly Rate** | numeric (USD/hr) | `480.00`, `0.00` | conditional on On Call | no | **bill rate** for hours during a call-back |
| **Provider Orientation Pay** | numeric (USD/day) | `0.00` everywhere | yes | no | **pay rate** per orientation day |
| **Provider Regular Shift Pay** | numeric (USD/day) | `4500.00`, `3625.00` | yes | no | **pay rate** per regular shift day (daily, not hourly) |
| **Provider Adv. Shift Bonus** | numeric (USD/day) | `0.00` everywhere | optional | no | **pay rate** advanced-shift bonus per day |
| **Provider On-Call Pay** | numeric (USD/day) | `500.00` (when On Call) | conditional | no | **pay rate** per on-call night |
| **Provider Other Bonus Pay** | numeric (USD/day) | `0.00` everywhere | optional | no | **pay rate** misc bonus per day |
| Profit/Premium to R3 | numeric (USD/day) | `0.00` everywhere on the Opportunity row | optional | yes | legacy artifact of a profit-share calc retired in 2026; **ignored in CRM design** |
| Daily Rate to Provider | numeric (USD/day) | `5000.00`, `3625.00` | yes | yes (sum of provider pay components for a representative day) | display rollup |

**FK out**: `Location ID` → Locations.

**Calc/derived**: `Provider Type`, `Opportunity Name`, `Daily Rate to Provider` are
all visibly concatenations or sums of other columns. `Profit/Premium to R3` is
populated on Opportunity rows but the variance lives in Daily Shift Logs.

**Bill-side rate columns**: Reg. Hourly Rate, OT Hourly Rate, On Call Daily
Rate, Call Back Hourly Rate.

**Pay-side rate columns**: Provider Orientation Pay, Provider Regular Shift
Pay, Provider Adv. Shift Bonus, Provider On-Call Pay, Provider Other Bonus
Pay.

### A.3 Providers (26 data rows)

People we place. Includes one ADMIN test row (`Hide=True`); 25 named MDs.

| col | apparent type | sample / notes | req? | derived? | role |
|---|---|---|---|---|---|
| Provider Name | text | `Bob Anderson, M.D.` | yes | yes (concat of First/Middle/Last/Suffix/Title) | display |
| Provider ID | text (8-char hex) | `cbd2a960` | yes | no | **PK** |
| First Name, Middle Name, Last Name, Suffix | text | | | no | name parts |
| Title | text (enum-like) | `M.D.` (only value observed) | yes | no | |
| Specialty | text (enum-like) | `Gastro.` (only value observed) | yes | no | |
| Shift Type | text (composite) | `M.D./Gastro.` | yes | yes (Title + Specialty) | mislabeled column — this is provider-type, not shift-type |
| Resident City/State | text | `Dallas, TX` | optional | no | provider's home base |
| Email Address | text (email) | | optional | no | |
| Phone Number (Input) | text/numeric | raw entry | optional | no | input variant |
| Phone Number | text | `(601) 906-1238` | optional | yes (formatted from input) | display |
| Hide | bool | `True`/`False` | yes | no | soft-archive flag — `True` excludes from active lists |
| NPI | text | (none populated in observed sample) | optional | no | |
| AAdvantage # | text | optional | no | airline loyalty for travel booking |
| Flight Preference | text | optional | no | travel pref |
| Shirt Size | text (enum) | `L`, `XL` | optional | no | swag |
| Photo | image path | `Providers_Images/cbd2a960.Photo.173210.png` | optional | no | provider headshot |
| W-9 Form | bool | `True`/`False` | yes | no | flag indicating W-9 on file |
| Direct Dep. Auth. | text (enum) | `Pending` | optional | no | ACH state — links to ACH Authorization tab |
| Total Provider Pay | url | published Google Sheets URL | optional | no | external rollup link, AppSheet artifact |
| Access Billings Clinic | bool | `True`/`False` | yes | no | per-facility access flag |
| Access Nashville General | bool | `True`/`False` | yes | no | per-facility access flag |

**Per-facility "Access X" columns are ignored** — these were an abandoned
AppSheet attempt at facility-level access control. The real version of this
feature lives in the future provider portal, not the CRM, and uses a different
mechanism. Not modeled.

**No FKs declared on Providers**, but `Provider ID` is referenced by Shifts,
Daily Shift Logs, ACH Authorization, Provider Docs, Onboarding Tasks, Provider
Onboarding.

### A.4 Shifts (134 data rows)

Multi-day assignments — one row per provider × opportunity × week. Sample
spans confirm 7-day blocks (Apr 14-20, Apr 18-25, etc.).

| col | apparent type | sample / notes | req? | derived? | role |
|---|---|---|---|---|---|
| Shift ID | text (8-char hex) | `870b9498` | yes | no | **PK** |
| Opportunity ID | text (FK) | | yes | no | **FK** → Opportunities |
| Lookup: Opportunity Name | text | denormalized for display | — | yes | |
| Provider ID | text (FK) | | yes | no | **FK** → Providers |
| Lookup: Provider Name | text | | — | yes | |
| Start Date | date | `2025-04-18` | yes | no | |
| End Date | date | `2025-04-25` | yes | no | typically Start + 6 (7-day inclusive block) |
| Shift Dates | text | `Apr. 18, 2025 - Apr. 25, 2025` | — | yes | display |
| Status | text (enum) | `Open`, `Assigned`, `In Progress`, `Completed` | yes | no | lifecycle |
| Shift Description | text | optional | no | freeform |
| Total Shift Pay | numeric (USD) | `47900` | — | yes | rollup of bill side from Daily Shift Logs |
| Total Paid to Provider | numeric (USD) | `47900` or `42000` | — | yes | rollup of pay side |
| Total Shift Profit | numeric (USD) | `4800` (= bill − pay) | — | yes | shift-level GP |
| Gross Margin | numeric (decimal) | `0.1025…` | — | yes | profit / total pay |
| TAX YEAR | int | `2025` | — | yes | |
| Unavailable? | bool | `False` | optional | no | placeholder/blocking flag |
| Requested By | text | optional | no | who created the booking |
| Admin Task: Book Hotel | text (enum) | `Done`, `N/A` | yes | no | **operational checklist** — one column per task |
| Admin Task: Book Flight | same | | | | |
| Admin Task: Upload Shift Docs. | same | | | | |
| Admin Task: Submit Timesheets | same | | | | |
| Admin Task: Submit Expense Rpt. | same | | | | |
| Admin Task: Send Shift Invoice | same | | | | |
| Admin Task: Pay Provider | same | | | | |
| Admin Task: Auto Stipend | same | | | | |
| Orientation Pay, Regular Pay, Adv. Shift Bonus, Overtime Pay, On Call Pay, Call-Back Pay, Bonus Pay | numeric (USD) | per-bucket rollups | — | yes | bill-side bucketed totals from Daily Shift Logs |

**FKs**: Opportunity ID → Opportunities; Provider ID → Providers.

**Operational shape**: Shifts is largely a derived/operational entity. Most of
its value-bearing columns are rollups from Daily Shift Logs. The 8 "Admin
Task: …" columns are a flat checklist — would be cleaner as a child task
table or jsonb in a fresh design.

### A.5 Daily Shift Logs (892 data rows)

One row per provider per day per shift. Heaviest table — 86 columns. Three
column clusters: bill rates, pay rates (overrides of opportunity defaults),
operational/clinical detail.

Grouped inventory (full per-column type detail elided where the type is
obvious from the name; bold = critical for GP):

**Identity / FK cluster**
- Shift Log ID — PK (8-char hex)
- Shift ID — FK → Shifts
- Opportunity ID — FK → Opportunities (denormalized; resolvable via Shift)
- Provider ID — FK → Providers (denormalized)
- Lookup: Shift Dates / Opportunity Name / Provider Name — derived display
- Date — the actual day
- Timesheet ID — FK → Timesheets (timesheet rollup; out of CRM scope)

**Hours / time cluster**
- Orientation? (bool) — if true, this day is the orientation day
- Time In, Time Out — actual clock-in/out
- Regular Hours — same default as Opportunity (10 in observed data)
- Hours Guaranteed? — copied from Opportunity
- Timesheet Note / Timesheet Note (Orientation) — copied template text
- (OT Hours - Admin. ADJ) — admin override of OT hours
- Overtime Hours — provider-reported OT

**Bill-side rate cluster (per-day; defaults from Opportunity, can deviate)**
- **Reg. Hourly Rate** — observed deviation: $530 vs $480 default for one provider on the same Opportunity
- **OT Hourly Rate**
- **On Call Daily Rate**
- **Call Back Hourly Rate**

**Pay-side rate cluster (per-day; defaults from Opportunity, can deviate)**
- **Provider Orientation Pay**
- **Provider Regular Shift Pay**
- **Provider Adv. Shift Bonus**
- **Provider On-Call Pay**
- **Provider Other Bonus Pay**
- Bonus Daily Rate — separate from Adv. Shift Bonus; meaning unclear (open question)

**On-call detail cluster**
- On Call (bool, copied from Opportunity)
- Call Start Time, Call End Time
- Call Back Request, Call Back Hours
- Reason (1st Call Back) … Reason (5th Call Back) — denormalized, capped at 5

**Clinical productivity cluster** (GI-specific — surface as §F)
- Procedures (EGD), Procedures (colon), Procedures (PEG)
- New Consults, Follow-Ups, Total Procedures
- Total On-Call Procedures
- Call: Transfer Request, Med./Prep Question, Diet Question, Change in Clinical Status, New Patient Consult Notification, Patient Mgmt./Curbside Question, Other
- Calls (not requiring return to hospital)
- Other (Comments), Activity Log Comments

**Workflow cluster**
- Signature (image path)
- Status — `Pending`, `Submitted`
- Approval Status — `Open`, `Approved`
- Status (from Shifts) — denormalized

**Calc/derived cluster** (mostly named "Sheets Calc" or rollups)
- Profit/Premium to R3 — daily margin to a related entity (see §F)
- Daily Rate to Provider — daily total
- Total Shift Pay (Sheets Calc), Shift Profit (Sheets Calc)
- Orientation Pay, Regular Pay, Adv. Shift Bonus, Overtime Pay, On Call Pay, Call-Back Pay, Bonus Pay — bill-side computed buckets
- Guaranteed Profit, Profit from Extras (Actual), Profit from Extras (Est.)
- YEAR-MO, YEAR (books), YEAR, Day of the Week, Weekday Sort
- Timesheet Submission Date

---

## B. Observed relationships

```
Locations (1)─────< Opportunities (M)
                       │
                       │
                       └────< Shifts (M) >─────── Providers (1)
                                  │
                                  └────< Daily Shift Logs (M)
                                              │
                                              └─ also denormalizes Opportunity ID
                                                  and Provider ID for query convenience
```

| from | to | cardinality | FK column | notes |
|---|---|---|---|---|
| Opportunities | Locations | many-to-one | `Location ID` | every opp belongs to exactly one location |
| Shifts | Opportunities | many-to-one | `Opportunity ID` | the opportunity defines rate defaults |
| Shifts | Providers | many-to-one | `Provider ID` | who's working the week |
| Daily Shift Logs | Shifts | many-to-one | `Shift ID` | one row per day per shift |
| Daily Shift Logs | Opportunities | many-to-one | `Opportunity ID` | denormalized — also reachable via Shift |
| Daily Shift Logs | Providers | many-to-one | `Provider ID` | denormalized |
| Daily Shift Logs | Timesheets | many-to-one | `Timesheet ID` | when admin rolls up the week |

Stable IDs are 8-char lowercase hex (e.g., `c0f9294c`, `8b4806ac`,
`76589f37`). They appear stable across tabs and are exactly what
`appsheet_id` columns should preserve.

**Missing relationship in current data**: there is no native concept of a
"placement contract" between provider and opportunity. The closest analog is
the set of Shift rows for that pair. The CRM's planned `placements` table is
the right place to model this — it doesn't exist in AppSheet.

**Provider ↔ Location association**: in AppSheet this is encoded as
boolean columns on Providers (`Access Billings Clinic`, `Access Nashville
General`). This is not a real M:N table in the source data. (Questioned in §F.)

---

## C. Rate structure model

Pulled out for clarity; this is the core of what the CRM's Opportunity entity
must represent.

### C.1 Bill-side rates (what we charge the client)

Confirmed structure (6 rate dimensions):

| dimension | unit | populated in AppSheet snapshot | notes |
|---|---|---|---|
| Orientation hourly rate | $/hr | not in Opportunities tab today (added per Phase 2 design) | client billed by-the-hour for orientation |
| Regular hourly rate | $/hr | yes (4 of 4 opps) | applied to regular hours per day |
| OT hourly rate | $/hr | yes | applied to OT hours beyond regular threshold |
| On-call nightly rate | $/night | when on-call enabled | flat per-night charge |
| Call-back hourly rate | $/hr | when on-call enabled | applied to provider hours during a call-back |
| Advanced-shift bonus daily | $/day | not in Opportunities tab today (added per Phase 2 design) | premium daily charge when advanced-shift coverage (e.g., ERCP) is required |

Plus shift defaults: regular hours per day, hours-guaranteed flag, OT
threshold, on-call enabled flag, call window (start/end time).

### C.2 Pay-side rates (what we pay the provider)

Confirmed structure (5 rate dimensions):

| dimension | unit | populated in AppSheet snapshot | notes |
|---|---|---|---|
| Orientation daily rate | $/day | yes (often $0) | flat per-orientation-day pay |
| Regular daily rate | $/day | yes (4 of 4) | **daily, not hourly** — `$4,500/day` typical |
| Advanced-shift bonus daily | $/day | column present, populated `0` | premium per day for specialty service (e.g., ERCP) |
| On-call nightly pay | $/night | yes (when on-call enabled) | typically `$500/night` |
| Other bonus daily | $/day | populated via Daily Shift Logs as needed | catch-all — holiday pay, one-off premium |

### C.3 On-call structure

- One on/off flag per opportunity.
- When enabled: nightly window (start/end time), nightly bill rate, nightly
  pay rate, hourly call-back bill rate.
- Call-back work tracked at the daily-log level (hours + reasons; up to 5
  reason slots per day in current schema).
- No weekday vs weekend rate distinction observed in the Opportunities tab;
  if it exists in practice, it's currently encoded by overriding rates at
  the Daily Shift Log level (open question §F).

### C.4 Shift structure

- Shift block = 7 calendar days (Start Date through End Date inclusive).
- 1 day = 1 Daily Shift Log row.
- Default day = Time In / Time Out / Regular Hours from Opportunity
  (typically 07:00–17:00, 10 hours).
- Per-day overrides allowed for: bill rates, pay rates, on-call,
  hours, OT, bonuses.

### C.5 Other things that vary by opportunity and affect GP

- **Per-day rate overrides** (out of CRM scope; lives in scheduling app /
  provider portal eventually): Daily Shift Logs is where actual rates live
  when they deviate. CRM uses placement-level rate fields for the negotiated
  contract; per-day variance is downstream.
- **Bonus Daily Rate** (AppSheet column): used for holiday pay or one-off
  above-standard daily pay. In the CRM this maps to `pay_other_bonus_daily`
  on opportunities (default) or on placements (negotiated override).
- **Advanced-shift bonus** (separate from Bonus Daily Rate): premium when
  specialty service like ERCP is required. Has its own bill and pay
  dimensions.
- **Hours Guaranteed?** flag changes how a partial-hours day bills.
- **Orientation day**: bill side is hourly (`bill_orientation_hourly`),
  pay side is daily flat rate (`pay_orientation_daily`). Asymmetric on
  purpose.

---

## D. Schema proposal for the CRM

> **Decision (Phase 2)**: rate columns live directly on `opportunities`.
> No separate rate-card child table. Rates are 1:1 with opportunity, the
> column count is bounded (~12 fields), and there's no current need for
> versioning, tiering, or proposed-vs-active states.
>
> **Future re-evaluation trigger (Phase 5+)**: split rate columns out into
> a sibling `opportunity_rate_cards` table if any of these become true:
> - rates need to be versioned over time (effective_from / effective_to)
> - a single opportunity needs multiple rate tiers (e.g., per-provider or
>   per-tier-of-experience overrides)
> - rates need distinct proposed / contracted / active states tracked
>   separately on the same opportunity
>
> Documenting the trigger here so future-us doesn't re-debate the choice.
> Per-day deviations belong in the future scheduling app + provider portal
> (and per the Phase 2 design, Daily Shift Logs are not modeled in the
> CRM in any phase — see D.4).

### D.1 `organizations` — additions beyond BUILD_PLAN §4.1

| col | type | notes |
|---|---|---|
| `appsheet_id` | text, nullable, unique | matches AppSheet `Location ID` (8-char hex) for legacy records |
| `logo_path` | text, nullable | Supabase Storage path; `organization-logos` bucket |
| `image_path` | text, nullable | facility/recruiting photo (separate from logo); same bucket |
| `tourist_site_url` | text, nullable | recruiting flavor — preserved from `Location Tourist Site` |
| `long_description` | text, nullable | recruiting copy from `Location Long Description` |

`name`, `website`, `address`, `city`, `state` are already covered. The
existing `address` column should hold the single-string Address; `city`,
`state` can be parsed from `City, ST` on import.

### D.2 `providers` — additions beyond BUILD_PLAN §4.1

The current spec already has `appsheet_id` and `position_type`
(`MD`/`DO`/`NP`/`CRNA`/`PA`) — both stay as specified. Import normalizes
AppSheet's `Title` value (`M.D.`) into `position_type` (`MD`).

Additions:

| col | type | notes |
|---|---|---|
| `middle_name` | text, nullable | preserved from AppSheet name parts |
| `suffix` | text, nullable | e.g. `III`, `Jr.` |
| `home_city` | text, nullable | from `Resident City/State` |
| `home_state` | text, nullable | parsed |
| `photo_path` | text, nullable | `provider-photos` bucket |
| `aadvantage_number` | text, nullable | travel booking convenience |
| `flight_preference` | text, nullable | |
| `shirt_size` | text, nullable | |
| `archived` | bool, default false | maps to AppSheet `Hide` |

Out of CRM scope (belongs in provider portal or Phase 3 credentialing):
- `W-9 Form` (bool flag) — represented properly as a credential row in Phase 3
- `Direct Dep. Auth.` — same
- `ACH Authorization` table contents (banking details) — sensitive PII;
  open question in §F whether the CRM ever holds these
- `Total Provider Pay` URL — AppSheet artifact; replaced by the CRM's GP modeler / placement-level views

**Per-facility access** (`Access Billings Clinic`, etc.) is NOT modeled as
boolean columns. If facility access is real, model it as `provider_facility_access`
(provider_id, organization_id, granted_at) — a join table. Open question §F
on whether this is operationally meaningful or AppSheet incidental.

### D.3 `opportunities` — replace placeholder rate columns with full rate structure

The current BUILD_PLAN placeholders (`hourly_rate`, `pay_rate`,
`estimated_gp`) are insufficient. Replace with:

| col | type | notes |
|---|---|---|
| `id` | uuid pk | unchanged |
| `organization_id` | uuid fk → organizations | unchanged (the hospital) |
| `source_partner_id` | uuid fk → organizations, nullable | unchanged |
| `appsheet_id` | text, nullable, unique | matches AppSheet `Opportunity ID` |
| `title` | text | unchanged — short label |
| `name` | text, nullable | longer display label (AppSheet's `Opportunity Name`) |
| `position_type` | text | `MD`, `DO`, `NP`, `CRNA`, `PA` — unchanged from current §4.1 spec |
| `specialty` | text | normalized — e.g. `GI` |
| `setting` | text | `inpatient` \| `outpatient` \| other — AppSheet's `Shift Type` |
| `location_city` | text | unchanged |
| `location_state` | text | unchanged |
| `start_date`, `end_date` | date, nullable | unchanged |
| **Shift defaults** | | |
| `shift_time_in` | time | typical clock-in (e.g. `07:00`) |
| `shift_time_out` | time | typical clock-out |
| `regular_hours_per_day` | numeric(5,2) | typically `10.00` |
| `hours_guaranteed` | bool, default true | bill regardless of actual hours |
| **Bill-side rates (6 dimensions)** | | |
| `bill_orientation_hourly` | numeric(10,2), default 0 | client bill rate per orientation hour |
| `bill_regular_hourly` | numeric(10,2) | regular hours bill rate |
| `bill_ot_hourly` | numeric(10,2) | OT hours bill rate |
| `bill_advanced_shift_bonus_daily` | numeric(10,2), default 0 | bill premium per advanced-shift day (e.g., ERCP) |
| `on_call_enabled` | bool, default false | gates the 4 on-call columns below |
| `bill_on_call_nightly` | numeric(10,2), nullable | per-night on-call bill |
| `bill_call_back_hourly` | numeric(10,2), nullable | per-hour call-back bill |
| `call_start_time` | time, nullable | |
| `call_end_time` | time, nullable | |
| **Pay-side rates (5 dimensions)** | | |
| `pay_orientation_daily` | numeric(10,2), default 0 | flat per orientation day |
| `pay_regular_daily` | numeric(10,2) | per regular shift day |
| `pay_advanced_shift_bonus_daily` | numeric(10,2), default 0 | premium per advanced-shift day |
| `pay_on_call_nightly` | numeric(10,2), nullable | per on-call night |
| `pay_other_bonus_daily` | numeric(10,2), default 0 | catch-all (holiday pay, one-off premium) |
| **GP modeler persistence** | | |
| `modeling_assumptions` | jsonb, nullable | utilization assumptions saved from the GP modeler (shifts/week, OT hours/day, etc.) |
| **Pipeline fields** | | |
| `stage` | text | per §4.4 — unchanged |
| `probability` | int | unchanged |
| `next_action_date` | date, nullable | unchanged |
| `notes` | text | unchanged |
| `created_at`, `updated_at`, `created_by` | | unchanged |

CHECK constraints:
- `on_call_enabled = false OR (bill_on_call_nightly IS NOT NULL AND pay_on_call_nightly IS NOT NULL)`
- numeric rates `>= 0`
- `regular_hours_per_day BETWEEN 0 AND 24`

The existing `hourly_rate`, `pay_rate`, `estimated_gp` placeholder columns
get dropped from the spec. Live `estimated_gp` is calculated by the GP
modeler from rate structure × utilization assumptions; it's not stored
separately (or, if cached, is recomputed on rate or assumption change).

### D.4 Should `shifts` and `daily_shift_logs` be in the CRM at all?

**Recommendation: NO, in any phase.**

Reasoning:

- The end-state architecture (BUILD_PLAN §10, to be added in Stage 2) puts
  shift instances in the future scheduling app and shift activity logs in
  the future provider portal. Modeling them in the CRM creates a duplicate
  source of truth that the eventual scheduling-app build will have to
  un-couple.
- During the transition, AppSheet continues to receive shift activity logs;
  there is no business need for the CRM to own shift data.
- The CRM **does** need a `placements` table (already in BUILD_PLAN §4.3) —
  the contract between a provider and an opportunity. That's the right
  handoff to the future scheduling app, and it's what the CRM uses for
  "placements active / ending soon / GP-at-risk" views in Phase 4.
- Per-day rate deviation (Reed's `530` vs `480` example) is a real concern,
  but it's a property of the placement, not of every individual day. If a
  given placement has a non-default rate, it lives on the `placements` row
  (`pay_rate`, `bill_rate` already in §4.3 — extend to the same set of
  rate fields as `opportunities` if/when a real deviation pattern emerges).

What the CRM does need from `shifts`/`daily_shift_logs` data eventually:

- Realized GP per opportunity (for the dashboard's "actual vs estimated"
  view) → sourced via QBO actuals through the existing finance worker, not
  through CRM tables. BUILD_PLAN §6.2 already documents this pattern.

### D.5 `appsheet_id` columns in 0002_pipelines.sql

Three tables get `appsheet_id text` (nullable, unique-where-not-null):
- `providers` (already specified)
- `organizations` (new)
- `opportunities` (new)

Existing AppSheet records preserve their 8-char hex IDs for stable matching
during the AppSheet-to-portal transition (so legacy shift logs in AppSheet
remain associable).

---

## E. GP modeling inputs

The GP modeler is interactive: user adjusts assumptions, sees projected
weekly / monthly / annual GP and GP margin update live. Inputs split into
two groups: **rate structure** (from the opportunity row) and **utilization
assumptions** (user-adjustable per modeling session, with sensible defaults).

### E.1 Rate-structure inputs (read from opportunity)

| input | source column |
|---|---|
| Orientation hourly bill rate | `bill_orientation_hourly` |
| Regular hourly bill rate | `bill_regular_hourly` |
| OT hourly bill rate | `bill_ot_hourly` |
| Advanced-shift bonus daily bill | `bill_advanced_shift_bonus_daily` |
| On-call enabled | `on_call_enabled` |
| On-call nightly bill rate | `bill_on_call_nightly` |
| Call-back hourly bill rate | `bill_call_back_hourly` |
| Regular hours per day | `regular_hours_per_day` |
| Hours guaranteed flag | `hours_guaranteed` |
| Orientation daily pay | `pay_orientation_daily` |
| Regular daily pay | `pay_regular_daily` |
| Advanced-shift bonus daily pay | `pay_advanced_shift_bonus_daily` |
| On-call nightly pay | `pay_on_call_nightly` |
| Other bonus daily pay | `pay_other_bonus_daily` |

### E.2 Utilization assumptions (user-adjustable)

Defaults are **setting-aware**: real-world inpatient assignments cover 7
working days plus 7 on-call nights per shift; outpatient assignments
cover 4 working days with no on-call. The modeler picks the right
default block based on `opportunity.setting`. Users can override every
field — the defaults exist to give a sensible starting projection on
first open.

When `setting` is null or `'other'`, the modeler falls back to the
**inpatient** defaults; this is revisited if a third setting type
emerges.

**Inpatient defaults** (`setting = 'inpatient'` or null/other fallback)

| assumption | default | unit | drives |
|---|---|---|---|
| Shifts per week | `1` | full 7-day blocks/wk | bill, pay, weekly GP |
| Shift days per shift | `7` | days/shift | per-shift duration |
| Working days per shift | `7` | days/shift | how many days bill regular-shift rates |
| Orientation days per placement | `0` | one-time | typically only the first shift |
| OT hours per working day | `0` | hours | tail risk; usually zero |
| On-call nights per shift | `7` (if enabled) | nights/shift | full-week coverage assumption |
| Call-back hours per call night | `0` | hours/night | rare events |
| Adv. shift bonus days per shift | `0` | days/shift | bonus frequency |
| Other bonus days per shift | `0` | days/shift | bonus frequency |
| Weeks billable per year | `48` | weeks/yr | annualization (4 weeks off baseline) |

**Outpatient defaults** (`setting = 'outpatient'`)

| assumption | default | unit | drives |
|---|---|---|---|
| Shifts per week | `1` | full 7-day blocks/wk | bill, pay, weekly GP |
| Shift days per shift | `4` | days/shift | per-shift duration |
| Working days per shift | `4` | days/shift | clinic-day pattern |
| Orientation days per placement | `0` | one-time | |
| OT hours per working day | `0` | hours | |
| On-call nights per shift | `0` | nights/shift | outpatient has no call |
| Call-back hours per call night | `0` | hours/night | |
| Adv. shift bonus days per shift | `0` | days/shift | |
| Other bonus days per shift | `0` | days/shift | |
| Weeks billable per year | `48` | weeks/yr | |

**On nuance not modeled in the CRM**: real shift instances vary — one
provider may work 6 days / 5 nights and another 8 days / 9 nights on
the same opportunity. That per-instance variance is a scheduling-app
concern, not a CRM concern. The CRM's job is to model **typical**
economics for opportunity-level negotiation; the future scheduling app
handles day-level granularity using the opportunity's rates as
defaults.

### E.3 Computed outputs

- **Per-shift bill** =
  bill_orientation_hourly × regular_hours_per_day × orientation_days +
  bill_regular_hourly × regular_hours_per_day × working_days +
  bill_ot_hourly × ot_hours_per_working_day × working_days +
  bill_advanced_shift_bonus_daily × adv_shift_bonus_days +
  bill_on_call_nightly × on_call_nights +
  bill_call_back_hourly × call_back_hours_per_night × on_call_nights
- **Per-shift pay** =
  pay_orientation_daily × orientation_days +
  pay_regular_daily × working_days +
  pay_advanced_shift_bonus_daily × adv_shift_bonus_days +
  pay_on_call_nightly × on_call_nights +
  pay_other_bonus_daily × other_bonus_days
- **Per-shift GP** = bill − pay
- **Weekly GP** = per-shift GP × shifts_per_week
- **Monthly GP** = weekly GP × (52 / 12)
- **Annual GP** = weekly GP × weeks_billable_per_year
- **GP margin** = GP / bill (display as %)

The modeler offers "save assumptions to opportunity" (persists the
utilization values to `opportunities.modeling_assumptions` jsonb) and
"reset to defaults".

---

## F. Open questions

### Resolved

- **Folder name** → use `ps-app-crm/` everywhere (Stage 2 import script
  path: `ps-app-crm/scripts/import-from-appsheet.js`).
- **Profit/Premium to R3** → ignore. Legacy artifact of a Reed-Jason
  profit-share calc retired in 2026; not modeled in CRM.
- **Per-facility "Access X" columns on Providers** → ignore. Abandoned
  AppSheet attempt at access control. The real version belongs in the
  future provider portal and uses a different mechanism.
- **Bonus Daily Rate vs Adv. Shift Bonus** → distinct concepts.
  Bonus Daily Rate (holiday pay / one-off premium) maps to
  `pay_other_bonus_daily`. Advanced-shift bonus (premium for specialty
  service like ERCP) gets its own bill and pay columns
  (`bill_advanced_shift_bonus_daily`, `pay_advanced_shift_bonus_daily`).
- **GP modeler assumption persistence** → jsonb column on
  `opportunities.modeling_assumptions`. Simple. Switch to a separate
  table only if assumption history becomes a real ask.
- **Provider Onboarding / Onboarding Tasks** → AppSheet feature that was
  never built. Will be developed properly in the future suite (provider
  portal + CRM Phase 3 credentialing). No action in Phase 2.
- **Source partner relationship not in workbook** → AppSheet's
  Opportunities tab has no field representing whether an opportunity is
  contracted directly with a hospital or subcontracted from a LOCUMs
  partner. The CRM models this via `organizations.type` (`'hospital'` vs
  `'locums_partner'`) and `opportunities.source_partner_id` (nullable FK
  to `organizations`). Legacy AppSheet records: the two Billings Clinic
  opportunities are sourced from Medicus Healthcare Solutions; Oxford
  and Birmingham are direct. The import script handles this via a
  hardcoded `SOURCE_PARTNER_OVERRIDES` map keyed by AppSheet
  `Opportunity ID` — see the script source for the current mapping.
  Going forward, the source partner is set explicitly by the user during
  opportunity creation in the CRM.

### Resolved at Stage 2 review

- **OT semantics** → modeled as `ot_threshold_hours` (numeric, default
  `0`). OT applies to hours past `regular_hours_per_day + ot_threshold_hours`.
- **Address parsing** → import populates `address` (full AppSheet string),
  `city` and `state` (parsed from the `City, ST` field), leaves `zip` null.
  No regex parsing of the full address string.
- **Image migration source** → Jason exports AppSheet image storage into
  `_reference/appsheet-images/`, preserving the folder structure
  referenced by the workbook (e.g., `Providers_Images/`, `Locations_Images/`).
  The import script uploads matching binaries into Supabase Storage and
  populates `logo_path` / `image_path` / `photo_path`. If the folder is
  absent or partial, the script logs missing images per row and leaves
  the corresponding fields null — no script error. Manual re-upload via
  the CRM UI fills in anything that matters. Image export is best-effort;
  partial coverage is fine.
- **Specialty / position_type normalization on import** → import maps
  AppSheet values to canonical CRM values per the table below. Every
  normalization is logged ("`'M.D.'` → `'MD'` (N rows)"). Any value that
  doesn't match a known mapping is **flagged as needs-review in the
  import log** rather than silently normalized — better to clean up
  oddballs by hand than to silently merge.

  | source field (AppSheet) | source value | target field (CRM) | target value |
  |---|---|---|---|
  | Title (Providers) | `M.D.` | `position_type` | `MD` |
  | Title (Providers) | `M.D.*` | `position_type` | `MD` |
  | Title (Opportunities) | `M.D.` | `position_type` | `MD` |
  | Specialty (Providers, Opportunities) | `Gastro.` | `specialty` | `GI` |
  | Shift Type (Opportunities) | `Inpatient` | `setting` | `inpatient` |
  | Shift Type (Opportunities) | `Outpatient` | `setting` | `outpatient` |

  The trailing asterisk on `M.D.*` (observed on a single provider row)
  appears to be a presentational footnote convention in AppSheet — not
  a credential distinction. Same `position_type` as `M.D.`.

  AppSheet's derived `Provider Type` column (`M.D./Gastro.`) is a
  concatenation, not stored in the CRM — the constituent `position_type`
  + `specialty` are stored separately and the composite is rebuilt for
  display when needed.

  Other mapping rows will be added here as the data reveals them. If a
  new value appears in the import data and isn't in this table, the
  script flags those rows and the mapping table gets updated before the
  next run.

### Surfaced for awareness (not modeled)

Tabs outside the priority list, listed per instructions:

- **Timesheets** (157 rows) — links Shift+Provider+Week, integrates with
  QuickBooks (`QB Invoice # (Time)`, `QB Bill for Provider Pay?`).
  Confirms billing/payroll stays in QBO. CRM does not model this.
- **Provider Docs** (35 rows) — basic doc storage. Subsumed by Phase 3
  credentialing.
- **ACH Authorization** (22 rows) — provider banking details, sensitive
  PII. End-state home is the future provider portal, not the CRM. Not
  in the Stage 2 import scope (correct as written).
- **Admins** (3 rows) — replaced by Supabase `auth.users` + the planned
  Phase 2+ `profiles` table.
- **PS Autos**, **Financials**, **Charts**, **R3 Daily/Monthly Comp.**,
  **Est. Extras Calc.**, **CHARTS Gross Profit**, **Expenses**, **Business
  Expenses** — finance / partner-comp artifacts. None belong in the CRM.

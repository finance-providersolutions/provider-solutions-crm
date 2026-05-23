// Provider Solutions CRM — shared constants

export const ORGANIZATION_TYPES = [
  { value: 'hospital',       label: 'Hospital'        },
  { value: 'locums_partner', label: 'LOCUMs partner'  },
  { value: 'other',          label: 'Other'           },
];

export const CONTACT_ROLES = [
  { value: 'decision_maker', label: 'Decision maker' },
  { value: 'scheduler',      label: 'Scheduler'      },
  { value: 'credentialing',  label: 'Credentialing'  },
  { value: 'billing',        label: 'Billing'        },
  { value: 'clinical',       label: 'Clinical'       },
  { value: 'other',          label: 'Other'          },
];

export const ACTIVITY_TYPES = [
  { value: 'call',    label: 'Call'    },
  { value: 'email',   label: 'Email'   },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note',    label: 'Note'    },
  { value: 'sms',     label: 'SMS'     },
];

// Provider pipeline. Ordered target → active → inactive/declined/
// disqualified, mirroring how the user moves a record through the
// funnel. `description` is selection-helper text shown only in the
// status picker — never on lists, cards, or detail views. Replaces
// the old `credentialed` status (credentialing readiness is now
// computed from the credentialing tables, not a manual status —
// keeping it here would create a drifting second source of truth);
// the old `disqualified` is split into `declined` (they walked) and
// `disqualified` (we screened them out).
export const PROVIDER_STATUSES = [
  { value: 'target',        label: 'Target',        description: 'Identified for outreach; no referral or interest yet' },
  { value: 'lead',          label: 'Lead',          description: 'Referred or showed inbound interest' },
  { value: 'contacted',     label: 'Contacted',     description: 'First contact made' },
  { value: 'interested',    label: 'Interested',    description: 'Engaged and wants to proceed' },
  { value: 'interviewing',  label: 'Interviewing',  description: 'In evaluation' },
  { value: 'onboarding',    label: 'Onboarding',    description: 'Agreed; being brought aboard (paperwork, setup)' },
  { value: 'active',        label: 'Active',        description: 'Currently placeable / taking shifts' },
  { value: 'inactive',      label: 'Inactive',      description: 'Was active, not currently taking shifts' },
  { value: 'declined',      label: 'Declined',      description: 'They withdrew (not interested, took other work, went quiet)' },
  { value: 'disqualified',  label: 'Disqualified',  description: "We screened them out (didn't meet the bar, not a fit)" },
];

// CHECK-constrained on providers.position_type and
// opportunities.position_type (BUILD_PLAN §4.1).
export const POSITION_TYPES = [
  { value: 'MD',   label: 'M.D.' },
  { value: 'DO',   label: 'D.O.' },
  { value: 'NP',   label: 'NP'   },
  { value: 'CRNA', label: 'CRNA' },
  { value: 'PA',   label: 'PA'   },
];

// Free-text in the schema, but normalized on import per
// docs/appsheet-schema-notes.md §F. Today the only canonical value
// in our data is GI; CRNA / NP specialties (etc.) get added as the
// list grows.
export const SPECIALTIES = [
  { value: 'GI', label: 'Gastroenterology' },
];

// Short-form labels used on dense list-view surfaces (e.g., the
// Opportunities card meta row, where the position+specialty+setting
// triplet shares one line). Keys are full SPECIALTIES.label values;
// missing entries fall back to the full label. A future "dropdown-
// list management" slice will move this into an admin-editable
// table alongside the canonical SPECIALTIES list.
export const SPECIALTY_ABBR = {
  Gastroenterology: 'Gastro',
};

export const specialtyAbbrFor = (specialtyValue) => {
  const full = labelFor(SPECIALTIES, specialtyValue);
  return SPECIALTY_ABBR[full] ?? full;
};


// CHECK-constrained on providers.source (BUILD_PLAN §4.1).
export const PROVIDER_SOURCES = [
  { value: 'referral',   label: 'Referral'   },
  { value: 'inbound',    label: 'Inbound'    },
  { value: 'partner',    label: 'Partner'    },
  { value: 'recruiting', label: 'Recruiting' },
  { value: 'other',      label: 'Other'      },
];

// Opportunity pipeline (BUILD_PLAN §4.4). Ordered lead → qualified
// → … → filled, with `lost` as the terminal off-ramp.
export const OPPORTUNITY_STAGES = [
  { value: 'lead',       label: 'Lead'       },
  { value: 'qualified',  label: 'Qualified'  },
  { value: 'proposal',   label: 'Proposal'   },
  { value: 'contracted', label: 'Contracted' },
  { value: 'filled',     label: 'Filled'     },
  { value: 'lost',       label: 'Lost'       },
];

// Suite-wide definition of "active" / "open" opportunity stages.
// Filled and lost are terminal — explicitly excluded so a future new
// stage doesn't silently inflate any "open opportunities" count.
// Consumed by Organizations card pill and Home Snapshot KPI.
export const ACTIVE_OPPORTUNITY_STAGES = ['lead', 'qualified', 'proposal', 'contracted'];

// CHECK-constrained on opportunities.setting (BUILD_PLAN §4.1).
export const OPPORTUNITY_SETTINGS = [
  { value: 'inpatient',  label: 'Inpatient'  },
  { value: 'outpatient', label: 'Outpatient' },
  { value: 'other',      label: 'Other'      },
];

// CHECK-constrained on provider_licenses.status (0004). `pending`
// supports the recruiting workflow of pursuing a new state license
// before it's granted.
export const LICENSE_STATUSES = [
  { value: 'active',  label: 'Active'  },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
];

// CHECK-constrained on credentials.credential_type (0004). `other`
// is the catch-all; the schema requires `label` to be non-blank
// when type='other' so two `other` rows stay distinguishable.
export const CREDENTIAL_TYPES = [
  { value: 'board_certification', label: 'Board certification' },
  { value: 'dea',                 label: 'DEA'                 },
  { value: 'bls',                 label: 'BLS'                 },
  { value: 'acls',                label: 'ACLS'                },
  { value: 'malpractice',         label: 'Malpractice'         },
  { value: 'other',               label: 'Other'               },
];

// CHECK-constrained on credentials.status (0004). Same set as
// LICENSE_STATUSES today; kept as separate exports so future
// divergence (e.g., credentials adding 'suspended') doesn't require
// renaming at call sites.
export const CREDENTIAL_STATUSES = [
  { value: 'active',  label: 'Active'  },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
];

// CHECK-constrained on facility_privileges.status (0004). Models the
// full privilege lifecycle: pending application, active grant,
// expired, denied (by the hospital), or withdrawn (by the provider).
export const PRIVILEGE_STATUSES = [
  { value: 'pending',    label: 'Pending'    },
  { value: 'active',     label: 'Active'     },
  { value: 'expired',    label: 'Expired'    },
  { value: 'denied',     label: 'Denied'     },
  { value: 'withdrawn',  label: 'Withdrawn'  },
];

// CHECK-constrained on tasks.priority. The schema is low/normal/high
// only — no `urgent` level. Future expansion is a migration.
export const TASK_PRIORITIES = [
  { value: 'low',    label: 'Low'    },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'High'   },
];

// CHECK-constrained on tasks.status.
export const TASK_STATUSES = [
  { value: 'open',      label: 'Open'      },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
];

export const labelFor = (options, value) =>
  options.find(o => o.value === value)?.label ?? value ?? '—';

// Companion to labelFor for option lists that carry a `description`
// (selection-helper text). Returns the description for the matching
// value, or null when the value is unknown or the option has none —
// callers omit the line entirely on null rather than rendering a
// dash. Today only PROVIDER_STATUSES carries descriptions.
export const descriptionFor = (options, value) =>
  options.find(o => o.value === value)?.description ?? null;

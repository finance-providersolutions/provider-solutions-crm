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

// Provider pipeline (BUILD_PLAN §4.4). Ordered lead → active →
// inactive/disqualified, mirroring how the user moves a record
// through the funnel.
export const PROVIDER_STATUSES = [
  { value: 'lead',          label: 'Lead'          },
  { value: 'contacted',     label: 'Contacted'     },
  { value: 'interested',    label: 'Interested'    },
  { value: 'interviewing',  label: 'Interviewing'  },
  { value: 'onboarding',    label: 'Onboarding'    },
  { value: 'credentialed',  label: 'Credentialed'  },
  { value: 'active',        label: 'Active'        },
  { value: 'inactive',      label: 'Inactive'      },
  { value: 'disqualified',  label: 'Disqualified'  },
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

// CHECK-constrained on opportunities.setting (BUILD_PLAN §4.1).
export const OPPORTUNITY_SETTINGS = [
  { value: 'inpatient',  label: 'Inpatient'  },
  { value: 'outpatient', label: 'Outpatient' },
  { value: 'other',      label: 'Other'      },
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

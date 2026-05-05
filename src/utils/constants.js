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

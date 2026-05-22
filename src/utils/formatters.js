// Modeled on ps-app-dashboard/src/utils/formatters.js. Money + dates
// via Intl; phone via a simple US-format regex.

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const currencyFmtCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtCurrency(value, { cents = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return (cents ? currencyFmtCents : currencyFmt).format(Number(value));
}

const dateShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime  = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
});

export function fmtDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateShort.format(d);
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateTime.format(d);
}

// Best-effort relative time for activity feeds. Falls back to fmtDate
// for anything older than a week.
export function fmtRelative(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const ms = Date.now() - d.getTime();
  const secs = Math.round(ms / 1000);
  const mins = Math.round(secs / 60);
  const hrs  = Math.round(mins / 60);
  const days = Math.round(hrs  / 24);
  if (secs < 60)  return 'just now';
  if (mins < 60)  return `${mins} min ago`;
  if (hrs  < 24)  return `${hrs} hr ago`;
  if (days < 7)   return `${days}d ago`;
  return fmtDate(d);
}

// Returns "(212) 555-1234" for 10-digit US numbers, otherwise the
// trimmed input (or "—" when empty / no digits). Intentionally
// permissive — we don't reject international numbers, just don't
// auto-format them.
//
// The no-digits case ("() -" or similar empty-template strings)
// shows up in legacy AppSheet records where the formatted phone
// column was always populated even when blank. Treat as empty.
export function fmtPhone(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 0) return '—';
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return String(value).trim();
}

// Renders a person's name from the provider/contact field set:
// "first [middle] last[, suffix]". Middle name is included AS-IS
// when present — if the field holds "J" it renders "J", if it
// holds "James" it renders "James" (no force-to-initial).
// Suffix joins with a comma when present.
//
// Schema-aware: providers carry middle_name and suffix; contacts
// have only first_name + last_name today. fmtName must gracefully
// degrade to "First Last" when middle/suffix columns are absent or
// null — the {} default + Boolean filter handles both cases. Trim
// any double spaces that survive concatenation (defensive — the
// filter(Boolean).join(' ') path shouldn't produce them, but
// guards against future field additions).
//
// Returns em-dash for entirely-empty input so the UI never renders
// a blank where a name was expected.
export function fmtName({ first_name, middle_name, last_name, suffix } = {}) {
  const base = [first_name, middle_name, last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '—';
  const sfx = suffix && String(suffix).trim();
  return sfx ? `${base}, ${sfx}` : base;
}

export function fmtInt(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US').format(Number(value));
}

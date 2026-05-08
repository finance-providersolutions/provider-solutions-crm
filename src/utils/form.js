export function scrollToFirstError(formRef, errorFields) {
  if (!formRef?.current) return null;
  if (!Array.isArray(errorFields) || errorFields.length === 0) return null;

  const form = formRef.current;
  const named = form.querySelectorAll('[name]');
  for (const el of named) {
    if (errorFields.includes(el.name)) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try {
        el.focus({ preventScroll: true });
      } catch {
        // focus() may throw on disabled or unfocusable elements; safe to ignore
      }
      return el;
    }
  }
  return null;
}

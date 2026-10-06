/** Joins class names, skipping falsy ones (the landing page doesn't need tailwind-merge). */
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ')

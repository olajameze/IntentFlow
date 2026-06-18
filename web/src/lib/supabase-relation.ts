/** Unwrap a Supabase embedded relation (object or single-element array). */
export function relatedRow<T extends Record<string, unknown>>(
  value: T | T[] | null | undefined,
): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

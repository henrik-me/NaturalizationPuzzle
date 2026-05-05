/**
 * Preferred display order for the three known USCIS civics-test categories.
 * Any category present in loaded data but not in this list falls back to
 * alphabetical order at the end, so unexpected backend changes don't silently
 * drop options.
 */
export const CATEGORY_ORDER: readonly string[] = [
  'American Government',
  'American History',
  'Integrated Civics',
];

/**
 * Returns the unique values from `values`, ordered first by the `preferred`
 * sequence (any value matching `preferred[i]` appears at position i), then
 * any remaining unique values appended in alphabetical order.
 */
export function orderedUnique(values: Iterable<string>, preferred: readonly string[]): readonly string[] {
  const seen = new Set(values);
  const ordered: string[] = [];
  for (const p of preferred) {
    if (seen.has(p)) {
      ordered.push(p);
      seen.delete(p);
    }
  }
  for (const remaining of [...seen].sort()) {
    ordered.push(remaining);
  }
  return ordered;
}

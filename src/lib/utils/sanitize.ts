/**
 * Sanitize user input for use in Supabase PostgREST filter strings.
 * Escapes characters that have special meaning in PostgREST query syntax.
 */
export function sanitizeFilterValue(value: string): string {
  // Remove/escape characters that are special in PostgREST filter syntax
  return value.replace(/[%_\\,\.\(\)]/g, (char) => {
    if (char === '%' || char === '_') return `\\${char}`;
    if (char === ',' || char === '.' || char === '(' || char === ')') return '';
    return char;
  });
}

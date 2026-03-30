/**
 * Utility to merge class names, filtering out falsy values.
 */
export function cn(...inputs: (string | undefined | false | null)[]): string {
  return inputs.filter(Boolean).join(' ');
}

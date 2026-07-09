/** Canonical skill name: lowercase, hyphen normalized (per design). */
export function canonicalizeName(raw: string): string {
  const canonical = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!canonical) throw new Error(`Invalid skill name: ${raw}`);
  return canonical;
}

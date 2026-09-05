/**
 * Normalisation of investigation tags.
 *
 * Pure logic, kept out of the component: this is what decides what becomes a
 * tag, and the rules (case-insensitive duplicates, length, count) must be
 * verifiable without mounting any UI.
 *
 * The stored format stays an array of strings - `Case.tags` is JSON serialised
 * server-side, and the dashboard renders `c.tags.slice(0, 3)`.
 */

/** Maximum length of a tag. Beyond that it overflows its chip. */
export const TAG_MAX = 32;
/** Maximum number of tags per investigation. */
export const TAGS_MAX = 20;

/**
 * Cleans up an input: trims both ends, collapses inner whitespace, drops commas
 * (they are separators, never content).
 */
export function normaliserTag(brut) {
  return String(brut ?? '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TAG_MAX);
}

/** Is a tag already present? Case-insensitive comparison. */
export function contient(liste, tag) {
  const bas = tag.toLocaleLowerCase();
  return liste.some(t => t.toLocaleLowerCase() === bas);
}

/**
 * Adds one or more tags to a list. Accepts text containing commas or line
 * breaks - that is what makes pasting usable.
 *
 * @returns {{liste: string[], ajoutes: string[], ignores: string[]}}
 *          `liste` is a NEW array; the input is never modified.
 */
export function ajouterTags(liste, saisie) {
  const resultat = [...liste];
  const ajoutes = [];
  const ignores = [];

  for (const morceau of String(saisie ?? '').split(/[,\n\r\t;]+/)) {
    const tag = normaliserTag(morceau);
    if (!tag) continue;
    if (contient(resultat, tag) || resultat.length >= TAGS_MAX) { ignores.push(tag); continue; }
    resultat.push(tag);
    ajoutes.push(tag);
  }
  return { liste: resultat, ajoutes, ignores };
}

/** Removes a tag (case-insensitive comparison). */
export function retirerTag(liste, tag) {
  const bas = String(tag).toLocaleLowerCase();
  return liste.filter(t => t.toLocaleLowerCase() !== bas);
}

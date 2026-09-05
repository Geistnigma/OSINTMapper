/**
 * Entity and link constants, with translated labels.
 *
 * `constants.jsx` stays the source: ids, colours, icons, order. Nothing moves
 * there - it is data, and a non-React module (`exportPdf.js`) imports it. This
 * file only produces a translated view of it for display.
 *
 * The ids (`person_male`, `email_gmail`) are what entities store: translating
 * the labels therefore touches NO investigation data and needs no migration.
 * The label of an entity, on the other hand, is copied at creation time
 * (`label: info.label`): it becomes the user's own data and must never be
 * translated again afterwards.
 */
import { useMemo } from 'react';
import { CATEGORIES, LINK_TYPES } from './constants.jsx';
import { useT, traduire } from '../i18n';

export function traduireConstantes(tr) {
  const categories = CATEGORIES.map(c => ({
    ...c,
    label: tr(`entites.cat.${c.id}`),
    items: c.items.map(it => ({
      ...it,
      label: tr(`entites.type.${it.id}`),
      desc: tr(`entites.type.${it.id}.desc`),
    })),
  }));

  // Flat index, rebuilt exactly as in constants.jsx so consumers see no
  // difference in shape.
  const allItems = {};
  categories.forEach(c => c.items.forEach(it => {
    allItems[it.id] = { ...it, category: c.id, categoryLabel: c.label, categoryIcon: c.icon };
  }));

  const linkTypes = LINK_TYPES.map(l => ({ ...l, label: tr(`liens.type.${l.id}`) }));

  return { CATEGORIES: categories, ALL_ITEMS: allItems, LINK_TYPES: linkTypes };
}

/**
 * The everyday hook. The result is only recomputed when the language changes:
 * `tr` changes identity at that moment, and only at that moment.
 */
export function useConstantes() {
  const tr = useT();
  return useMemo(() => traduireConstantes(tr), [tr]);
}

/**
 * A plugin's label in the language of the interface.
 *
 * Three places display it: the toolbar button, the entity panel tab and the
 * full-screen panel header. Built-in plugins have their keys; runtime-installed
 * ones do not, and `traduire` then falls back to their manifest label - one
 * path for both.
 *
 * @param pl      engine entry (`getByHook`), with `manifest` and `hookConfig`
 * @param hook    hook name ('toolbar-button', 'entity-tab'…)
 */
export function libellePlugin(pl, hook) {
  const id = pl.id || pl.manifest?.id;
  const repli = pl.hookConfig?.label || pl.manifest?.name || pl.name || id;
  return traduire(`plugin.${id}.hook.${hook}`, null,
    traduire(`plugin.${id}.name`, null, repli));
}

/** Plugin name, outside any hook context (panel header, store). */
export function nomPlugin(pl) {
  const id = pl.id || pl.manifest?.id;
  return traduire(`plugin.${id}.name`, null, pl.manifest?.name || pl.name || id);
}

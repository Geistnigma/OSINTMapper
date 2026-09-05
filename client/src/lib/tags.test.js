/**
 * Normalisation des étiquettes d'enquête.
 *
 * La saisie en bulles repose entièrement sur ces règles : ce qui passe ici
 * devient une étiquette stockée, et le tableau de bord n'en affiche que les
 * trois premières. Une règle qui glisse se voit donc mal à l'écran.
 */
import { describe, it, expect } from 'vitest';
import { normaliserTag, ajouterTags, retirerTag, contient, TAG_MAX, TAGS_MAX } from './tags';

describe('normaliserTag', () => {
  it('coupe les espaces et réduit les espaces internes', () => {
    expect(normaliserTag('  fraude   bancaire  ')).toBe('fraude bancaire');
  });

  it('retire les virgules : elles séparent, elles ne font pas partie du contenu', () => {
    expect(normaliserTag('fraude,')).toBe('fraude');
    expect(normaliserTag(',,')).toBe('');
  });

  it('borne la longueur', () => {
    expect(normaliserTag('x'.repeat(80))).toHaveLength(TAG_MAX);
  });

  it('accepte une entrée absente sans lever', () => {
    expect(normaliserTag(undefined)).toBe('');
    expect(normaliserTag(null)).toBe('');
  });
});

describe('ajouterTags', () => {
  it('ajoute une étiquette simple', () => {
    expect(ajouterTags([], 'fraude').liste).toEqual(['fraude']);
  });

  it('découpe sur les virgules, points-virgules et sauts de ligne — le collage marche', () => {
    expect(ajouterTags([], 'a, b;c\nd').liste).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuse un doublon sans tenir compte de la casse', () => {
    const r = ajouterTags(['Fraude'], 'fraude');
    expect(r.liste).toEqual(['Fraude']);
    expect(r.ignores).toEqual(['fraude']);
  });

  it('ignore les morceaux vides', () => {
    expect(ajouterTags([], ' , ,, ').liste).toEqual([]);
  });

  it('plafonne le nombre d\'étiquettes', () => {
    const pleine = Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`);
    const r = ajouterTags(pleine, 'unedeplus');
    expect(r.liste).toHaveLength(TAGS_MAX);
    expect(r.ignores).toEqual(['unedeplus']);
  });

  it('ne modifie jamais le tableau reçu', () => {
    const depart = ['a'];
    const r = ajouterTags(depart, 'b');
    expect(depart).toEqual(['a']);
    expect(r.liste).not.toBe(depart);
  });
});

describe('retirerTag', () => {
  it('retire sans tenir compte de la casse', () => {
    expect(retirerTag(['Fraude', 'lyon'], 'FRAUDE')).toEqual(['lyon']);
  });

  it('laisse la liste intacte si l\'étiquette est absente', () => {
    expect(retirerTag(['a'], 'b')).toEqual(['a']);
  });
});

describe('contient', () => {
  it('compare sans tenir compte de la casse', () => {
    expect(contient(['Lyon'], 'lyon')).toBe(true);
    expect(contient(['Lyon'], 'paris')).toBe(false);
  });
});

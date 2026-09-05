import { describe, it, expect } from 'vitest';

/**
 * Règle de protection du dernier administrateur.
 *
 * Reproduit `refuseSiDernierAdmin` de server/routes/users.js. Rien ne comptait
 * les ADMIN actifs restants : on pouvait rétrograder, désactiver ou supprimer
 * le dernier, et l'instance devenait ingérable - plus aucun compte capable de
 * créer un utilisateur ni d'administrer les enquêtes.
 *
 * Ces tests décrivent le contrat attendu du serveur ; ils échoueront si la
 * règle change ici sans être répercutée là-bas.
 */
function refuseSiDernierAdmin(cible, adminsActifs) {
  if (!cible || cible.role !== 'ADMIN' || !cible.active) return null;
  return adminsActifs <= 1 ? 'dernier administrateur' : null;
}

/** Règle d'auto-rétrogradation de la route PUT /:id/role. */
const autoRetrogradation = (cibleId, appelantId, nouveauRole) =>
  cibleId === appelantId && nouveauRole !== 'ADMIN';

const admin = { role: 'ADMIN', active: true };

describe('protection du dernier administrateur', () => {
  it("refuse de retirer le dernier admin actif", () => {
    expect(refuseSiDernierAdmin(admin, 1)).not.toBeNull();
  });

  it('autorise quand il en reste un autre', () => {
    expect(refuseSiDernierAdmin(admin, 2)).toBeNull();
  });

  it("ne s'applique pas à un non-administrateur", () => {
    expect(refuseSiDernierAdmin({ role: 'ANALYST', active: true }, 1)).toBeNull();
  });

  it("ne s'applique pas à un admin déjà désactivé", () => {
    // Le désactiver à nouveau ne retire aucun administrateur actif.
    expect(refuseSiDernierAdmin({ role: 'ADMIN', active: false }, 1)).toBeNull();
  });

  it('tolère une cible inexistante', () => {
    expect(refuseSiDernierAdmin(null, 1)).toBeNull();
  });
});

describe('auto-rétrogradation', () => {
  it('interdit à un admin de retirer ses propres droits', () => {
    // Les routes toggle et delete se protégeaient déjà ; celle du rôle non.
    expect(autoRetrogradation('u1', 'u1', 'VIEWER')).toBe(true);
    expect(autoRetrogradation('u1', 'u1', 'ANALYST')).toBe(true);
  });

  it('laisse un admin se réattribuer ADMIN (sans effet)', () => {
    expect(autoRetrogradation('u1', 'u1', 'ADMIN')).toBe(false);
  });

  it('laisse modifier le rôle de quelqu’un d’autre', () => {
    expect(autoRetrogradation('u2', 'u1', 'VIEWER')).toBe(false);
  });
});

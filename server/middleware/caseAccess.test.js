import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Contrôle d'accès par enquête.
 *
 * Avant ces middlewares, seul `GET /api/cases/:id` vérifiait l'accès : export,
 * save, delete et unlock acceptaient n'importe quel compte authentifié sur
 * n'importe quel identifiant d'enquête. La règle vit maintenant en un seul
 * endroit - donc une régression y serait invisible partout à la fois.
 *
 * Deux propriétés méritent d'être verrouillées par un test :
 *   - un accès manquant répond **404, jamais 403** : un 403 confirmerait
 *     l'existence de l'enquête à qui n'y a pas accès ;
 *   - `requireCaseRole` refuse de fonctionner si `requireCaseAccess` n'a pas
 *     tourné avant, au lieu de laisser passer faute de rôle à comparer.
 */

const findUniqueCase = vi.fn();
const findUniqueAccess = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    case = { findUnique: findUniqueCase };
    caseAccess = { findUnique: findUniqueAccess };
  },
}));

const { requireCaseAccess, requireCaseRole, resolveCaseRole } = await import('./caseAccess.js');

/** Réponse Express minimale : retient le statut et le corps. */
function fausseReponse() {
  const res = {
    statut: null,
    corps: null,
    status(c) { this.statut = c; return this; },
    json(b) { this.corps = b; return this; },
  };
  return res;
}

/** Exécute le middleware et rend { res, suivantAppele }. */
function executer(middleware, req) {
  return new Promise((resolve) => {
    const res = fausseReponse();
    let suivantAppele = false;
    const next = () => { suivantAppele = true; resolve({ res, suivantAppele, req }); };
    // Les réponses d'erreur ne rappellent pas `next` : on résout au prochain tour.
    Promise.resolve(middleware(req, res, next)).then(() => {
      setTimeout(() => resolve({ res, suivantAppele, req }), 0);
    });
  });
}

const ENQUETE = { id: 'case1', status: 'ACTIVE', title: 'Test' };

beforeEach(() => {
  findUniqueCase.mockReset();
  findUniqueAccess.mockReset();
});

describe('resolveCaseRole', () => {
  it('rend le rôle du membre', async () => {
    findUniqueAccess.mockResolvedValue({ role: 'ANALYST' });
    expect(await resolveCaseRole({ id: 'u1', role: 'ANALYST' }, 'case1')).toBe('ANALYST');
  });

  it('rend null pour un non-membre - c’est ce null qui produit le 404', async () => {
    findUniqueAccess.mockResolvedValue(null);
    expect(await resolveCaseRole({ id: 'u2', role: 'ANALYST' }, 'case1')).toBeNull();
  });

  it('donne accès à un ADMIN plateforme sans CaseAccess', async () => {
    findUniqueAccess.mockResolvedValue(null);
    expect(await resolveCaseRole({ id: 'a1', role: 'ADMIN' }, 'case1')).toBe('ADMIN');
  });

  it('fait primer le rôle explicite d’un ADMIN sur l’enquête', async () => {
    // Un ADMIN peut être VIEWER d'une enquête donnée : requireCaseRole le
    // laissera quand même passer, mais le rôle rendu doit rester le vrai.
    findUniqueAccess.mockResolvedValue({ role: 'VIEWER' });
    expect(await resolveCaseRole({ id: 'a1', role: 'ADMIN' }, 'case1')).toBe('VIEWER');
  });
});

describe('requireCaseAccess', () => {
  it('charge req.case et req.caseRole puis passe la main', async () => {
    findUniqueCase.mockResolvedValue(ENQUETE);
    findUniqueAccess.mockResolvedValue({ role: 'OWNER' });

    const { res, suivantAppele, req } = await executer(requireCaseAccess, {
      params: { id: 'case1' }, user: { id: 'u1', role: 'ANALYST' },
    });

    expect(suivantAppele).toBe(true);
    expect(res.statut).toBeNull();
    expect(req.case).toEqual(ENQUETE);
    expect(req.caseRole).toBe('OWNER');
  });

  it('répond 404 - et surtout PAS 403 - à un non-membre', async () => {
    findUniqueCase.mockResolvedValue(ENQUETE);
    findUniqueAccess.mockResolvedValue(null);

    const { res, suivantAppele } = await executer(requireCaseAccess, {
      params: { id: 'case1' }, user: { id: 'intrus', role: 'ANALYST' },
    });

    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(404);
  });

  it('répond 404 sur une enquête supprimée', async () => {
    // La suppression est logique (`status: 'DELETED'`) : la ligne survit, et
    // sans ce test elle resterait accessible à ses anciens membres.
    findUniqueCase.mockResolvedValue({ ...ENQUETE, status: 'DELETED' });
    findUniqueAccess.mockResolvedValue({ role: 'OWNER' });

    const { res, suivantAppele } = await executer(requireCaseAccess, {
      params: { id: 'case1' }, user: { id: 'u1', role: 'ANALYST' },
    });

    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(404);
  });

  it('répond 401 sans utilisateur authentifié', async () => {
    const { res, suivantAppele } = await executer(requireCaseAccess, { params: { id: 'case1' } });
    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(401);
  });

  it('répond 400 sans identifiant d’enquête', async () => {
    const { res, suivantAppele } = await executer(requireCaseAccess, {
      params: {}, user: { id: 'u1', role: 'ANALYST' },
    });
    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(400);
  });

  it('accepte l’identifiant dans le corps - cas de /api/upload', async () => {
    // L'upload ne porte pas le caseId dans son chemin : si cette voie cassait,
    // le middleware répondrait 400 et l'ajout de pièce jointe serait mort.
    findUniqueCase.mockResolvedValue(ENQUETE);
    findUniqueAccess.mockResolvedValue({ role: 'ANALYST' });

    const { suivantAppele, req } = await executer(requireCaseAccess, {
      params: {}, body: { caseId: 'case1' }, user: { id: 'u1', role: 'ANALYST' },
    });

    expect(suivantAppele).toBe(true);
    expect(req.caseRole).toBe('ANALYST');
  });
});

describe('requireCaseRole', () => {
  const lancer = (roles, req) => {
    const res = fausseReponse();
    let suivantAppele = false;
    requireCaseRole(...roles)(req, res, () => { suivantAppele = true; });
    return { res, suivantAppele };
  };

  it('laisse passer un rôle attendu', () => {
    const { res, suivantAppele } = lancer(['OWNER', 'ANALYST'], {
      caseRole: 'ANALYST', user: { role: 'ANALYST' },
    });
    expect(suivantAppele).toBe(true);
    expect(res.statut).toBeNull();
  });

  it('refuse un VIEWER là où il faut écrire', () => {
    const { res, suivantAppele } = lancer(['OWNER', 'ANALYST'], {
      caseRole: 'VIEWER', user: { role: 'ANALYST' },
    });
    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(403);
  });

  it('refuse un ANALYST là où seul le propriétaire agit (restauration, suppression)', () => {
    const { res, suivantAppele } = lancer(['OWNER'], {
      caseRole: 'ANALYST', user: { role: 'ANALYST' },
    });
    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(403);
  });

  it('laisse toujours passer un ADMIN plateforme', () => {
    const { suivantAppele } = lancer(['OWNER'], { caseRole: 'VIEWER', user: { role: 'ADMIN' } });
    expect(suivantAppele).toBe(true);
  });

  it('échoue bruyamment si requireCaseAccess n’a pas tourné avant', () => {
    // Le piège serait de laisser passer faute de rôle à comparer : une route
    // mal chaînée deviendrait ouverte à tous.
    const { res, suivantAppele } = lancer(['OWNER'], { user: { role: 'ANALYST' } });
    expect(suivantAppele).toBe(false);
    expect(res.statut).toBe(500);
  });
});

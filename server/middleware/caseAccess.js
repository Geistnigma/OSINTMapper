/**
 * Contrôle d'accès par enquête.
 *
 * Jusqu'ici seul GET /api/cases/:id vérifiait l'accès : toutes les autres routes
 * (save, export, delete, unlock, access…) acceptaient n'importe quel utilisateur
 * authentifié sur n'importe quel caseId. Ces middlewares centralisent la règle.
 *
 * Usage :
 *   router.get('/:id/export', requireCaseAccess, handler)
 *   router.delete('/:id', requireCaseAccess, requireCaseRole('OWNER'), handler)
 *
 * Après requireCaseAccess :
 *   req.case     → l'enquête chargée (évite un second findUnique dans le handler)
 *   req.caseRole → 'OWNER' | 'ANALYST' | … , ou 'ADMIN' pour un admin non-membre
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Résout le rôle d'un utilisateur sur une enquête.
 * Un ADMIN a accès à tout sans CaseAccess explicite.
 * @returns {Promise<string|null>} le rôle, ou null si aucun accès
 */
export async function resolveCaseRole(user, caseId) {
  if (user.role === 'ADMIN') {
    const access = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId, userId: user.id } },
    });
    return access?.role || 'ADMIN';
  }
  const access = await prisma.caseAccess.findUnique({
    where: { caseId_userId: { caseId, userId: user.id } },
  });
  return access?.role || null;
}

/**
 * Exige un accès à l'enquête. Charge req.case et req.caseRole.
 * L'identifiant est pris dans l'URL, ou dans le corps pour les routes qui ne le
 * portent pas dans leur chemin (l'upload d'image, par exemple).
 */
export function requireCaseAccess(req, res, next) {
  const caseId = req.params.id || req.params.caseId || req.body?.caseId;
  if (!caseId) return res.status(400).json({ code: 'case_id_required', error: 'Case id required' });
  if (!req.user) return res.status(401).json({ code: 'auth_required', error: 'Authentication required' });

  prisma.case.findUnique({ where: { id: caseId } })
    .then(async (c) => {
      if (!c || c.status === 'DELETED') return res.status(404).json({ code: 'case_not_found', error: 'Case not found' });

      const role = await resolveCaseRole(req.user, caseId);
      // 404 plutôt que 403 : ne pas révéler l'existence d'une enquête à qui n'y a pas accès
      if (!role) return res.status(404).json({ code: 'case_not_found', error: 'Case not found' });

      req.case = c;
      req.caseRole = role;
      next();
    })
    .catch((e) => {
      console.error('caseAccess:', e.message);
      res.status(500).json({ code: 'server_error', error: 'Server error' });
    });
}

/**
 * Exige un rôle particulier SUR l'enquête (à chaîner après requireCaseAccess).
 * Un ADMIN de la plateforme passe toujours.
 */
export function requireCaseRole(...roles) {
  return (req, res, next) => {
    if (!req.caseRole) return res.status(500).json({ code: 'server_error', error: 'requireCaseAccess must run first' });
    if (req.user.role === 'ADMIN') return next();
    if (!roles.includes(req.caseRole)) return res.status(403).json({ code: 'forbidden_case', error: 'Insufficient permissions on this case' });
    next();
  };
}

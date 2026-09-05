/**
 * Invitations à une enquête.
 *
 * Le bouton « Inviter » produit un lien /room/<caseId>?invite=<id>.<secret>.
 *
 * L'invitation est PERSISTÉE plutôt qu'encodée dans un JWT autoporteur : un lien
 * transféré par erreur doit pouvoir être annulé. Avec un JWT signé, la seule
 * façon de révoquer aurait été de changer le secret global - ce qui déconnecte
 * tout le monde.
 *
 * Le jeton porté par l'URL est `<id>.<secret>` : l'identifiant permet de
 * retrouver la ligne, le secret est comparé à son empreinte SHA-256 en base, de
 * sorte qu'une fuite de la base ne permette pas de fabriquer des liens valides.
 */
import crypto from 'crypto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const ALLOWED_ROLES = ['ANALYST', 'VIEWER'];

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Crée une invitation et retourne le jeton à placer dans l'URL.
 * Le secret en clair n'est connu qu'ici : seule son empreinte est stockée.
 */
// VIEWER par défaut : une invitation circule (lien, message, copier-coller) et
// peut être présentée par quelqu'un d'autre que le destinataire prévu. On
// n'accorde donc jamais l'écriture sans un geste explicite du propriétaire.
export async function createInvite(prisma, caseId, createdBy, role = 'VIEWER') {
  const granted = ALLOWED_ROLES.includes(role) ? role : 'VIEWER';
  const secret = crypto.randomBytes(24).toString('base64url');

  const invite = await prisma.invite.create({
    data: {
      id: sha256(secret).slice(0, 24), // identifiant dérivé, non devinable
      caseId,
      role: granted,
      createdBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return { token: `${invite.id}.${secret}`, expiresAt: invite.expiresAt, role: granted };
}

/**
 * Valide un jeton d'invitation pour une enquête donnée.
 * @returns {{invite}|null} null si inconnu, révoqué, expiré, ou émis pour une autre enquête
 */
export async function verifyInvite(prisma, token, caseId) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [id, secret] = token.split('.');
  if (!id || !secret) return null;

  // L'identifiant est dérivé du secret : un id qui ne correspond pas au secret
  // présenté est rejeté sans même consulter la base.
  if (sha256(secret).slice(0, 24) !== id) return null;

  const invite = await prisma.invite.findUnique({ where: { id } });
  if (!invite) return null;
  if (invite.caseId !== caseId) return null;
  if (invite.revokedAt) return null;
  if (invite.expiresAt < new Date()) return null;

  return invite;
}

/** Marque une invitation comme utilisée (compteur, pour l'audit). */
export async function consumeInvite(prisma, inviteId) {
  await prisma.invite.update({
    where: { id: inviteId },
    data: { usedCount: { increment: 1 } },
  });
}

/** Révoque une invitation. */
export async function revokeInvite(prisma, inviteId, caseId) {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.caseId !== caseId) return false;
  await prisma.invite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  return true;
}

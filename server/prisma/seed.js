/**
 * Amorçage : garantit qu'il existe un compte administrateur.
 *
 * ⚠ Ce script ne touche JAMAIS à un compte existant.
 *
 * Il remettait auparavant le mot de passe de l'admin à « admin » à chaque
 * exécution - un vestige de la migration bcrypt → bcryptjs. Or DEPLOY.md lance
 * `prisma db seed` à l'installation, et la moindre réexécution (réinstallation,
 * mise à jour, ./start.sh --dev, redémarrage d'un conteneur) rouvrait donc
 * silencieusement le compte administrateur d'une application exposée sur
 * internet, sans rien afficher qui le laisse deviner.
 *
 * Le mot de passe initial vaut `osintmapper` : un identifiant de démarrage
 * connu, documenté dans le README, qui évite d'aller le pêcher dans les
 * journaux d'un conteneur. Il est PUBLIC par construction - quiconque a lu ce
 * dépôt le connaît - et n'a donc de sens que le temps de la première connexion.
 *
 * Deux garde-fous en découlent :
 *   - le script ne réécrit jamais un compte existant, donc le mot de passe
 *     changé ne revient pas à sa valeur d'usine au redémarrage suivant ;
 *   - pour ne jamais l'exposer, le fournir dès la première exécution :
 *     ADMIN_PASSWORD=… node prisma/seed.js
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;

/**
 * Mot de passe d'usine.
 *
 * Il fait 11 caractères, soit un de moins que le minimum imposé aux mots de
 * passe choisis par un utilisateur (MIN_PASSWORD_LENGTH, appliqué ci-dessous à
 * ADMIN_PASSWORD comme dans routes/auth.js et routes/users.js). L'exception est
 * délibérée et limitée à cette valeur d'amorçage : sa longueur ne protège rien
 * puisqu'elle est publiée. La règle des 12 caractères s'applique dès le premier
 * changement.
 */
const DEFAULT_ADMIN_PASSWORD = 'osintmapper';

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: 'admin' } });

  if (existing) {
    console.log('  👤 Compte admin déjà présent - mot de passe inchangé.');
    console.log('     (Mot de passe perdu ? Le réinitialiser depuis un autre compte ADMIN,');
    console.log('      ou supprimer la ligne User correspondante puis relancer ce script.)');
    return;
  }

  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length < MIN_PASSWORD_LENGTH) {
    console.error(`  ✖ ADMIN_PASSWORD trop court (min ${MIN_PASSWORD_LENGTH} caractères).`);
    process.exit(1);
  }

  const password = fromEnv || DEFAULT_ADMIN_PASSWORD;
  const hash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username: 'admin',
      displayName: 'Administrateur',
      passwordHash: hash,
      role: 'ADMIN',
      // Compte d'amorçage : ni supprimable, ni désactivable, ni rétrogradable.
      // C'est le filet qui garantit qu'une instance garde toujours quelqu'un
      // pour créer des comptes et gérer les accès.
      protected: true,
    },
  });

  console.log('\n  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║  Compte administrateur créé                              ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('     identifiant  : admin');
  if (fromEnv) {
    console.log('     mot de passe : celui fourni via ADMIN_PASSWORD');
    console.log('');
  } else {
    console.log(`     mot de passe : ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('\n  ⚠ CE MOT DE PASSE EST PUBLIC : il est écrit dans le README et dans');
    console.log('    le code source. Le changer à la première connexion, AVANT toute');
    console.log('    exposition de l\'instance sur un réseau.');
    console.log('    (Pour ne jamais l\'exposer : ADMIN_PASSWORD=… au premier démarrage.)\n');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

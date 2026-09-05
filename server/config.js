import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

/**
 * Le secret JWT ne doit JAMAIS être improvisé en production.
 *
 * Auparavant il retombait silencieusement sur `randomBytes` : un `.env` mal
 * chargé et le serveur démarrait quand même, avec un secret neuf à chaque
 * redémarrage - toutes les sessions invalidées sans explication, et surtout
 * aucun signal que la configuration n'était pas lue. Or si JWT_SECRET manque,
 * NODE_ENV manque probablement aussi : CORS repasse alors en `origin: true`
 * (reflet de n'importe quelle origine, avec cookies) et le client statique
 * n'est plus servi du tout. Mieux vaut refuser de démarrer.
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32 && !fromEnv.startsWith('CHANGE_ME')) return fromEnv;

  if (isProd) {
    console.error(
      '\n  ✖ JWT_SECRET absent, trop court (< 32 caractères) ou laissé à sa valeur d\'exemple.\n' +
      '    Générer un secret :  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n' +
      '    puis le placer dans server/.env - et vérifier que ce fichier est bien chargé\n' +
      '    (pm2 … --node-args="--env-file=.env").\n'
    );
    process.exit(1);
  }

  if (fromEnv) {
    console.warn('  ⚠ JWT_SECRET trop court - toléré en développement uniquement.');
    return fromEnv;
  }
  console.warn('  ⚠ JWT_SECRET absent : secret éphémère généré (développement uniquement).');
  return crypto.randomBytes(32).toString('hex');
}

export const config = {
  port: parseInt(process.env.PORT) || 4444,
  // 127.0.0.1 par défaut : le process est censé vivre derrière nginx. Écouter
  // sur 0.0.0.0 par défaut exposait le port 4444 en direct sur internet dès que
  // le pare-feu était mal réglé - le défaut sûr est le plus fermé.
  host: process.env.BIND_HOST || (isProd ? '127.0.0.1' : '0.0.0.0'),
  jwtSecret: resolveJwtSecret(),
  jwtExpiry: '24h',
  bcryptRounds: 12,
  nodeEnv,
  isProd,
  clientDist: process.env.CLIENT_DIST || '../client/dist',

  /**
   * Racine des données d'enquête : fichiers d'enquête, pièces jointes,
   * instantanés, plugins déposés à l'exécution. La base SQLite n'est PAS
   * dedans - elle vit dans server/prisma/data/, parce que Prisma résout une
   * URL relative depuis le dossier du schéma (voir DATABASE_URL).
   *
   * Le chemin était figé dans quatre fichiers (`caseFile.js`, `snapshots.js`,
   * `archive.js`, `index.js`), ce qui interdisait de poser les enquêtes
   * ailleurs que dans l'arborescence du code - sur un volume chiffré, un
   * disque dédié ou un montage sauvegardé à part. Tout doit désormais en
   * dériver, et rien ne doit reconstruire `path.join(__dirname, 'data')`.
   *
   * Résolu en absolu : le serveur est lancé depuis des répertoires courants
   * différents selon le mode (racine en développement, /app/server dans le
   * conteneur), un chemin relatif ne désignerait pas le même dossier.
   */
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, 'data'),

  /**
   * Origine publique (https://enquetes.exemple.fr). Sert à autoriser le
   * WebSocket dans la CSP sur les navigateurs qui ne font pas encore
   * correspondre `'self'` aux schémas ws/wss.
   */
  publicOrigin: process.env.PUBLIC_ORIGIN || '',

  /**
   * Filet de sécurité de déploiement : passer CSP_REPORT_ONLY=true livre la
   * politique en observation (violations en console, rien n'est bloqué) le
   * temps de vérifier la carte et le magasin de plugins sur le domaine réel.
   */
  cspReportOnly: process.env.CSP_REPORT_ONLY === 'true',

  /**
   * Nombre de reverse-proxies devant l'application.
   *
   * Détermine jusqu'où `X-Forwarded-For` est cru, donc quelle IP sert de clé
   * aux limiteurs de débit. La valeur était câblée à `1`, ce qui est correct
   * derrière un nginx - mais faux dès que le port est joignable en direct :
   * l'en-tête devient alors forgeable, et le limiteur de connexion se contourne
   * avec une valeur différente à chaque essai.
   *
   * `0` = ne croire personne (cas d'un conteneur exposé sans proxy).
   */
  trustProxy: Number.isNaN(parseInt(process.env.TRUST_PROXY, 10))
    ? 1
    : parseInt(process.env.TRUST_PROXY, 10),

  /**
   * Plafond de stockage des pièces jointes, par enquête (octets).
   *
   * Rien ne limitait le cumul : seul le poids d'UN fichier était plafonné à
   * 10 Mo. Sur une base SQLite et un volume unique, un disque plein met la base
   * en lecture seule - la panne déborde donc largement des pièces jointes.
   */
  uploadQuotaPerCase: parseInt(process.env.UPLOAD_QUOTA_PER_CASE, 10) || 500 * 1024 * 1024,

  /**
   * Émettre le cookie de session SANS l'attribut `Secure`.
   *
   * À n'activer que sur une instance délibérément servie en clair - un réseau
   * interne, un VPN, une démonstration. Le cookie voyage alors en clair : qui
   * observe le réseau capte la session.
   *
   * Pourquoi ce réglage existe : un cookie `Secure` n'est **pas enregistré par
   * le navigateur** sur une origine `http://` autre que `localhost`. Sur un VPS
   * joint par son IP sans TLS, la connexion réussissait donc en HTTP 200 puis
   * tout retombait en 401 - sans le moindre message, puisque du point de vue du
   * serveur le cookie avait bien été envoyé. Le symptôme, lui, était muet :
   * page qui se charge, temps réel mort.
   */
  allowInsecureCookie: process.env.ALLOW_INSECURE_COOKIE === 'true',
};

const allowInsecureCookie = config.allowInsecureCookie;
if (isProd && allowInsecureCookie) {
  console.warn(
    '\n  ⚠ ALLOW_INSECURE_COOKIE=true : le cookie de session part SANS `Secure`.\n' +
    '    Acceptable sur un réseau de confiance uniquement. Devant internet,\n' +
    '    mettre un reverse-proxy TLS et retirer ce réglage.\n'
  );
}

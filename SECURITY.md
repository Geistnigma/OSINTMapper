# Politique de sécurité

OSINTMapper héberge des dossiers d'enquête. Une faille n'y coûte pas un service
indisponible : elle expose le travail et les sources de quelqu'un. Les rapports
sont donc les bienvenus, y compris sur des points mineurs.

## Signaler une faille

**N'ouvrez pas d'issue publique.** Passez par l'avis de sécurité privé de
GitHub :

**<https://github.com/Geistnigma/OSINTMapper/security/advisories/new>**

Le rapport le plus utile contient :

- la version ou le commit testé, et le chemin d'installation (`./start.sh`,
  Docker, développement) ;
- les étapes de reproduction, aussi courtes que possible ;
- ce que la faille permet d'obtenir concrètement — lire une enquête dont on
  n'est pas membre, écrire en étant `VIEWER`, récupérer un jeton de session ;
- le rôle du compte utilisé, s'il y en a un : `VIEWER`, `ANALYST`, `OWNER` sur
  l'enquête, ou `ADMIN` de la plateforme. La distinction change tout : un ADMIN
  de plateforme a délibérément accès à tout.

**Ce à quoi vous attendre.** Le projet est en alpha et maintenu par une seule
personne : aucun délai n'est garanti. L'accusé de réception vient dès que
possible, la correction est publiée dans une version et créditée dans l'avis,
sauf si vous préférez l'anonymat.

## Versions suivies

| Version | Corrections de sécurité |
|---|---|
| `0.1.x` (alpha) | oui |
| antérieures | non — mettez à jour |

Il n'y a pas de branche de maintenance : la correction part sur la version
courante.

## Périmètre

**Dans le périmètre**, par ordre de gravité décroissante :

- accès aux données d'une enquête dont le compte n'est pas membre — routes HTTP,
  socket Yjs (`/yjs/:caseId`), socket custom (`/ws-custom`), pièces jointes,
  instantanés, export ;
- écriture par un compte `VIEWER`, sous n'importe quelle forme ;
- contournement de l'authentification, élévation vers `ADMIN`, vol ou rejeu de
  jeton de session ou de ticket WebSocket ;
- XSS, injection HTML, traversée de chemin, injection dans une requête sortante
  (les proxys géographiques `/api/geocode` et `/api/route`) ;
- fuite du secret de session, d'une clé de chiffrement d'enquête, ou du contenu
  d'un fichier chiffré ;
- résidus sur le disque après suppression d'une enquête.

**Hors périmètre :**

- le déni de service par un membre authentifié de l'enquête — il a déjà le droit
  d'écrire dans le graphe ;
- une instance exposée sans reverse-proxy TLS, sans `JWT_SECRET`, ou avec le mot
  de passe d'amorçage `admin` inchangé : c'est une erreur de déploiement, et les
  trois sont documentées comme telles dans [DEPLOY.md](DEPLOY.md) ;
- ce qu'un plugin installé peut faire (voir ci-dessous) ;
- les avis `npm audit` déjà connus (voir ci-dessous) ;
- l'absence d'en-tête ou de durcissement sans impact démontré.

## Limites connues et assumées

Ce ne sont pas des failles à signaler : ce sont des choix, documentés ici pour
qu'ils ne soient pas découverts comme des surprises.

- **Un plugin installé s'exécute avec les droits de l'application.** Le champ
  `permissions` d'un manifeste est déclaratif et ne restreint rien. C'est
  pourquoi le dépôt d'un plugin est réservé aux comptes `ADMIN`, avec empreinte
  SHA-256 enregistrée et journalisée. N'installez que ce dont vous répondez.
- **L'approbation d'entrée dans une salle est un contrôle de salle, pas une
  barrière de sécurité.** Le droit d'accès vit dans la base ; un refus ne le
  révoque pas. Corollaire assumé : si aucun modérateur n'est connecté, l'arrivant
  est admis — en lecture seule — et l'événement est journalisé.
- **Un `ADMIN` de la plateforme n'est pas soumis aux rôles par enquête.** Il
  écrit partout, quel que soit son rôle affiché sur l'enquête. Créez les
  collaborateurs en `ANALYST`.
- **Toute invitation donne la lecture seule**, sans exception : un lien circule
  et se transfère. Le droit d'écrire s'accorde nommément, à une personne
  présente.
- **`npm audit` signale 6 vulnérabilités en dépendances de production.** Trois
  (`deepmerge-ts` → `@prisma/config` → `prisma`) vivent dans le **CLI** Prisma,
  jamais importé par le serveur et seulement lancé pour `migrate deploy` au
  démarrage. Les trois autres (`qs`, `body-parser`, `express`) sont des dénis de
  service par chaîne de requête, qu'Express 4 épingle : seule la migration vers
  Express 5 les corrige à la source, et [DEPLOY.md](DEPLOY.md) documente la
  mitigation nginx en attendant. Ne lancez pas `npm audit fix --force` : il
  installerait Express 5 et une *release candidate* de Prisma d'un coup.
- **Le chat n'est pas persisté** et vit en mémoire du client (100 messages).
- **La fusion collaborative s'arrête au premier niveau de champ** : deux clients
  modifiant `metadata` en même temps s'écrasent.

## Durcir son instance

L'essentiel tient en quelques règles, détaillées dans
[DEPLOY.md](DEPLOY.md#points-à-ne-pas-défaire) : `JWT_SECRET` obligatoire,
écoute sur `127.0.0.1` derrière un reverse-proxy TLS, mot de passe d'amorçage
changé avant toute exposition, `server/.env` en 0600, aucun process Yjs séparé,
`/api/health` réservé aux `ADMIN` (utilisez `/api/ping` pour la supervision).

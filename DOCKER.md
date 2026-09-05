# Déployer OSINTMapper en conteneur

Un seul conteneur : l'API Express sert le client statique **et** les deux
WebSockets (`/yjs` pour le graphe, `/ws-custom` pour le chat et les rôles). La
base est SQLite. Il n'y a **pas** de service Yjs séparé à lancer - ce fut le
cas par le passé, sur un port sans authentification.

---

## Démarrage rapide

```bash
cp .env.docker.example .env
# renseigner JWT_SECRET :
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

docker compose up -d --build
docker compose logs app
```

L'instance écoute sur <http://localhost:4444>. Identifiant `admin`, mot de passe
`osintmapper`.

> ⚠ **Ce mot de passe est public** - il est écrit dans le README et dans le code
> source. Le changer à la première connexion, avant toute exposition de
> l'instance sur un réseau. Pour ne jamais l'exposer, renseigner
> `ADMIN_PASSWORD` dans `.env` avant le premier `up` (12 caractères minimum).
>
> Le seed ne réécrit **jamais** un compte existant : le mot de passe changé ne
> revient pas à sa valeur d'usine au redémarrage suivant, alors même que
> l'entrypoint relance le seed à chaque démarrage.

> L'inscription libre est désactivée par conception : c'est l'administrateur qui
> crée les comptes, depuis l'écran Admin.

### Podman

Les mêmes fichiers, sans adaptation :

```bash
podman-compose up -d --build
podman-compose logs app
```

Le fichier s'appelle `docker-compose.yml` et non `compose.yaml` précisément pour
que toutes les versions de `podman-compose` le trouvent.

En **rootless**, l'UID 1000 du conteneur est projeté dans un sous-UID de l'hôte.
Les volumes nommés héritent de la propriété du dossier tel qu'il est dans
l'image (attribuée à `node` par le Dockerfile), donc le cas normal fonctionne.
Si les journaux montrent malgré tout un `EACCES` sur `server/data`, ajouter
`:U` au montage pour que Podman réattribue le volume :

```yaml
- data:/app/server/data:U
```

---

## Ce qui persiste

Deux volumes nommés, parce que ce sont **deux emplacements distincts** :

| Volume | Chemin dans le conteneur | Contenu |
|---|---|---|
| `db` | `/app/server/prisma/data` | base SQLite (comptes, enquêtes, accès, journal d'audit) |
| `data` | `/app/server/data` | fichiers d'enquête, pièces jointes, instantanés, plugins déposés |

Prisma résout une URL relative **depuis le dossier du schéma**, pas depuis
`server/` : la base n'est donc pas dans `server/data/`. Une sauvegarde qui
n'emporte que le second volume ne sauvegarde pas la base - c'est l'erreur
classique, et elle est silencieuse jusqu'au jour de la restauration.

```bash
# Sauvegarde des deux volumes
docker run --rm -v osintmapper_db:/db -v osintmapper_data:/data \
  -v "$PWD":/out alpine tar czf /out/osintmapper-backup.tar.gz /db /data
```

Le nom réel des volumes dépend du nom du projet compose (par défaut celui du
dossier) - le vérifier avec `docker volume ls`.

---

## Exposition réseau

Par défaut le port est publié **sur `127.0.0.1` uniquement**. Ce n'est pas de la
prudence gratuite : en production, le cookie de session porte l'attribut
`Secure`, que les navigateurs n'acceptent en HTTP que sur `localhost`. Publier
tel quel sur un réseau donnerait une page qui s'affiche mais où **la connexion
échoue silencieusement**.

Pour un accès distant, placer un reverse-proxy TLS devant le conteneur (nginx,
Caddy, Traefik) et renseigner dans `.env` :

```
PUBLIC_ORIGIN=https://enquetes.exemple.fr
```

Cette variable autorise explicitement le WebSocket dans la Content-Security-Policy
pour les navigateurs qui ne font pas encore correspondre `'self'` aux schémas
`ws`/`wss`. La CSP est énumérée et `connect-src` reste fermé sur l'origine
propre : c'est ce qui empêche un bundle de plugin compromis d'exfiltrer une
enquête. **Ne pas y ajouter d'origine pour faire taire une erreur de console.**

Le proxy doit transmettre les WebSockets (`Upgrade` / `Connection`) sur `/yjs`
et `/ws-custom`, sans quoi la collaboration temps réel ne s'établit pas.
DEPLOY.md contient une configuration nginx complète, réutilisable en pointant
`proxy_pass` sur le conteneur.

---

## Mise à jour

```bash
git pull
docker compose up -d --build
```

Les migrations Prisma sont appliquées au démarrage par
`docker-entrypoint.sh` (`prisma migrate deploy` : n'applique que ce qui manque,
ne propose jamais de reset). Le seed ne touche jamais à un compte existant.

Sauvegarder les volumes avant une montée de version reste la règle : un
instantané d'enquête est un filet à l'échelle d'une enquête, pas d'une instance.

---

## Notes de construction

Points sur lesquels le `Dockerfile` précédent échouait, à ne pas réintroduire :

- **`npm ci` se lance à la racine**, jamais dans `client/` ou `server/`. C'est un
  monorepo npm workspaces : le lockfile est unique et vit à la racine, les
  workspaces n'en ont pas. `npm ci` lancé depuis un workspace s'arrête aussitôt.
- **Ne pas copier `plugins/` ni `shared/`** : ces dossiers n'existent plus. Les
  plugins natifs sont compilés dans le bundle client ; ceux déposés à
  l'exécution vivent dans le volume `data`.
- **`prisma generate` se fait dans l'image finale.** Le moteur Prisma est un
  binaire lié à la plateforme : celui généré sur un hôte glibc est inutilisable
  dans une image musl (Alpine).
- **`prisma` (le CLI) est une dépendance de production**, pas de développement :
  l'entrypoint en a besoin dans une image installée avec `--omit=dev`.
- **`--omit=optional`** écarte `y-leveldb`/`leveldown`, dépendances optionnelles
  de y-websocket sans binaire précompilé pour musl - elles déclencheraient une
  compilation native à chaque build. Leur `require` est conditionnel et cette
  persistance n'est pas activée : le serveur libère le doc Yjs quand la salle se
  vide, pour que le fichier JSON redevienne la source de vérité.
- **`BIND_HOST=0.0.0.0` est indispensable dans un conteneur.** Le défaut du
  serveur est `127.0.0.1`, pensé pour un process derrière nginx sur le même
  hôte ; dans un conteneur c'est la boucle locale du conteneur, et le port
  publié reste injoignable. Ici, c'est l'isolement réseau du conteneur qui joue
  le rôle du pare-feu.
- **`.dockerignore` n'exclut que les `.md` de la racine.** Les `docs.md` des
  plugins sont importés en `?raw` par leurs manifestes et par le glob de
  `registry.js` : les exclure casse le build du client, pas seulement sa
  documentation. Il exclut en revanche `**/.env` - un motif sans barre oblique
  ne vaut qu'à la racine, et `COPY server/ ./server/` embarquerait sinon le
  secret JWT de la machine de développement dans l'image.
- **tini est PID 1.** Le serveur n'installe aucun gestionnaire de signal, et un
  process PID 1 ignore les signaux laissés à leur disposition par défaut :
  `docker stop` attendait dix secondes puis tuait le process. La sauvegarde est
  atomique (tmp → bak → rename), donc rien n'était corrompu - mais un arrêt
  propre reste préférable.

---

## Développement

Le conteneur sert le **build de production**. Pour développer, ne pas passer par
Docker :

```bash
./start.sh --dev        # amorce ce qui manque, puis lance tout
# ou, une fois amorcé :
npm run dev             # serveur (4444, --watch) + client Vite (5173)
```

Ce mode écrit une configuration de développement et amorce une base : il refuse
de tourner sur une installation dont le `server/.env` est en production. Il a
remplacé `dev-setup.sh`, dont le nom d'origine - `deploy.sh` - invitait à le
lancer là où il ne fallait surtout pas.

Autre chemin de déploiement : **DEPLOY.md**, pour une installation par
`./start.sh` sur un hôte (service systemd, reverse-proxy TLS, sauvegardes).

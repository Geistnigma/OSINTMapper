# OSINTMapper v0.1 - Déploiement Production (Hostinger VPS)

> **Une instance tourne déjà avec des données réelles ?** Ne pas suivre les
> étapes 1 à 5 telles quelles - elles décrivent une installation neuve et
> `prisma db seed` / `db push` n'ont rien à y faire. Aller directement à
> [Mise à niveau d'une instance existante](#mise-à-niveau-dune-instance-existante).

## Prérequis serveur

- Ubuntu 22.04+ (ou Debian 12+)
- Node.js 20+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash && sudo apt install -y nodejs`)
- nginx (reverse proxy)
- certbot (HTTPS)
- pm2 (`npm install -g pm2`)

---

## 1. Upload et installation

> **L'application ne tourne pas en root.** L'utilisateur dédié était créé à cette
> étape puis jamais utilisé : PM2 et le process Node tournaient en root, si bien
> qu'une exécution de code arbitraire dans Node valait compromission complète du
> VPS. Tout ce qui suit fait tourner l'application sous `osintmapper`.

```bash
# Utilisateur de service dédié. --system : pas de mot de passe, shell
# /usr/sbin/nologin - personne ne s'y connecte, mais `sudo -u` et systemd
# lancent des commandes en son nom sans avoir besoin d'un shell.
# Le répertoire personnel est nécessaire : PM2 y range son état (~/.pm2).
sudo adduser --system --group --home /home/osintmapper osintmapper

sudo mkdir -p /opt/osintmapper
```

```bash
# Transférer l'archive (depuis votre machine)
scp osintmapper-v0.1.tar.gz root@VOTRE_IP:/opt/osintmapper/
```

```bash
# Sur le VPS
cd /opt/osintmapper
tar -xzf osintmapper-v0.1.tar.gz
cd osintmapper-v0.1

# --include=dev : vite est une devDependency et sert au build du client.
# Sans ce drapeau, un NODE_ENV=production présent dans l'environnement du shell
# ferait sauter son installation et le build échouerait.
npm install --workspaces --include=dev
```

L'installation (npm, migrations, build) se fait en root ; **seule l'exécution**
passe sous `osintmapper`. Les droits sont posés à l'étape 4, une fois le `.env`
écrit et la base créée - les poser plus tôt ferait échouer les étapes 2 et 3.

## 2. Configuration .env

```bash
cp .env.example server/.env
```

**CRITIQUE - générer un vrai JWT_SECRET :**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copier la sortie dans `JWT_SECRET=` de `server/.env`, et renseigner
`PUBLIC_ORIGIN` avec le domaine réel.

Le serveur **refuse de démarrer** en production si `JWT_SECRET` est absent, plus
court que 32 caractères ou laissé à sa valeur d'exemple. C'est voulu : il
retombait auparavant sur un secret aléatoire régénéré à chaque redémarrage, ce
qui masquait un `.env` non chargé - or si `NODE_ENV` n'est pas lu non plus, CORS
repasse en mode permissif et le client statique n'est plus servi du tout.

## 3. Base de données et build

> **⚠ STOP si une instance existe déjà.** Les commandes ci-dessous créent une
> base *vide* et un compte admin. Elles n'effacent rien, mais la nouvelle
> installation partirait sans vos comptes ni vos enquêtes, et vous vous en
> apercevriez au premier login. Les étapes 1 et 2 que vous venez de faire sont
> les bonnes et restent acquises : enchaînez sur
> [Mise à niveau d'une instance existante](#mise-à-niveau-dune-instance-existante),
> qui reprend exactement ici (son étape 3).

> L'ordre compte. `prisma migrate deploy` lit `DATABASE_URL` **dans
> `server/.env`** : cette étape était placée avant la création du fichier, donc
> elle ne pouvait pas fonctionner sur une installation neuve.

```bash
cd /opt/osintmapper/osintmapper-v0.1/server
npx prisma generate
npx prisma migrate deploy
ADMIN_PASSWORD='…' npx prisma db seed   # ⚠ sinon le mot de passe vaut `osintmapper`, valeur publique
cd ../client && npm run build && cd ..
```

## 4. Droits - l'application ne doit pas pouvoir se réécrire

```bash
cd /opt/osintmapper/osintmapper-v0.1

# Le code appartient à root : le process ne peut que le lire. Un attaquant qui
# obtiendrait l'exécution dans Node ne peut donc pas se rendre persistant en
# réécrivant index.js ou un bundle du client.
sudo chown -R root:root .

# Seules les données sont accessibles en écriture au service.
#   server/data/        enquêtes, pièces jointes, instantanés, plugins déposés
#   server/prisma/data/ base SQLite (le DOSSIER doit être accessible en écriture :
#                       SQLite y crée aussi les fichiers -wal et -shm)
sudo mkdir -p server/data/{cases,uploads,snapshots,plugins} server/prisma/data
sudo chown -R osintmapper:osintmapper server/data server/prisma/data
sudo chmod -R o-rwx server/data server/prisma/data

# Le .env porte le JWT_SECRET : lisible par le service, modifiable par root seul,
# invisible pour tout autre compte du système.
sudo chown root:osintmapper server/.env
sudo chmod 640 server/.env
```

## 5. PM2 - Process manager

```bash
cd /opt/osintmapper/osintmapper-v0.1/server

# -H : PM2 doit écrire son état dans le HOME d'osintmapper, pas dans celui de root.
# --env-file est INDISPENSABLE : rien dans le code n'importe dotenv. Le .env
# n'était lu que par effet de bord du client Prisma ; le jour où cela cesse,
# toute la configuration de sécurité retombe sur ses valeurs par défaut.
# (Node 20.6+ requis.)
sudo -u osintmapper -H pm2 start index.js \
  --name osintmapper-api \
  --node-args="--env-file=.env"

# Le serveur Yjs (collaboration temps réel) est intégré à l'API depuis la
# Il est servi sur /yjs avec authentification. Plus de process séparé.
# Si vous mettez à jour depuis une version antérieure :
#   sudo -u osintmapper -H pm2 delete osintmapper-yjs

# Redémarrage automatique au boot : le service systemd est installé en root mais
# lance PM2 SOUS osintmapper (-u), d'où les deux commandes.
sudo -u osintmapper -H pm2 save
sudo env PATH=$PATH pm2 startup systemd -u osintmapper --hp /home/osintmapper
```

**Vérifier que rien ne tourne en root** - la colonne `USER` doit afficher
`osintmap` (tronqué à 8 caractères), et la ligne `env:` `production` :

```bash
# PM2 renomme le process avec le nom de l'application - d'où le préfixe
# « 0|osintmap » dans les logs. `ps -C` filtre sur ce nom court (`comm`, 15
# caractères), et « osintmapper-api » en fait exactement 15 : il n'existe donc
# AUCUN process nommé `node`, et `ps -C node` répond une liste vide même quand
# tout va bien. Ce n'est pas une panne.
ps -o user,cmd -C osintmapper-api

# Variante indépendante du nommage PM2, si le nom de l'application change :
ps -eo user,pid,comm,args | grep -i osintmapper | grep -v grep

sudo -u osintmapper -H pm2 logs osintmapper-api --lines 20
```

> `pm2` invoqué sans `sudo -u osintmapper -H` s'adresse au démon de **root** - > un second démon, qui ne voit pas le process. Si `pm2 list` semble vide, c'est
> presque toujours ça.

## 6. Nginx - Reverse proxy + HTTPS

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Créer `/etc/nginx/sites-available/osintmapper` :

```nginx
server {
    listen 80;
    server_name VOTRE_DOMAINE;

    # Redirect HTTP → HTTPS (certbot le fait automatiquement)
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name VOTRE_DOMAINE;

    # Les certificats seront ajoutés par certbot
    # ssl_certificate /etc/letsencrypt/live/VOTRE_DOMAINE/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/VOTRE_DOMAINE/privkey.pem;

    # Les en-têtes de sécurité (CSP, HSTS, nosniff, frame-ancestors…) sont posés
    # par helmet côté application, au plus près du code qui sait ce dont il a
    # besoin. Ne pas les redéclarer ici : deux CSP concurrentes s'intersectent
    # et produisent des blocages impossibles à diagnostiquer.
    #
    # X-XSS-Protection a été retiré volontairement : l'en-tête est obsolète et
    # son filtre introduisait lui-même des failles ; helmet l'envoie à 0.

    # Les pièces jointes transitent en base64 : une image de 10 Mo pèse ~13,4 Mo
    # dans le corps de la requête. Sans cette ligne, nginx coupe à 1 Mo (défaut)
    # et tout envoi d'image un peu lourde échoue en 413.
    client_max_body_size 15m;

    # API + WebSocket
    location /api/ {
        proxy_pass http://127.0.0.1:4444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws-custom {
        proxy_pass http://127.0.0.1:4444;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Yjs WebSocket (collaboration sync) - servi par l'API, authentifié par JWT
    location /yjs {
        proxy_pass http://127.0.0.1:4444;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Client statique
    location / {
        proxy_pass http://127.0.0.1:4444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/osintmapper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# HTTPS avec Let's Encrypt
sudo certbot --nginx -d VOTRE_DOMAINE
```

## 7. Premier login

Le compte administrateur est créé par `prisma db seed` (étape 1). À défaut de
`ADMIN_PASSWORD`, son mot de passe vaut **`osintmapper`** - une valeur d'usine
documentée dans le README et écrite dans le code source, donc **publique**.

Sur une instance exposée sur internet, ce n'est pas acceptable au-delà de
quelques minutes : **fournir `ADMIN_PASSWORD` dès le premier seed**, ce qui
évite que le compte existe ne serait-ce qu'un instant avec un mot de passe
connu.

Ce que le seed garantit en revanche, et qui ne l'a pas toujours été :
il **ne réécrit jamais un compte existant**. Une réinstallation, une mise à jour
ou un redémarrage de conteneur ne ramène pas le mot de passe à sa valeur
d'usine.

1. `ADMIN_PASSWORD='…' npx prisma db seed` à l'installation.
2. Aller sur `https://VOTRE_DOMAINE`, se connecter en `admin`
3. Changer le mot de passe depuis le panneau admin (12 caractères minimum)
4. Créer les comptes utilisateurs nécessaires

> Mot de passe admin perdu : le réinitialiser depuis un autre compte ADMIN.
> Relancer le seed ne le réinitialisera pas.

## 8. Sauvegardes automatiques

> ⚠ La base SQLite est dans **`server/prisma/data/`**, pas `server/data/` :
> Prisma résout une URL SQLite relative depuis le dossier du schéma. Le script
> précédent copiait `server/data/osintmapper.db`, qui n'existe pas - le `cp`
> échouait à chaque heure et la base n'a jamais été sauvegardée. Les pièces
> jointes (`uploads/`) et les points de restauration (`snapshots/`) étaient
> également absents de l'archive.

```bash
# Créer un script de backup
cat > /opt/osintmapper/backup.sh << 'EOF'
#!/bin/bash
set -u
ROOT="/opt/osintmapper/osintmapper-v0.1"
BACKUP_DIR="/opt/osintmapper/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)

# Base SQLite - via l'API de sauvegarde, qui produit une copie cohérente même
# si une écriture est en cours (le mode WAL rend un simple cp risqué).
sqlite3 "$ROOT/server/prisma/data/osintmapper.db" ".backup '$BACKUP_DIR/db_$DATE.sqlite'"

# Données d'enquête : fichiers de graphe, pièces jointes, points de restauration
tar -czf "$BACKUP_DIR/data_$DATE.tar.gz" -C "$ROOT/server/data" cases uploads snapshots

# Garder 30 derniers backups
ls -t "$BACKUP_DIR"/db_*.sqlite | tail -n +31 | xargs rm -f 2>/dev/null
ls -t "$BACKUP_DIR"/data_*.tar.gz | tail -n +31 | xargs rm -f 2>/dev/null

# Les sauvegardes contiennent des données d'enquête : lisibles par leur seul
# propriétaire.
chmod 600 "$BACKUP_DIR"/db_$DATE.sqlite "$BACKUP_DIR"/data_$DATE.tar.gz

echo "Backup OK: $DATE"
EOF

chmod +x /opt/osintmapper/backup.sh
sudo apt install -y sqlite3   # requis par .backup

# Vérifier IMMÉDIATEMENT que la sauvegarde produit bien deux fichiers non vides
/opt/osintmapper/backup.sh && ls -lh /opt/osintmapper/backups/

# Crontab : backup toutes les heures
(crontab -l 2>/dev/null; echo "0 * * * * /opt/osintmapper/backup.sh >> /var/log/osintmapper-backup.log 2>&1") | crontab -
```

## 9. Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

**NE PAS exposer le port 4444 directement** - nginx fait proxy.

---

## Audit de sécurité - Résumé

| Point | Statut | Détail |
|-------|--------|--------|
| Auth API routes | ✅ | Toutes les routes `/api/cases`, `/api/users` protégées par `requireAuth` |
| Auth WebSocket | ✅ | Token JWT vérifié à chaque connexion WS |
| Auth geocode/route | ✅ FIX v0.2.1 | Endpoints proxy protégés par `requireAuth` |
| Auth health | ✅ FIX v0.2.1 | `/api/health` protégé, `/api/ping` public (pas de données sensibles) |
| Client-side routing | ✅ | `ProtectedRoute` redirige vers `/login` |
| Utilisateur d'exécution | ✅ | Service sous `osintmapper`, **plus en root**. L'utilisateur dédié était créé puis jamais utilisé |
| Droits fichiers | ✅ | Code en lecture seule pour le service ; écriture limitée à `server/data/` et `server/prisma/data/` - vérifié : toutes les écritures du serveur y aboutissent |
| Secret sur disque | ✅ | `server/.env` en `root:osintmapper 640` - lisible par le service, invisible pour les autres comptes |
| JWT secret | ✅ | Obligatoire, ≥ 32 car. : le serveur **refuse de démarrer** sans. Plus de repli aléatoire silencieux |
| Admin password | ⚠ | Valeur d'usine **publique** (`osintmapper`) si `ADMIN_PASSWORD` n'est pas fourni au premier seed - la fournir en production. Le seed ne réinitialise en revanche jamais un compte existant |
| CORS | ✅ FIX v0.2.1 | Restreint en production (same-origin ou domaine explicite) |
| Helmet | ✅ | En-têtes de sécurité + HSTS |
| CSP | ✅ | Politique explicite. Elle était **désactivée** (`contentSecurityPolicy: false`) alors que ce tableau la déclarait active |
| Cookie de session | ✅ | `HttpOnly` + `SameSite=Lax` + **`Secure`** en production |
| Sourcemaps | ✅ | Plus générées ; `*.map` refusé par le serveur en second rideau |
| Rate limiting | ✅ | 20 échecs de connexion / 15 min · 60 req/15 min sur `/api/auth` · 600 req/min sur `/api` |
| Journal des échecs | ✅ | `auth:login:failed` avec IP - le bourrage d'identifiants ne laissait aucune trace |
| Proxies sortants | ✅ | Coordonnées validées numériquement avant interpolation dans l'URL OSRM |
| Passwords | ✅ | bcrypt 12 rounds · 12 caractères minimum, y compris pour le chiffrement d'enquête |
| Encryption | ✅ | AES-256-GCM, PBKDF2 100k iterations |
| Fichiers static | ✅ FIX v0.2.1 | `dotfiles: 'deny'`, pas de directory listing |
| Atomic save | ✅ FIX v0.2.1 | Écriture tmp → backup → rename (pas de perte si crash) |
| Backup .bak | ✅ FIX v0.2.1 | Chaque sauvegarde crée un `.bak` de l'état précédent |

## Audit intégrité données

| Risque | Protection |
|--------|-----------|
| Crash pendant sauvegarde | Atomic write (tmp + rename), backup .bak |
| Corruption SQLite | WAL mode natif, backups horaires |
| Perte fichier JSON case | Backup .bak à chaque save + backup cron |
| Perte complète | Backups cron DB + cases toutes les heures, 30 retenus |
| Chiffrement case | AES-256-GCM, clé dérivée PBKDF2 - **sauvegarder les mots de passe séparément** |

---

## Mise à niveau d'une instance existante

**Règle du jeu : les comptes (base) et les enquêtes (fichiers JSON/`.enc`) ne
doivent pas être modifiés.** La procédure ci-dessous ne les touche jamais : la
nouvelle version est installée *à côté*, les données sont **copiées** dans la
nouvelle arborescence, et l'ancienne reste intacte comme filet de retour arrière.

> **Vous arrivez de l'étape 3 de l'installation neuve ?** Les étapes 1 et 2
> (archive dépliée, `npm install`, `server/.env`) correspondent à l'étape 5
> ci-dessous et sont déjà faites : reprenez à l'**étape 1** (arrêter), puis
> suivez tout, en survolant l'étape 5 dont il ne reste que la reprise du `.env`
> de l'ancienne installation. Ne lancez **ni `db seed` ni `db push`** : le seed
> ne réinitialise aucun compte existant, mais il est inutile ici - l'admin
> arrive avec la base copiée.

### Où vivent les données à migrer

Il n'y a **rien à exporter** : pas de dump, pas de script d'import. Tout tient
dans deux arborescences, qu'on copie telles quelles.

| Donnée | Emplacement | Forme |
|---|---|---|
| Comptes, rôles, accès aux enquêtes, journal d'audit, **métadonnées** d'enquête (titre, propriétaire, statut) | `server/prisma/data/osintmapper.db` | SQLite (+ `-wal`, `-shm`) |
| **Contenu** des enquêtes (entités, liens, stickers, post-its) | `server/data/cases/` | un JSON - ou `.enc` si chiffrée - par enquête |
| Pièces jointes | `server/data/uploads/` | fichiers |
| Points de restauration | `server/data/snapshots/` | copies des fichiers d'enquête |
| Plugins déposés à l'exécution | `server/data/plugins/` | modules ESM (+ table `Plugin`) |

Une enquête est donc **à cheval** sur la base et le disque : copier l'une sans
l'autre donne des enquêtes listées mais vides, ou des fichiers sans propriétaire.
Les deux copies de l'étape 6 vont ensemble.

`server/data/yjs/` n'a pas à être repris : l'état CRDT est éphémère, le fichier
d'enquête fait foi dès que la salle est fermée.

### Ce que la mise à niveau change - et ce qu'elle ne change pas

| | |
|---|---|
| **Comptes** | Intacts. Le seed ne touche plus jamais un compte existant (vérifié) ; il n'est de toute façon pas exécuté ici. Le minimum de 12 caractères ne s'applique qu'aux **nouveaux** mots de passe : personne n'est déconnecté ni forcé d'en changer |
| **Enquêtes (JSON/.enc)** | Intactes, format de fichier inchangé (`version: 1`). Les enquêtes chiffrées s'ouvrent avec leur mot de passe actuel - `unlock` ne contrôle aucune longueur |
| **Base** | Migrations **additives** : `Upload`, `Invite`, `CaseSnapshot`, `PluginPreference`, colonne `Case.settings`. Aucune ne touche `User`, `Case` ni `CaseAccess` |
| **⚠ Table `Plugin`** | Seule exception : `runtime_plugins` la reconstruit et **échoue si elle contient des lignes**. Concerne uniquement les plugins installés à l'exécution, pas les plugins natifs |
| **⚠ Pièces jointes** | Elles sont désormais servies selon l'accès à l'enquête. Celles déposées avant n'ont pas de ligne `Upload` et renverraient 404 → `link-uploads.js` les rattache |
| **Sessions** | Coupées au redémarrage (reconnexion). Si `JWT_SECRET` doit changer, tout le monde se reconnecte - les comptes, eux, ne bougent pas |

### 1. Prévenir, puis arrêter

Le document Yjs d'une salle active vit **en mémoire**. Un redémarrage pendant
qu'une équipe travaille perd ce qui n'a pas encore été écrit dans le fichier
(sauvegarde à 1 s d'inactivité, et périodique à 30 s - la fenêtre est courte
mais réelle). Prévenir, vérifier que plus personne n'est connecté, puis :

```bash
sudo -u osintmapper -H pm2 stop osintmapper-api
```

### 2. Sauvegarder, et vérifier la sauvegarde

```bash
/opt/osintmapper/backup.sh
ls -lh /opt/osintmapper/backups/ | tail -3     # deux fichiers, non vides
```

Une sauvegarde non vérifiée n'est pas une sauvegarde. Sans elle, on ne va pas
plus loin.

### 3. Pré-vol - diagnostiquer avant de toucher à quoi que ce soit

Depuis l'installation **actuelle** (lecture seule, n'écrit rien) :

```bash
cd /opt/osintmapper/<INSTALLATION_ACTUELLE>/server
node --env-file=.env scripts/preflight-upgrade.js
```

Le script répond aux quatre questions qui font échouer une mise à niveau :

- **`JWT_SECRET` conforme ?** Il est devenu obligatoire (≥ 32 caractères) : une
  instance qui tournait sans **ne redémarrera pas**. En générer un si besoin - cela déconnecte tout le monde, sans rien changer aux comptes.
- **État des migrations.** Pas de table `_prisma_migrations` = base créée avec
  `db push` : `migrate deploy` échouerait sur « table already exists ». Il faut
  la **baseliner** (voir ci-dessous). **Ne jamais accepter le reset que propose
  `migrate dev` : il efface tout.**
- **Table `Plugin` non vide et à l'ancien format ?** La migration échouera.
  Noter les plugins installés, vider la table, les réinstaller après coup via le
  Plugin Store.
- **Pièces jointes orphelines**, à rattacher à l'étape 7.

Noter le nombre de comptes, d'enquêtes et de fichiers affiché : c'est ce qu'on
recomptera à la fin.

**Baseliner une base créée avec `db push`** (seulement si le pré-vol le demande,
et seulement pour les migrations dont le schéma est **déjà** en place) :

```bash
# Marque une migration comme appliquée SANS exécuter son SQL
npx prisma migrate resolve --applied 20260720081119_init
```

### 4. Répétition à blanc sur une copie

L'étape qui transforme une mise à niveau risquée en formalité : rejouer la
migration sur une **copie** de la base de production, jamais sur l'originale.

```bash
mkdir -p /tmp/om-essai && cd /opt/osintmapper/<NOUVELLE_VERSION>/server
cp /opt/osintmapper/backups/db_<DERNIER>.sqlite /tmp/om-essai/essai.db

DATABASE_URL="file:/tmp/om-essai/essai.db" npx prisma migrate deploy

# Les données sont-elles toutes là ?
sqlite3 /tmp/om-essai/essai.db \
  "SELECT (SELECT COUNT(*) FROM User)||' comptes, '||(SELECT COUNT(*) FROM \"Case\")||' enquêtes';"
```

Si cette commande échoue ou si les comptes ont disparu : **s'arrêter**, la
production n'a pas été touchée. Sinon, continuer.

```bash
rm -rf /tmp/om-essai
```

### 5. Installer la nouvelle version à côté

*(Déjà fait si vous venez des étapes 1-2 de l'installation neuve : il ne reste
que la reprise du `.env`.)*

```bash
cd /opt/osintmapper
tar -xzf osintmapper-v0.1.tar.gz          # → /opt/osintmapper/osintmapper-v0.1
cd osintmapper-v0.1
npm install --workspaces --include=dev

# Reprendre la configuration existante, puis la compléter
sudo cp /opt/osintmapper/<INSTALLATION_ACTUELLE>/server/.env server/.env
```

Ajouter dans `server/.env` : `PUBLIC_ORIGIN=https://VOTRE_DOMAINE`, et
`BIND_HOST=127.0.0.1` s'il valait `0.0.0.0`.

### 6. Déplacer les données, migrer, construire

```bash
cd /opt/osintmapper/osintmapper-v0.1
ANCIEN=/opt/osintmapper/<INSTALLATION_ACTUELLE>

# L'archive ne contient aucune donnée : ces dossiers n'existent pas encore, et
# `cp` refuserait d'écrire dans une destination absente.
sudo mkdir -p server/data server/prisma/data

# Si `migrate deploy` / `db seed` ont déjà été lancés ici par erreur, une base
# VIDE occupe la place. L'écraser est sans conséquence - elle ne contient qu'un
# compte admin fraîchement créé - mais il faut emporter -wal et -shm avec elle,
# sinon SQLite rejouerait un journal qui ne correspond plus au fichier copié.
sudo rm -f server/prisma/data/osintmapper.db server/prisma/data/osintmapper.db-{wal,shm}

# COPIE (pas de déplacement) : l'ancienne installation reste un retour arrière
sudo cp -a "$ANCIEN/server/data/."        server/data/
sudo cp -a "$ANCIEN/server/prisma/data/." server/prisma/data/

# Vérifier AVANT de migrer que tout est bien arrivé
ls server/data/cases | wc -l      # = nombre d'enquêtes relevé au pré-vol
ls -lh server/prisma/data/*.db

cd server && npx prisma generate && npx prisma migrate deploy
cd ../client && npm run build && cd ..
```

Les comptes et les enquêtes sont là dès la fin des deux `cp` : `migrate deploy`
ne fait qu'ajouter les tables et colonnes des nouvelles versions (`Upload`,
`Invite`, `CaseSnapshot`, `PluginPreference`, `Case.settings`) sans toucher à
`User`, `Case` ni `CaseAccess`.

**L'ancienne instance est sur une autre machine ?** Même principe, en
transférant les deux arborescences plutôt qu'en les copiant - l'application
arrêtée des deux côtés, sinon la base est capturée en cours d'écriture :

```bash
# Depuis l'ANCIENNE machine, application arrêtée. Deux archives distinctes :
# les deux dossiers s'appellent « data », les fusionner mélangerait la base et
# les enquêtes.
sudo -u osintmapper -H pm2 stop osintmapper-api
ANCIEN=/opt/osintmapper/<INSTALLATION_ACTUELLE>
tar -czf /tmp/om-data.tar.gz  -C "$ANCIEN/server"        data
tar -czf /tmp/om-db.tar.gz    -C "$ANCIEN/server/prisma" data
scp /tmp/om-{data,db}.tar.gz root@NOUVELLE_IP:/tmp/

# Sur la NOUVELLE machine
cd /opt/osintmapper/osintmapper-v0.1/server
sudo tar -xzf /tmp/om-data.tar.gz -C .        # → server/data/
sudo tar -xzf /tmp/om-db.tar.gz   -C prisma/  # → server/prisma/data/
rm -f /tmp/om-data.tar.gz /tmp/om-db.tar.gz
```

Les fichiers d'enquête ne contiennent aucun chemin absolu : rien à réécrire
après un changement de machine. En revanche `PUBLIC_ORIGIN` du `.env`, la
configuration nginx et le certificat sont, eux, propres à la machine.

Puis appliquer les droits de l'**étape 4** (code en root, données à
`osintmapper`, `.env` en 640).

### 7. Rattacher les pièces jointes existantes

Sans cela, les images déposées avant la mise à niveau renvoient 404 : elles n'ont
pas de ligne `Upload`, donc plus aucun propriétaire connu. Le script n'écrit que
des lignes `Upload` - il ne modifie **aucun** fichier d'enquête.

```bash
cd /opt/osintmapper/osintmapper-v0.1/server
node --env-file=.env scripts/link-uploads.js            # simulation, n'écrit rien
node --env-file=.env scripts/link-uploads.js --apply    # rattachement
```

Les enquêtes **chiffrées** ne sont pas inspectables sans leur mot de passe :
leurs pièces jointes ne peuvent pas être rattachées automatiquement et devront
être redéposées depuis l'application.

### 8. Démarrer et vérifier

```bash
cd /opt/osintmapper/osintmapper-v0.1/server
sudo -u osintmapper -H pm2 delete osintmapper-api
sudo -u osintmapper -H pm2 start index.js --name osintmapper-api --node-args="--env-file=.env"
sudo -u osintmapper -H pm2 save

# Instance issue d'une version antérieure : le process Yjs séparé n'a plus lieu d'être
sudo -u osintmapper -H pm2 delete osintmapper-yjs 2>/dev/null

sudo -u osintmapper -H pm2 logs osintmapper-api --lines 20   # « env: production »
ps -o user,cmd -C osintmapper-api                            # USER = osintmap, pas root
                                                             # (PAS `-C node` : PM2 renomme le process)
curl -sI https://VOTRE_DOMAINE | grep -i content-security
```

Contrôle final, dans l'application : les comptes sont tous là, chaque enquête
s'ouvre avec son contenu, une enquête chiffrée se déverrouille avec son mot de
passe d'origine, une image ancienne s'affiche, la carte et le magasin de plugins
fonctionnent (c'est là que la CSP se ferait sentir).

### 9. Démonter l'ancien démon PM2 - **à faire, et seulement après validation**

Une instance antérieure tournait en root : ses process vivent dans le démon PM2
**de root** (`/root/.pm2`), un démon distinct de celui d'`osintmapper`. C'est
pour cette raison que le `pm2 delete osintmapper-yjs` de l'étape 8, lancé en
`sudo -u osintmapper`, ne trouve rien à supprimer : il interroge le mauvais
démon. Tant que ce ménage n'est pas fait, l'ancienne API et l'ancien serveur Yjs
**redémarreront au prochain reboot** et se battront avec la nouvelle instance
pour le port 4444.

> Ce démon est votre retour arrière immédiat : ne le démontez qu'une fois les
> contrôles applicatifs passés.

```bash
sudo pm2 list                    # inventaire du démon root
sudo pm2 delete all
sudo pm2 save
sudo pm2 unstartup systemd       # supprime l'unité pm2-root
sudo pm2 kill                    # arrête le God Daemon de root
```

**Installer en remplacement l'unité systemd du nouveau démon.** `pm2 save` ne
suffit pas : il enregistre la liste des process, pas le démarrage au boot. Sans
cette étape - et une fois `pm2-root` désactivé - plus rien ne relance
l'application après un redémarrage du VPS, et la panne ne se manifeste qu'au
reboot suivant, longtemps après la mise à niveau.

```bash
sudo env PATH=$PATH pm2 startup systemd -u osintmapper --hp /home/osintmapper
sudo -u osintmapper -H pm2 save

systemctl is-enabled pm2-osintmapper     # « enabled » - PAS « not-found »
```

Contrôle des ports : rien sur 1234 (l'ancien Yjs tournait **sans aucune
authentification**, le laisser vivre rouvrirait le trou), un seul listener sur
4444, et sur `127.0.0.1` uniquement.

```bash
sudo ss -tlnp | grep -E ':1234|:4444'
ps -o user,pid,cmd -p <PID_AFFICHÉ>      # USER = osintmap
sudo ls -l /proc/<PID_AFFICHÉ>/cwd       # → la NOUVELLE arborescence
```

### En cas de problème - retour arrière

L'ancienne installation n'a pas été modifiée : elle redevient active en deux
commandes.

```bash
sudo -u osintmapper -H pm2 delete osintmapper-api
cd /opt/osintmapper/<INSTALLATION_ACTUELLE>/server
sudo -u osintmapper -H pm2 start index.js --name osintmapper-api --node-args="--env-file=.env"
```

L'ancienne installation rouvre **sa propre base**, restée en place et non migrée.
Conséquence à avoir en tête : tout ce qui aura été produit *après* la bascule vit
dans la nouvelle arborescence et ne suivra pas le retour arrière. D'où l'intérêt
de faire les contrôles de l'étape 8 immédiatement, avant de rendre la main aux
utilisateurs.

Si le doute porte sur les données elles-mêmes, restaurer la sauvegarde de
l'étape 2 (procédure dans « Commandes utiles »).

Une fois la nouvelle version validée sur plusieurs jours, l'ancienne
arborescence peut être archivée puis supprimée - elle contient une copie
complète des enquêtes, à ne pas laisser traîner indéfiniment sur le disque.

---

## Commandes utiles

> Toutes les commandes `pm2` passent par `sudo -u osintmapper -H`. Sans cela on
> s'adresse au démon PM2 de root, qui ne connaît pas ce process : `pm2 status`
> répond « liste vide » et `pm2 restart` ne redémarre rien.
> Pour s'épargner la répétition : `alias ompm2='sudo -u osintmapper -H pm2'`

```bash
# Statut
sudo -u osintmapper -H pm2 status
sudo -u osintmapper -H pm2 logs osintmapper-api

# Redémarrer
sudo -u osintmapper -H pm2 restart osintmapper-api

# ─── Mise à jour ───
cd /opt/osintmapper/osintmapper-v0.1
# (déposer la nouvelle version, puis :)
npm install --workspaces --include=dev
cd server && npx prisma migrate deploy && cd ../client && npm run build && cd ..

# Les fichiers arrivés avec la nouvelle version appartiennent à root : il faut
# rendre les dossiers de données au service, sinon plus rien ne s'enregistre.
sudo chown -R root:root . && sudo chown -R osintmapper:osintmapper server/data server/prisma/data
sudo chown root:osintmapper server/.env && sudo chmod 640 server/.env

sudo -u osintmapper -H pm2 restart osintmapper-api

# Backup manuel
/opt/osintmapper/backup.sh

# ─── Restaurer un backup ───
# Arrêter l'application AVANT : restaurer sous un process actif corrompt la base
# (le -wal en mémoire ne correspondrait plus au fichier restauré).
sudo -u osintmapper -H pm2 stop osintmapper-api
sudo -u osintmapper cp /opt/osintmapper/backups/db_AAAAMMJJ_HHMMSS.sqlite \
  /opt/osintmapper/osintmapper-v0.1/server/prisma/data/osintmapper.db
sudo rm -f /opt/osintmapper/osintmapper-v0.1/server/prisma/data/osintmapper.db-{wal,shm}
sudo -u osintmapper tar -xzf /opt/osintmapper/backups/data_AAAAMMJJ_HHMMSS.tar.gz \
  -C /opt/osintmapper/osintmapper-v0.1/server/data
sudo -u osintmapper -H pm2 start osintmapper-api
```

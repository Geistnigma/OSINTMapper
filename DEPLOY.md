# OSINTMapper - mise en production

Deux chemins d'installation sont pris en charge, et deux seulement.

| Chemin | Pour | Détail |
|---|---|---|
| **`./start.sh`** | une machine dédiée, un VPS, un serveur interne | ci-dessous |
| **Docker / Podman** | tout le reste | **[DOCKER.md](DOCKER.md)** |

Dans les deux cas l'application écoute sur `127.0.0.1` et **ne doit pas être
exposée directement** : voir [Reverse-proxy TLS](#reverse-proxy-tls).

> Les déploiements manuels (PM2, archive déposée à la main, migration d'une
> instance antérieure) ne sont plus documentés. La procédure existe dans
> l'historique git si vous en avez besoin : `git log --follow -- DEPLOY.md`.

---

## Chemin 1 - `./start.sh`

### Prérequis

Node.js 20 ou plus récent, et `git`. Rien d'autre : la base est SQLite, la
synchronisation temps réel est servie par l'API elle-même.

### Installation

```bash
git clone https://github.com/Geistnigma/OSINTMapper.git /opt/osintmapper
cd /opt/osintmapper
./start.sh
```

Au premier lancement, un **installateur web** s'ouvre. Il demande où ranger les
données, sur quel port écouter, et quels comptes créer ; puis il génère le
secret de session, applique les migrations et crée les comptes en bcrypt.

> L'installateur écoute **uniquement sur `127.0.0.1`** et exige un jeton à usage
> unique, imprimé dans le terminal. Sur un serveur distant, ouvrez-lui un tunnel
> plutôt qu'un port :
> ```bash
> ssh -L 4445:127.0.0.1:4445 vous@serveur
> ```
> Il refuse de se relancer une fois l'installation faite.

Il écrit `server/.env` en **0600**, avec le secret de session, le chemin de la
base et `DATA_DIR`.

### Un seul dossier à sauvegarder

L'installateur place la base SQLite **à l'intérieur** du dossier de données :

```
<DATA_DIR>/osintmapper.db     base : comptes, enquêtes, accès, journal d'audit
<DATA_DIR>/cases/             fichiers de graphe
<DATA_DIR>/uploads/           pièces jointes
<DATA_DIR>/snapshots/         points de restauration
<DATA_DIR>/plugins/           plugins déposés à l'exécution
```

C'est le seul emplacement à sauvegarder. **Le chemin conteneur diffère** : là,
la base et les données vivent dans deux volumes distincts (voir DOCKER.md).

### Survivre à un redémarrage

`./start.sh` tourne au premier plan : il convient pour démarrer et vérifier, pas
pour tenir un service. Une fois l'installation faite, un compte dédié et une
unité systemd :

```bash
sudo useradd --system --home /var/lib/osintmapper --shell /usr/sbin/nologin osintmapper
sudo chown -R osintmapper: /var/lib/osintmapper      # le DATA_DIR choisi
sudo chown -R root: /opt/osintmapper                 # le code reste en lecture seule
sudo chown root:osintmapper /opt/osintmapper/server/.env
sudo chmod 640 /opt/osintmapper/server/.env
```

Le code appartient à `root` et le service ne peut que le lire : quelqu'un qui
obtiendrait l'exécution dans Node ne peut pas se rendre persistant en
réécrivant `index.js` ou un bundle du client.

`/etc/systemd/system/osintmapper.service` :

```ini
[Unit]
Description=OSINTMapper
After=network.target

[Service]
Type=simple
User=osintmapper
WorkingDirectory=/opt/osintmapper/server
# --env-file est INDISPENSABLE : rien dans le code n'importe dotenv. Le .env
# n'était lu que par effet de bord du client Prisma ; le jour où cela cesse,
# toute la configuration de sécurité retombe sur ses valeurs par défaut.
ExecStart=/usr/bin/node --env-file=.env index.js
Restart=on-failure
RestartSec=5

# Le service n'écrit QUE dans son dossier de données.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/osintmapper

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now osintmapper
sudo systemctl status osintmapper
journalctl -u osintmapper -f
```

Le client compilé doit exister avant le premier démarrage du service - c'est
`./start.sh` qui s'en charge, ou `npm run build`.

---

## Chemin 2 - Docker / Podman

Tout est dans **[DOCKER.md](DOCKER.md)** : volumes, sauvegarde, mise à jour,
notes de construction, particularités rootless de Podman.

```bash
cp .env.docker.example .env    # puis renseigner JWT_SECRET
docker compose up -d --build
```

---

## Reverse-proxy TLS

L'application se lie à `127.0.0.1`, et c'est délibéré : **en production le
cookie de session porte l'attribut `Secure`**, que les navigateurs n'acceptent
en HTTP que sur `localhost`. Exposer le port tel quel sur un réseau donnerait
une page qui s'affiche mais où la connexion échoue **en silence**.

Le proxy doit relayer les WebSockets (`Upgrade` / `Connection`) sur `/yjs` et
`/ws-custom`, sans quoi la collaboration temps réel ne s'établit jamais.

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Une zone de limitation de débit, à déclarer dans le bloc `http` de
`/etc/nginx/nginx.conf` — une `limit_req_zone` ne peut pas vivre dans un
`server` :

```nginx
limit_req_zone $binary_remote_addr zone=osm:10m rate=30r/s;
```

> Derrière Cloudflare, `$binary_remote_addr` est l'adresse du **relais**, pas
> celle du visiteur : sans `set_real_ip_from` ni `real_ip_header
> CF-Connecting-IP`, la zone compte tout le trafic dans un seul seau et la
> limite tombe sur tout le monde en même temps. Même piège que `TRUST_PROXY`
> côté application.

`/etc/nginx/sites-available/osintmapper` :

```nginx
server {
    listen 80;
    server_name VOTRE_DOMAINE;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name VOTRE_DOMAINE;

    # Certificats posés par certbot.

    # Les en-têtes de sécurité (CSP, HSTS, nosniff, frame-ancestors…) sont posés
    # par helmet côté application, au plus près du code qui sait ce dont il a
    # besoin. Ne pas les redéclarer ici : deux CSP concurrentes s'intersectent
    # et produisent des blocages impossibles à diagnostiquer.

    # Les pièces jointes transitent en base64 : une image de 10 Mo pèse ~13,4 Mo
    # dans le corps de la requête. Sans cette ligne, nginx coupe à 1 Mo (défaut)
    # et tout envoi d'image un peu lourde échoue en 413.
    client_max_body_size 15m;

    # Bornes posées EN AMONT du process Node. Express parse la chaîne de requête
    # tout en haut de sa pile de routage : avant le limiteur applicatif (600
    # req/min) et avant toute authentification. Ce plafond-là n'intervient donc
    # qu'une fois le parsing payé. `limit_req` agit avant que Node ne lise quoi
    # que ce soit, et `large_client_header_buffers` borne la taille de ce qu'il
    # y aura à parser. C'est la mitigation des avis DoS de `qs`, qu'Express 4
    # épingle et que seule la migration vers Express 5 corrigera à la source.
    #
    # 4k doit rester au-dessus de la taille du cookie de session, sinon les
    # requêtes légitimes repartent en 431.
    limit_req zone=osm burst=60 nodelay;
    large_client_header_buffers 4 4k;

    location /api/ {
        proxy_pass http://127.0.0.1:4444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Les deux WebSockets. `proxy_read_timeout` élevé : une session de
    # collaboration reste ouverte sans trafic pendant de longues minutes.
    location /ws-custom {
        proxy_pass http://127.0.0.1:4444;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /yjs {
        proxy_pass http://127.0.0.1:4444;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:4444;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/osintmapper /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d VOTRE_DOMAINE
```

En conteneur, remplacer `127.0.0.1:4444` par l'adresse publiée par compose.

Renseignez ensuite l'origine publique dans le `.env` :

```
PUBLIC_ORIGIN=https://enquetes.exemple.fr
```

Elle autorise explicitement le WebSocket dans la CSP pour les navigateurs qui ne
font pas encore correspondre `'self'` aux schémas `ws`/`wss`. **N'y ajoutez pas
d'origine pour faire taire une erreur de console** : `connect-src` fermé sur
l'origine propre est ce qui empêche un bundle de plugin compromis d'exfiltrer
une enquête.

Derrière un proxy, vérifiez `TRUST_PROXY` (défaut `1`) : c'est lui qui dit
jusqu'où croire `X-Forwarded-For`, donc quelle IP sert de clé aux limiteurs de
débit. Mettre `0` si le port reste joignable en direct, sinon l'en-tête devient
forgeable et le limiteur de connexion se contourne à chaque essai.

---

## Sauvegardes

`./start.sh` - **un seul dossier**, celui de `DATA_DIR` :

```bash
tar czf /backup/osintmapper-$(date +%F-%H%M).tar.gz -C /var/lib/osintmapper .
```

Docker / Podman - **deux volumes**, la base n'est pas avec les enquêtes :

```bash
docker run --rm -v osintmapper_db:/db -v osintmapper_data:/data \
  -v "$PWD":/out alpine tar czf /out/osintmapper-$(date +%F).tar.gz /db /data
```

Trois règles :

- **Arrêter le service avant de restaurer.** Restaurer sous un process actif
  corrompt la base : le journal `-wal` en mémoire ne correspondrait plus au
  fichier restauré.
- **Emporter `-wal` et `-shm`** avec le `.db` si vous copiez fichier par fichier.
  Un `tar` du dossier entier le fait déjà.
- **Vérifier la première sauvegarde**, tout de suite : `tar tzf` doit lister la
  base *et* les dossiers d'enquêtes, non vides.

Les archives contiennent des données d'enquête : `chmod 600`, propriétaire seul.

Les points de restauration intégrés à l'application sont un filet à l'échelle
d'**une enquête**, pas d'une instance. Ils ne remplacent pas une sauvegarde.

---

## Mise à jour

`./start.sh` - les migrations ne sont **pas** appliquées au démarrage, seulement
à l'installation. C'est un geste explicite :

```bash
sudo systemctl stop osintmapper
cd /opt/osintmapper && git pull
npm ci
cd server && npx prisma migrate deploy && cd ..
npm run build
sudo chown -R osintmapper: /var/lib/osintmapper   # les fichiers neufs sont à root
sudo systemctl start osintmapper
```

Docker / Podman - `docker compose up -d --build` suffit : `migrate deploy` tourne
à chaque démarrage du conteneur, via l'entrypoint.

Sauvegarder avant, dans les deux cas.

---

## Pare-feu

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

**Ne pas ouvrir 4444** : le port n'a aucune raison d'être joignable autrement
que par le proxy.

---

## Points à ne pas défaire

- **`JWT_SECRET` est obligatoire en production.** Le serveur refuse de démarrer
  sans, et c'est voulu : le repli aléatoire d'autrefois masquait un `.env` non
  chargé - or dans ce cas `NODE_ENV` manque aussi, et CORS repasse en
  `origin: true`.
- **Changer le mot de passe `admin` avant toute exposition.** La valeur d'usine
  du seed est publique. Le chemin `./start.sh` ne la crée pas : c'est vous qui
  choisissez le mot de passe dans l'installateur.
- **`server/.env` en 0600 ou 0640**, jamais lisible par tous : il porte le secret
  de session.
- **Pas de process Yjs séparé.** La synchronisation est servie par l'API sur
  `/yjs`, authentifiée. Elle a tourné par le passé sur un port distinct **sans
  aucune authentification** : ne réintroduisez pas de `npx y-websocket`.
- **`/api/health` est réservé aux ADMIN** : il révèle les identifiants des
  enquêtes en cours, et répond 403 à tout autre compte. Pour une sonde de
  supervision, utilisez **`/api/ping`**, public et sans donnée sensible.

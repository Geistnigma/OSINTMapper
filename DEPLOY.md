# OSINTMapper v0.2.1 — Déploiement Production (Hostinger VPS)

## Prérequis serveur

- Ubuntu 22.04+ (ou Debian 12+)
- Node.js 20+ (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash && sudo apt install -y nodejs`)
- nginx (reverse proxy)
- certbot (HTTPS)
- pm2 (`npm install -g pm2`)

---

## 1. Upload et installation

```bash
# Créer l'utilisateur dédié (sécurité)
sudo adduser --system --group osintmapper
sudo mkdir -p /opt/osintmapper
sudo chown osintmapper:osintmapper /opt/osintmapper

# Transférer l'archive sur le VPS
scp osintmapper-v2.tar.gz root@VOTRE_IP:/opt/osintmapper/

# Sur le VPS
cd /opt/osintmapper
tar -xzf osintmapper-v2.tar.gz
cd osintmapper-v2

# Installer les dépendances
npm install --workspaces
cd server && npx prisma generate && npx prisma migrate deploy && npx prisma db seed && cd ..

# Build le client
cd client && npm run build && cd ..
```

## 2. Configuration .env

```bash
cp .env.example server/.env
```

Éditer `server/.env` :

```env
DATABASE_URL="file:./data/osintmapper.db"
PORT=4444
BIND_HOST=127.0.0.1
NODE_ENV=production
CLIENT_DIST=../client/dist
```

**CRITIQUE — Générer un vrai JWT_SECRET :**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copier la sortie dans `JWT_SECRET=` du `.env`.

## 3. PM2 — Process manager

```bash
cd /opt/osintmapper/osintmapper-v2

# Démarrer le serveur API
pm2 start server/index.js --name osintmapper-api

# Démarrer le serveur Yjs (collaboration temps réel)
pm2 start node_modules/.bin/y-websocket --name osintmapper-yjs -- --port 1234

# Sauvegarder pour redémarrage auto
pm2 save
pm2 startup
```

## 4. Nginx — Reverse proxy + HTTPS

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

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

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

    # Yjs WebSocket (collaboration sync)
    location /yjs {
        proxy_pass http://127.0.0.1:1234;
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

## 5. Premier login

1. Aller sur `https://VOTRE_DOMAINE`
2. Login : `admin` / `admin`
3. **IMMÉDIATEMENT** : changer le mot de passe admin dans le panneau admin
4. Créer les comptes utilisateurs nécessaires

## 6. Sauvegardes automatiques

```bash
# Créer un script de backup
cat > /opt/osintmapper/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/osintmapper/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup DB SQLite
cp /opt/osintmapper/osintmapper-v2/server/data/osintmapper.db "$BACKUP_DIR/db_$DATE.sqlite"

# Backup fichiers cases (JSON + encrypted)
tar -czf "$BACKUP_DIR/cases_$DATE.tar.gz" -C /opt/osintmapper/osintmapper-v2/server/data cases/

# Garder 30 derniers backups
ls -t "$BACKUP_DIR"/db_*.sqlite | tail -n +31 | xargs rm -f 2>/dev/null
ls -t "$BACKUP_DIR"/cases_*.tar.gz | tail -n +31 | xargs rm -f 2>/dev/null

echo "Backup OK: $DATE"
EOF

chmod +x /opt/osintmapper/backup.sh

# Crontab : backup toutes les heures
(crontab -l 2>/dev/null; echo "0 * * * * /opt/osintmapper/backup.sh >> /var/log/osintmapper-backup.log 2>&1") | crontab -
```

## 7. Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

**NE PAS exposer le port 4444 directement** — nginx fait proxy.

---

## Audit de sécurité — Résumé

| Point | Statut | Détail |
|-------|--------|--------|
| Auth API routes | ✅ | Toutes les routes `/api/cases`, `/api/users` protégées par `requireAuth` |
| Auth WebSocket | ✅ | Token JWT vérifié à chaque connexion WS |
| Auth geocode/route | ✅ FIX v0.2.1 | Endpoints proxy protégés par `requireAuth` |
| Auth health | ✅ FIX v0.2.1 | `/api/health` protégé, `/api/ping` public (pas de données sensibles) |
| Client-side routing | ✅ | `ProtectedRoute` redirige vers `/login` |
| JWT secret | ⚠️ | **CHANGER obligatoirement** en production (`.env`) |
| Admin password | ⚠️ | **CHANGER immédiatement** après premier login |
| CORS | ✅ FIX v0.2.1 | Restreint en production (same-origin ou domaine explicite) |
| Helmet | ✅ | Headers sécurité (CSP, HSTS via nginx) |
| Rate limiting | ✅ | 30 tentatives / 15 min sur `/api/auth` |
| Passwords | ✅ | bcrypt 12 rounds |
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
| Chiffrement case | AES-256-GCM, clé dérivée PBKDF2 — **sauvegarder les mots de passe séparément** |

---

## Commandes utiles

```bash
# Statut
pm2 status
pm2 logs osintmapper-api

# Redémarrer
pm2 restart osintmapper-api

# Mise à jour
cd /opt/osintmapper/osintmapper-v2
# (upload nouvelle version)
cd client && npm run build && cd ..
pm2 restart osintmapper-api

# Backup manuel
/opt/osintmapper/backup.sh

# Restaurer un backup
cp /opt/osintmapper/backups/db_YYYYMMDD_HHMMSS.sqlite /opt/osintmapper/osintmapper-v2/server/data/osintmapper.db
pm2 restart osintmapper-api
```

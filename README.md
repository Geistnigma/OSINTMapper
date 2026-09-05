# OSINTMapper

**Plateforme collaborative de cartographie OSINT** - Cartographiez vos investigations sur un graphe interactif, en temps réel, avec votre équipe.

![Version](https://img.shields.io/badge/version-0.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-2496ED)

---

## 🎯 À quoi ça sert ?

OSINTMapper permet aux analystes OSINT de **visualiser et relier** des entités (personnes, pseudos, emails, IPs, comptes, véhicules...) sur un graphe interactif. Chaque lien est typé et porte un niveau de confiance.

Pensez-y comme un **Maltego open-source, collaboratif et auto-hébergé**.

---

## ✨ Fonctionnalités

- **Graphe interactif** - Glisser-déposer, zoom, panoramique, sélection multiple, anti-chevauchement automatique
- **18 catégories d'entités, 105 sous-types** - Personnes, emails, téléphones, réseaux sociaux, IPs, crypto, véhicules, documents...
- **Liens typés** - 10 types de relations, avec un niveau de confiance exprimé par **la couleur et le pointillé** (un lien peu fiable reste une information de l'enquête : il doit rester lisible)
- **Collaboration temps réel** - Multi-analystes via Yjs (CRDT), curseurs et sélections partagés, verrous d'édition, chat
- **Rôles par enquête** - `VIEWER` / `ANALYST` / `OWNER`, appliqués jusque sur le socket de synchronisation
- **Frise chronologique et rejeu** - Rejouez la construction du graphe étape par étape
- **Historique de versions** - Points de restauration automatiques et manuels, côté serveur
- **Export PDF** - Rapport complet : graphe, fiches entités, tableau des liens, chronologie
- **Pièces jointes** - Servies sous contrôle d'accès, jamais en fichiers statiques publics
- **Système de plugins** - Plugins natifs compilés, ou modules déposés à l'exécution par un administrateur
- **Chiffrement** - AES-256-GCM par enquête (optionnel)
- **Thèmes** - Clair et sombre intégrés, trois de plus via le plugin `themes`

---

## 🚀 Installation

Quatre méthodes au choix.

### Méthode 1 - `./start.sh` (recommandé sur une machine)

**Prérequis :** Node.js 20+

```bash
git clone https://github.com/Geistnigma/OSINTMapper.git
cd OSINTMapper
./start.sh
```

Au premier lancement, un **installateur web** s'ouvre : il demande où ranger les
enquêtes, sur quel port écouter, et quels comptes créer. Il génère le secret de
session, applique les migrations et crée les comptes en bcrypt. Aux lancements
suivants, `./start.sh` compile le client si nécessaire, démarre l'instance et
ouvre la page de connexion.

> L'installateur n'écoute **que sur 127.0.0.1** et exige un jeton à usage unique,
> imprimé dans le terminal. Il refuse de se relancer une fois l'installation
> faite. Le mot de passe administrateur est **choisi par vous** : aucune valeur
> d'usine publique n'est créée par ce chemin.

Tout ce qui est écrit ensuite — base SQLite, enquêtes, pièces jointes,
instantanés — vit dans le dossier que vous avez choisi (`DATA_DIR`). C'est le
seul dossier à sauvegarder.

`./start.sh --dev` lance le mode développement (API + Vite, rechargement à chaud).

### Méthode 2 - Docker (recommandé sur un serveur)

Un seul conteneur : l'API sert le client statique **et** les deux WebSockets. La base est SQLite.

```bash
git clone https://github.com/Geistnigma/OSINTMapper.git
cd OSINTMapper

cp .env.docker.example .env
# renseigner JWT_SECRET (32 caractères minimum) :
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

docker compose up -d --build
```

Ouvrez <http://localhost:4444> - identifiant `admin`, mot de passe `osintmapper`.

> ⚠ **Ce mot de passe est public.** Il est écrit dans ce README et dans le code source : le changer à la première connexion, avant toute exposition de l'instance sur un réseau. Pour ne jamais l'exposer, renseigner `ADMIN_PASSWORD` dans `.env` **avant** le premier démarrage (12 caractères minimum) - le compte est alors créé directement avec ce mot de passe.

Autres commandes :

```bash
docker compose logs -f app   # suivre les journaux
docker compose down          # arrêter (données conservées)
docker compose down -v       # arrêter ET SUPPRIMER les données
```

> Le port n'est publié que sur `127.0.0.1`. En production le cookie de session porte l'attribut `Secure`, que les navigateurs n'acceptent en HTTP que sur `localhost` : exposer le conteneur tel quel sur un réseau donnerait une page qui s'affiche mais où la connexion échoue en silence. Pour un accès distant, mettre un reverse-proxy TLS devant - voir **[DOCKER.md](DOCKER.md)**.

### Méthode 3 - Podman

Mêmes fichiers, sans adaptation ni démon :

```bash
cp .env.docker.example .env   # renseigner JWT_SECRET
podman-compose up -d --build
```

Si `podman-compose` manque : `pip install podman-compose`.

En rootless, si les journaux montrent un `EACCES` sur `server/data`, ajouter `:U` aux montages de volume (détails dans [DOCKER.md](DOCKER.md)).

### Méthode 4 - Développement

**Prérequis :** Node.js 20+

```bash
git clone https://github.com/Geistnigma/OSINTMapper.git
cd OSINTMapper
./start.sh --dev
```

À la première exécution, le script crée un `server/.env` de développement (secret aléatoire, `NODE_ENV=development`), applique les migrations, amorce le compte administrateur, puis lance l'API en `--watch` et le client Vite. Ouvrez <http://localhost:5173> - `admin` / `osintmapper`.

> Ce mode écrit une configuration de développement et amorce une base : il **refuse de tourner** si `server/.env` est en `NODE_ENV=production`. Pour démarrer une vraie instance : `./start.sh`.

Pour tout faire à la main :

```bash
npm install
cp .env.example server/.env      # puis renseigner JWT_SECRET
cd server && npx prisma generate && npx prisma migrate deploy && npx prisma db seed && cd ..
npm run dev                      # API (4444, --watch) + client Vite (5173)
```

**Il n'y a aucun process Yjs à lancer.** La synchronisation est servie par l'API sur `/yjs`, authentifiée. Elle a tourné par le passé sur un port séparé **sans aucune authentification** : ne pas réintroduire de `npx y-websocket`.

---

## ⚠️ Après installation

1. **Changez le mot de passe `admin` / `osintmapper` immédiatement.** C'est un identifiant d'amorçage documenté publiquement. Le seed ne réécrit jamais un compte existant : une fois changé, il ne revient pas à sa valeur d'usine au redémarrage suivant.
2. Les inscriptions publiques sont désactivées : seul un administrateur crée les comptes.
3. Pour une mise en production, lisez **[DOCKER.md](DOCKER.md)** (conteneur) ou **[DEPLOY.md](DEPLOY.md)** (PM2 + nginx sur un hôte).

---

## 🏠 Auto-hébergement (production)

| Guide | Pour |
|---|---|
| **[DOCKER.md](DOCKER.md)** | Docker / Podman : volumes, sauvegarde, reverse-proxy TLS, mise à jour |
| **[DEPLOY.md](DEPLOY.md)** | Installation sur un hôte : PM2, nginx, HTTPS, sauvegardes, VPN WireGuard |

**Toujours sauvegarder les deux emplacements** : la base SQLite vit dans `server/prisma/data/` (Prisma résout une URL relative depuis le dossier du schéma), les enquêtes et pièces jointes dans `server/data/`. Une sauvegarde qui n'emporte que le second ne sauvegarde pas la base.

---

## 🔌 Plugins

| Plugin | Description |
|---|---|
| 🗺️ **map** | Carte Leaflet des entités géolocalisées - trajectoires, marqueurs, export |
| 🏴 **flag-tracker** | Suivi et gestion des points d'attention |
| 🕐 **history** | Interface de l'historique de versions (l'archivage est serveur) |
| 🎨 **themes** | Trois thèmes supplémentaires : Café crème, Terminal, Nord |

Un administrateur peut également déposer des plugins à l'exécution depuis le Plugin Store - module ESM stocké côté serveur, avec empreinte SHA-256 enregistrée et journalisée.

> Le bundle d'un plugin installé **s'exécute avec les droits de l'application** : le champ `permissions` est déclaratif et ne restreint rien. Le dépôt est réservé aux administrateurs.

> **Écrire ses propres plugins n'est pas encore ouvert.** Le générateur de
> squelette et la documentation du contrat (SDK, hooks, permissions) arriveront
> dans une prochaine version, une fois le contrat figé. Les plugins listés
> ci-dessus sont fournis avec l'application.

---

## 📊 Catégories d'entités

| Catégorie | Exemples |
|-----------|----------|
| 👤 Personne | Homme, Femme, Inconnu |
| 🎭 Pseudo / Alias | Username, Gamertag, Alias |
| 📧 Email | Gmail, Outlook, ProtonMail... |
| 📱 Téléphone | Mobile, Fixe, VoIP, SIM, IMEI |
| 💬 Réseaux sociaux | Snap, Insta, Facebook, X, TikTok, Telegram, Discord... |
| 📍 Lieu | Adresse, Ville, Pays, GPS |
| 🌐 IP | IPv4, IPv6, Plage |
| 🏢 Organisation | Entreprise, ONG, Gouvernement |
| 🔗 Domaine / URL | Site web, .onion |
| 🚗 Véhicule | Voiture, Moto, Bateau, Aéronef |
| ₿ Wallet Crypto | BTC, ETH, SOL, XMR... |
| 📄 Document | Pièce d'identité, Facture, Contrat |
| 📅 Événement | Incident, Transaction, Voyage |
| 🎬 Média | Image, Vidéo, Audio |
| 🧮 ID technique | MAC, IMEI, Hash, SSID |
| 💳 Financier | Compte bancaire, IBAN, CB, PayPal |
| 🔬 Preuve / Indice | Objet saisi, Témoignage, Preuve numérique |
| ⭐ Autre | Bloc vide, Note, Flag |

La cotation d'une entité suit le **couple OTAN** : fiabilité de la source (A-F) et crédibilité de l'information (1-6).

---

## 🔐 Sécurité

- **Authentification** - JWT (24 h) en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ; bcrypt 12 tours ; mot de passe de 12 caractères minimum. **Aucun jeton n'est lisible en JavaScript** : ni `localStorage`, ni en-tête posé par le client - c'est ce qui limite ce qu'un XSS, ou un bundle de plugin compromis, peut emporter
- **Limitation de débit** - 20 échecs de connexion par quart d'heure (les succès ne comptent pas), 40 pièces jointes par quart d'heure et par compte, plafond global sur l'API. `TRUST_PROXY` dit jusqu'où croire `X-Forwarded-For`
- **Pièces jointes** - type vérifié sur les octets et pas sur l'en-tête déclaré, quota cumulé par enquête (`UPLOAD_QUOTA_PER_CASE`, 500 Mo par défaut)
- **Contrôle d'accès par enquête** - Toute route `/:id` passe par `requireCaseAccess` ; un accès manquant renvoie 404, pas 403, pour ne pas révéler l'existence de l'enquête
- **WebSockets authentifiés** - `/yjs` et `/ws-custom` exigent un jeton valide et un accès à l'enquête ; le rôle `VIEWER` est appliqué sur le socket, pas seulement sur les routes HTTP
- **Invitations révocables** - Jeton de 7 jours dont seule l'empreinte est stockée, annulable à tout moment
- **CSP énumérée** - `connect-src` fermé sur l'origine propre : c'est ce qui empêche un bundle de plugin compromis d'exfiltrer une enquête
- **Aucune dépendance chargée depuis un CDN** - tout passe par npm, ce qui permet un déploiement hors ligne et ne signale l'usage de l'outil à aucun tiers
- **Sauvegarde atomique** - tmp → bak → rename
- **Chiffrement** - AES-256-GCM + PBKDF2-SHA256 (600 000 itérations, la recommandation OWASP courante) par enquête ; le nombre d'itérations voyage avec le fichier, donc relever le paramètre ne rend pas illisible ce qui est déjà écrit. La clé reste en mémoire serveur, expirée après 2 h d'inactivité
- **Suppression réelle** - Supprimer une enquête efface ses fichiers, ses pièces jointes, ses instantanés et révoque ses invitations

> **Fuite vers des tiers, à connaître** : la recherche d'adresse et le calcul d'itinéraire passent par des proxys serveur vers **Nominatim** (OpenStreetMap) et **OSRM**. Le serveur relaie pour éviter le CORS, il ne masque pas la requête : chaque géocodage signale une adresse d'enquête à un tiers. Une instance qui ne peut pas se le permettre doit pointer ces routes vers ses propres serveurs, ou les désactiver.

`JWT_SECRET` est **obligatoire en production** : le serveur refuse de démarrer sans.

---

## 🖥️ Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 18, Vite, canvas SVG custom (aucune lib de graphe), Zustand |
| **Backend** | Node.js 20, Express, Prisma, SQLite |
| **Collaboration** | Yjs, y-websocket (servi par l'API), WebSocket custom |
| **Export** | jsPDF, html2canvas |
| **Conteneur** | Docker / Podman |

---

## 🧪 Tests

```bash
npm test
```

141 tests (vitest) : contrôle d'accès aux enquêtes, filtre de lecture seule du socket Yjs, chiffrement (dont la relecture des fichiers écrits avec les anciens paramètres), géométrie de disposition, moteur de plugins et thèmes déclaratifs, assainissement de la documentation, garde-fous d'administration, rejeu, regroupement de la frise, archive.

---

## 📸 Captures

*À venir*

---

## 🤝 Contribuer

Les contributions sont les bienvenues. Ouvrez une issue pour discuter des changements majeurs avant de soumettre une PR.

---

## 📄 Licence

MIT - voir [LICENSE](LICENSE)

---

<p align="center">
  <strong>OSINT</strong>Mapper - Cartographier. Collaborer. Résoudre.
</p>

# syntax=docker/dockerfile:1
#
# Image OSINTMapper - un seul process : l'API Express, qui sert aussi le client
# statique et les DEUX WebSockets (/yjs et /ws-custom). Il n'y a pas de service
# Yjs séparé à lancer, et la base est SQLite : un conteneur suffit.
#
# La version précédente de ce fichier ne construisait pas :
#   - `npm ci` était lancé DANS client/ et server/, qui n'ont pas de lockfile
#     (monorepo npm workspaces, lockfile unique à la racine) ;
#   - elle copiait des dossiers `plugins/` et `shared/` qui n'existent plus.

# ═══ 1. Build du client ═══════════════════════════════════════════════════
FROM node:20-alpine AS builder
WORKDIR /app

# Manifestes d'abord : cette couche n'est réinvalidée qu'au changement des
# dépendances, pas à chaque modification de source.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

COPY client/ ./client/
RUN npm run build -w client

# ═══ 2. Dépendances de production ═════════════════════════════════════════
# Installées à part pour que l'image finale ne porte ni vite, ni vitest, ni les
# dépendances de build du client (~200 Mo).
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# `-w server` : seul le workspace serveur tourne à l'exécution. Les dépendances
# du client (react, leaflet, vis-timeline…) sont déjà figées dans le bundle.
#
# `--omit=optional` écarte y-leveldb/leveldown, dépendances OPTIONNELLES de
# y-websocket. leveldown n'a pas de binaire précompilé pour musl : il tenterait
# une compilation native (python3, make, g++ - absents de l'image) à chaque
# build. Le serveur libère le doc Yjs quand la salle se vide, pour que le
# fichier JSON reste la source de vérité ; cette persistance n'est pas activée
# et son `require` est conditionnel (y-websocket/bin/utils.cjs).
RUN npm ci --omit=dev --omit=optional -w server --include-workspace-root

# ═══ 3. Image finale ══════════════════════════════════════════════════════
FROM node:20-alpine
WORKDIR /app

# openssl : les moteurs Prisma y sont liés, l'image alpine ne le fournit pas.
# tini    : le serveur n'installe AUCUN gestionnaire de signal, et un process
#           PID 1 ignore les signaux dont la disposition est celle par défaut.
#           Sans lui, `docker stop` attend dix secondes puis tue le process au
#           milieu d'une écriture. Avec tini en PID 1, le SIGTERM est relayé et
#           node s'arrête aussitôt.
RUN apk add --no-cache openssl tini

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder   /app/client/dist  ./client/dist
COPY server/          ./server/
COPY docker-entrypoint.sh ./

# Génération DANS l'image : le moteur Prisma dépend de la plateforme (musl ici).
# Le générer sur l'hôte puis le copier produit un binaire glibc inutilisable.
RUN node_modules/.bin/prisma generate --schema server/prisma/schema.prisma

# Les deux points de montage, créés et attribués AVANT de descendre en droits :
#   server/prisma/data → la base SQLite (Prisma résout une URL relative depuis
#                        le dossier du schéma, pas depuis server/)
#   server/data        → enquêtes, pièces jointes, instantanés, plugins déposés
# Docker recopie la propriété de ces dossiers dans un volume nommé neuf : sans
# ce chown, le process ne pourrait rien écrire.
RUN mkdir -p server/data server/prisma/data \
    && chown -R node:node server/data server/prisma/data \
    && chmod +x docker-entrypoint.sh

USER node
EXPOSE 4444

ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
CMD ["node", "index.js"]

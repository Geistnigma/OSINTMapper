#!/bin/sh
# Préparation de la base à chaque démarrage, puis passage de la main au CMD.
#
# Les deux étapes sont idempotentes :
#   - `migrate deploy` n'applique que les migrations manquantes et ne demande
#     jamais rien (contrairement à `migrate dev`, qui peut proposer un reset) ;
#   - le seed ne touche JAMAIS à un compte existant (voir prisma/seed.js) : il
#     ne crée l'administrateur qu'au tout premier démarrage.
set -e

cd /app/server

if [ ! -d prisma/migrations ]; then
  echo "  ✖ prisma/migrations/ absent de l'image."
  echo "    Ce dossier doit être versionné : sans lui, aucune table n'est créée."
  echo "    Sur le dépôt :  git add server/prisma/migrations"
  exit 1
fi

echo "  → Application des migrations…"
/app/node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

echo "  → Vérification du compte administrateur…"
node prisma/seed.js

exec "$@"

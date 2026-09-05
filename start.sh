#!/bin/bash
# ============================================================================
# OSINTMapper - point d'entrée unique.
#
#   ./start.sh          première fois  → ouvre l'installateur web
#                       ensuite        → démarre l'instance et ouvre le navigateur
#   ./start.sh --dev    mode développement : API + Vite, rechargement à chaud
#   ./start.sh --help
#
# L'installation est considérée faite dès que `server/.installed` existe, ou
# que `server/.env` porte un JWT_SECRET. Pour tout recommencer, supprimer ces
# deux fichiers - en sachant que la base et les enquêtes, elles, restent où
# elles sont : l'installateur refusera un dossier de données non vide.
# ============================================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}→${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✖${NC} $1"; exit 1; }

case "${1:-}" in
  -h|--help)
    sed -n "3,13p" "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

# ── Prérequis ───────────────────────────────────────────────────────────────
command -v node >/dev/null || fail "Node.js introuvable. Installez Node 20 ou plus récent."
MAJEURE=$(node -p "process.versions.node.split('.')[0]")
[ "$MAJEURE" -ge 18 ] || fail "Node $(node -v) : version 18 minimum, 20 recommandée."
command -v npm >/dev/null || fail "npm introuvable."

# `npm ci` à la racine : le dépôt est un monorepo npm workspaces, avec UN
# lockfile. Installer dans server/ puis client/ séparément crée des
# node_modules imbriqués et désynchronise le lockfile - ce qui casse le build
# Docker, sans jamais gêner le développement local.
if [ ! -d node_modules ]; then
  info "Installation des dépendances (première fois, quelques minutes)…"
  npm ci
  ok "Dépendances installées"
fi

ouvrir_navigateur() {
  ( sleep "${2:-1}"
    for c in xdg-open open sensible-browser; do
      command -v "$c" >/dev/null && { "$c" "$1" >/dev/null 2>&1; return; }
    done ) &
}

# ── Mode développement ──────────────────────────────────────────────────────
# Amorce ce qui manque puis lance API + Vite. Reprend ce que faisait
# `dev-setup.sh`, sans deux de ses défauts : les migrations sont APPLIQUÉES
# (et non contournées par `db push`), et une erreur du seed n'est plus avalée.
if [ "${1:-}" = "--dev" ]; then

  # Garde-fou : ce mode écrit une configuration de développement et amorce une
  # base. Sur une instance qui porte de vraies données, c'est à proscrire.
  if grep -qE '^NODE_ENV=production' server/.env 2>/dev/null; then
    fail "server/.env est en NODE_ENV=production : cette instance n'est pas un poste de développement.
       Pour la démarrer normalement : ./start.sh"
  fi

  if [ ! -f server/.env ]; then
    info "Première fois : configuration de développement…"
    SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
    # 0600 dès la création : le fichier porte un secret de session.
    (umask 077; cat > server/.env <<EOF
# Configuration de DÉVELOPPEMENT, générée par ./start.sh --dev.
# Pour une vraie instance : ./start.sh (installateur guidé).

NODE_ENV=development
PORT=4444
JWT_SECRET=$SECRET

# Relatif au dossier du SCHÉMA : la base atterrit dans server/prisma/data/.
DATABASE_URL="file:./data/osintmapper.db"
EOF
    )
    ok "server/.env créé (secret aléatoire, NODE_ENV=development)"
  fi

  mkdir -p server/data/cases server/data/uploads server/data/snapshots server/data/plugins server/data/yjs

  # Le moteur Prisma n'est pas généré par `npm ci` : aucun hook postinstall.
  if [ ! -d node_modules/.prisma/client ]; then
    info "Génération du client Prisma…"
    (cd server && npx prisma generate --schema prisma/schema.prisma >/dev/null)
    ok "Client Prisma généré"
  fi

  # `migrate deploy` et non `db push` : la base de développement porte alors le
  # même historique que la production. Une base créée par `db push` n'a aucune
  # ligne dans _prisma_migrations, et tout `migrate deploy` ultérieur échoue,
  # les tables existant déjà.
  info "Application des migrations…"
  (cd server && npx prisma migrate deploy --schema prisma/schema.prisma >/dev/null)
  ok "Base à jour"

  # Idempotent : le seed ne réécrit jamais un compte existant. Ses erreurs ne
  # sont PAS avalées - `dev-setup.sh` annonçait « compte admin prêt » quoi qu'il
  # arrive, y compris quand la création avait échoué.
  info "Compte administrateur…"
  (cd server && node prisma/seed.js)

  echo ""
  ok "Interface ${CYAN}http://localhost:5173${NC} · API ${CYAN}http://localhost:4444${NC}"
  echo ""
  npm run dev
  exit 0
fi

# ── Installation, si nécessaire ─────────────────────────────────────────────
if [ ! -f server/.installed ] && ! grep -qE '^JWT_SECRET=.{32,}' server/.env 2>/dev/null; then
  echo ""
  info "Aucune instance installée sur cette machine."
  echo ""
  SETUP_PORT="${SETUP_PORT:-4445}"
  ouvrir_navigateur "http://127.0.0.1:${SETUP_PORT}/" 2 >/dev/null 2>&1 || true
  # L'installateur imprime l'URL complète, jeton compris : c'est elle qui fait
  # foi. L'ouverture automatique ci-dessus tombe sur un refus poli sans jeton.
  SETUP_PORT="$SETUP_PORT" node server/setup/index.js
  [ -f server/.installed ] || fail "Installation interrompue."
  echo ""
  ok "Installation enregistrée."
fi

# ── Démarrage ───────────────────────────────────────────────────────────────
PORT=$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '"' )
PORT="${PORT:-4444}"

# En production, l'API sert le client compilé : il faut donc qu'il existe.
if [ ! -f client/dist/index.html ]; then
  info "Compilation du client…"
  npm run build >/dev/null
  ok "Client compilé"
fi

echo ""
ok "OSINTMapper démarre sur ${CYAN}http://127.0.0.1:${PORT}${NC}"
echo -e "  Arrêter : ${YELLOW}Ctrl+C${NC}"
echo ""
ouvrir_navigateur "http://127.0.0.1:${PORT}/" 2

cd server
exec node --env-file=.env index.js

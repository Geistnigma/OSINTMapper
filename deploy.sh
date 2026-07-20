#!/bin/bash
# ============================================================================
# OSINTMapper v2 — Déploiement local (SQLite, pas de Docker)
# ============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

header() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}\n"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}  ✓${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# Root directory = where this script lives
ROOT="$(cd "$(dirname "$0")" && pwd)"

header "OSINTMapper v2 — Déploiement local"

# ============================================================================
# 1. Vérifier Node.js
# ============================================================================
header "1/5 — Prérequis"

if command -v node &> /dev/null; then
    ok "Node.js $(node -v)"
else
    fail "Node.js non trouvé. Installe-le depuis https://nodejs.org (v18+)"
fi

if command -v npm &> /dev/null; then
    ok "npm $(npm -v)"
else
    fail "npm non trouvé"
fi

# ============================================================================
# 2. Configuration .env
# ============================================================================
header "2/5 — Configuration"

if [ ! -f "$ROOT/server/.env" ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > "$ROOT/server/.env" << EOF
DATABASE_URL="file:./data/osintmapper.db"
PORT=4444
JWT_SECRET=$JWT_SECRET
NODE_ENV=development
EOF
    ok "server/.env créé (JWT secret généré)"
else
    ok "server/.env existant conservé"
fi

mkdir -p "$ROOT/server/data"
mkdir -p "$ROOT/server/data/cases"
ok "Dossier server/data/ prêt"

# ============================================================================
# 3. Installer les dépendances
# ============================================================================
header "3/5 — Dépendances"

info "Installation des dépendances serveur..."
(cd "$ROOT/server" && npm install 2>&1 | tail -1)
ok "Serveur OK"

info "Installation des dépendances client..."
(cd "$ROOT/client" && npm install 2>&1 | tail -1)
ok "Client OK"

# ============================================================================
# 4. Base de données SQLite
# ============================================================================
header "4/5 — Base de données (SQLite)"

info "Génération du client Prisma..."
(cd "$ROOT/server" && npx prisma generate 2>/dev/null)
ok "Client Prisma généré"

info "Création des tables..."
(cd "$ROOT/server" && npx prisma db push --accept-data-loss 2>/dev/null)
ok "Tables créées dans server/data/osintmapper.db"

info "Création du compte admin..."
(cd "$ROOT/server" && node prisma/seed.js 2>/dev/null) || true
ok "Compte admin prêt"

# ============================================================================
# 5. Lancement
# ============================================================================
header "5/5 — Lancement"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   🔐 OSINTMapper v2                              ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   Frontend : ${CYAN}http://localhost:5173${GREEN}              ║${NC}"
echo -e "${GREEN}║   API      : ${CYAN}http://localhost:4444${GREEN}              ║${NC}"
echo -e "${GREEN}║   Yjs Sync : ${CYAN}ws://localhost:1234${GREEN}                ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   Login    : ${YELLOW}admin / admin${GREEN}                     ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║   Arrêter  : Ctrl+C                              ║${NC}"
echo -e "${GREEN}║   DB GUI   : ${CYAN}cd server && npx prisma studio${GREEN}     ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Trap Ctrl+C
cleanup() {
    echo ""
    info "Arrêt des serveurs..."
    kill $YJS_PID $SERVER_PID $CLIENT_PID 2>/dev/null
    wait $YJS_PID $SERVER_PID $CLIENT_PID 2>/dev/null
    ok "Serveurs arrêtés. À bientôt !"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start y-websocket server (Yjs sync, port 1234)
info "Démarrage du serveur Yjs (port 1234)..."
(cd "$ROOT/server" && PORT=1234 YPERSISTENCE=./data/yjs npx y-websocket 2>&1 | sed 's/^/  [yjs] /') &
YJS_PID=$!
sleep 1

# Start server (in subshell so cd doesn't affect main script)
info "Démarrage du serveur Express (port 4444)..."
(cd "$ROOT/server" && node index.js) &
SERVER_PID=$!
sleep 2

# Start client (in subshell)
info "Démarrage du client Vite (port 5173)..."
(cd "$ROOT/client" && npx vite --host) &
CLIENT_PID=$!

sleep 3
echo ""
ok "Tout est lancé ! Ouvre ${CYAN}http://localhost:5173${NC}"
echo ""

wait $YJS_PID $SERVER_PID $CLIENT_PID

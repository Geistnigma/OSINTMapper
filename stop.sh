#!/bin/bash
echo "🛑 Arrêt d'OSINTMapper..."
pkill -f "node index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
echo "✅ Serveurs arrêtés."
echo "📁 Base de données conservée dans server/data/osintmapper.db"

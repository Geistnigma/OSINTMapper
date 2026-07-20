# CyberChef

Intégration locale de [CyberChef](https://github.com/gchq/CyberChef) (GCHQ) — outil de décodage/encodage avec 300+ opérations.

---

## Installation (offline)

CyberChef n'est pas embarqué dans OSINTMapper (trop lourd, ~45 MB). Vous devez le télécharger manuellement :

### Étapes

1. Aller sur [github.com/gchq/CyberChef/releases](https://github.com/gchq/CyberChef/releases)
2. Télécharger le fichier **CyberChef_vXX.XX.XX.zip** (le plus récent)
3. Extraire le contenu du ZIP
4. Copier les fichiers extraits dans :

```
osintmapper-v2/client/public/cyberchef/
```

5. Vérifier que ce fichier existe :

```
osintmapper-v2/client/public/cyberchef/index.html
```

6. Relancer le serveur Vite (`npm run dev`)
7. Activer le plugin CyberChef dans le Plugin Store

> **Astuce** : en production (`npm run build`), les fichiers `public/` sont copiés tels quels dans le build. CyberChef sera donc disponible offline.

### Structure attendue

```
client/
  public/
    cyberchef/
      index.html        ← fichier principal
      CyberChef.htm     ← (selon la version)
      modules/          ← (selon la version)
      ...
```

---

## Utilisation

Une fois installé, cliquez sur **🧑‍🍳 CyberChef** dans la toolbar du graphe. Le panel plein écran charge CyberChef en iframe locale.

### Opérations courantes en CTF

| Opération | Usage |
|-----------|-------|
| From Base64 | Décoder du Base64 |
| From Hex | Décoder de l'hexadécimal |
| ROT13 | Rotation César |
| XOR | Déchiffrement XOR avec clé |
| AES Decrypt | Déchiffrement AES |
| Magic | Détection automatique d'encodage |
| Render Image | Afficher une image depuis des données brutes |
| Extract URLs | Extraire les URLs d'un texte |
| Frequency Analysis | Analyse de fréquence pour crypto classique |
| Strings | Extraire les chaînes lisibles |

### Mode offline

CyberChef fonctionne **entièrement en local** — aucune donnée n'est envoyée sur Internet. Idéal pour les environnements sécurisés et les données sensibles.

---

## Configuration

Dans les settings du plugin :
- **Chemin local** : chemin vers le fichier index.html de CyberChef (par défaut : `/cyberchef/index.html`)

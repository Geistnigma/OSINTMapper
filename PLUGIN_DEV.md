# Développement de plugins — OSINTMapper

Guide complet pour créer un plugin OSINTMapper.

---

## Démarrage rapide

```bash
# 1. Copier le template
cp -r client/src/plugins/_template client/src/plugins/mon-plugin

# 2. Éditer le manifest
#    → Changer id, name, description, icon, hooks
nano client/src/plugins/mon-plugin/manifest.js

# 3. Coder le Panel
nano client/src/plugins/mon-plugin/Panel.jsx

# 4. C'est tout — le plugin est auto-découvert au prochain refresh
```

Pas besoin de modifier le registry, pas d'import manuel. Vite détecte automatiquement les nouveaux fichiers.

---

## Structure d'un plugin

```
client/src/plugins/mon-plugin/
  manifest.js    ← OBLIGATOIRE — métadonnées et configuration
  Panel.jsx      ← OPTIONNEL  — composant React
  docs.md        ← OPTIONNEL  — documentation (rendue dans le Plugin Store)
```

### manifest.js

```js
// Si vous avez un docs.md, décommentez :
// import docs from './docs.md?raw';

export default {
  // ═══ OBLIGATOIRE ═══
  id: 'mon-plugin',             // ID unique (lowercase, tirets)
  name: 'Mon Plugin',           // Nom affiché
  version: '1.0.0',
  description: 'Ce que fait le plugin.',
  author: 'Votre nom',
  icon: '🔧',                   // Emoji
  category: 'Enrichissement',   // Voir catégories ci-dessous

  // ═══ OPTIONNEL ═══
  // docs,                       // Contenu markdown brut

  hooks: { ... },               // Voir section Hooks
  permissions: [],               // Voir section Permissions
  settings: [],                  // Voir section Settings
};
```

**Catégories** : `Visualisation`, `Collaboration`, `Import / Export`, `Enrichissement`, `Sécurité`, `CTF`

---

## Hooks

Les hooks déclarent comment le plugin s'intègre à l'interface.

### `toolbar-button`

Ajoute un bouton dans la toolbar du graphe. Cliquer ouvre le panel fullscreen.

```js
hooks: {
  'toolbar-button': { label: 'Mon Plugin', icon: '🔧' },
  'fullscreen-panel': true,
}
```

Le bouton n'apparaît que si le plugin est **activé** dans le Plugin Store.

### `fullscreen-panel`

Panel rendu en overlay plein écran (avec header + bouton Fermer). Nécessite `toolbar-button`.

### `entity-tab`

Ajoute un onglet dans le panneau droit quand une entité est sélectionnée (à côté de 📋 Infos / 🔗 Liens / 📝 Notes).

```js
hooks: {
  'entity-tab': { label: 'Mon Plugin', icon: '🔧' },
}
```

Le Panel reçoit `entity` en prop quand il est rendu dans ce contexte.

### Combiner les hooks

Un plugin peut déclarer plusieurs hooks. Exemple du Flag Tracker :
- `toolbar-button` + `fullscreen-panel` → panel challenge tracker
- `entity-tab` → onglet flag dans le panneau droit

Le même `Panel.jsx` gère les deux modes en testant `props.entity`.

---

## Props du Panel

Votre composant `Panel.jsx` reçoit ces props :

### Données (lecture)

| Prop | Type | Description |
|------|------|-------------|
| `entity` | Object \| undefined | Entité sélectionnée (entity-tab uniquement) |
| `entities` | Array | Toutes les entités `[{id, type, subtype, label, x, y, color, metadata, description, notes, comments}]` |
| `links` | Array | Tous les liens `[{id, from, to, type, label, color, strength, confidence, date, bidirectional}]` |
| `stickers` | Array | Stickers sur le canvas |
| `postits` | Array | Post-its sur le canvas |

### Mutations (écriture)

| Prop | Signature | Description |
|------|-----------|-------------|
| `addEntity` | `(subItemId, x?, y?)` | Crée une entité par ID de sous-type |
| `updateEntity` | `(id, {champs})` | Met à jour une entité |
| `deleteEntity` | `(id)` | Supprime une entité |
| `addLink` | `(fromId, toId)` | Crée un lien |
| `updateLink` | `(id, {champs})` | Met à jour un lien |
| `deleteLink` | `(id)` | Supprime un lien |

Les mutations sont synchronisées en temps réel via Yjs à tous les collaborateurs.

### Sélection

| Prop | Type | Description |
|------|------|-------------|
| `selectedId` | string \| null | ID de l'entité sélectionnée |
| `setSelectedId` | Function | Sélectionner une entité |

### Thème

| Prop | Type | Description |
|------|------|-------------|
| `theme` | Object | Couleurs du thème actif |

Propriétés du thème : `bg`, `surface`, `surfaceAlt`, `border`, `borderHover`, `text`, `textSecondary`, `textMuted`, `accent`, `accentHover`, `danger`, `success`, `shadow`.

### Plugin

| Prop | Type | Description |
|------|------|-------------|
| `settings` | Object | Valeurs des settings `{key: value}` |
| `updateSettings` | Function | `(key, value)` — met à jour un setting (fullscreen) |
| `onClose` | Function | Fermer le panel (fullscreen uniquement) |
| `isViewer` | boolean | `true` si l'utilisateur est en lecture seule (entity-tab) |

### Contexte

| Prop | Type | Description |
|------|------|-------------|
| `caseId` | string | ID de la case en cours |
| `userName` | string | Nom de l'utilisateur |
| `pluginEngine` | Object | Instance du moteur de plugins (fullscreen) |

---

## Settings

Déclarez des settings dans le manifest pour permettre la configuration du plugin.

```js
settings: [
  { key: 'apiKey', type: 'text', label: 'Clé API', default: '' },
  { key: 'maxResults', type: 'text', label: 'Résultats max', default: '10' },
  { key: 'autoRun', type: 'boolean', label: 'Exécution auto', default: true },
],
```

Les valeurs sont persistées en localStorage et passées dans `props.settings`.

---

## Permissions

```js
permissions: ['read:entities', 'write:entities'],
```

- `read:entities` — le plugin lit les entités/liens
- `write:entities` — le plugin crée/modifie/supprime des entités/liens

Les permissions sont déclaratives (affichées dans le Store). Elles ne bloquent pas l'accès pour l'instant — elles informent l'utilisateur.

---

## Documentation

Créez un fichier `docs.md` dans le dossier de votre plugin. Il sera affiché dans le Plugin Store quand l'utilisateur clique "📖 Doc".

Importez-le dans le manifest :
```js
import docs from './docs.md?raw';

export default {
  // ...
  docs,
};
```

---

## Error Boundary

Votre plugin est automatiquement enveloppé dans un Error Boundary. Si votre code crash, l'application affiche un message d'erreur avec un bouton "Réessayer" au lieu de planter.

---

## Bonnes pratiques

1. **Testez les deux modes** — si votre plugin déclare `entity-tab` et `fullscreen-panel`, testez les deux
2. **Utilisez le thème** — `props.theme` pour toutes les couleurs, pas de valeurs hardcodées
3. **Gérez le mode viewer** — vérifiez `props.isViewer` avant les mutations
4. **Persistez localement** — utilisez `localStorage` avec un préfixe unique (`om_monplugin_...`)
5. **Pas de dépendances lourdes** — les plugins sont chargés eager, gardez-les légers
6. **Nommez l'ID en kebab-case** — `mon-plugin`, pas `monPlugin`

---

## Exemple minimal

Un plugin qui compte les entités par type :

**manifest.js**
```js
export default {
  id: 'entity-counter',
  name: 'Compteur',
  version: '1.0.0',
  description: 'Compte les entités par type.',
  author: 'Dev',
  icon: '🔢',
  category: 'Visualisation',
  hooks: {
    'toolbar-button': { label: 'Compteur', icon: '🔢' },
    'fullscreen-panel': true,
  },
};
```

**Panel.jsx**
```jsx
import React, { useMemo } from 'react';

export default function Panel({ entities, theme: t }) {
  const counts = useMemo(() => {
    const map = {};
    (entities || []).forEach(e => { map[e.type] = (map[e.type] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entities]);

  return (
    <div style={{ padding: 20, color: t.text }}>
      <h2>Entités par type</h2>
      {counts.map(([type, count]) => (
        <div key={type} style={{ padding: 4 }}>
          {type}: <strong>{count}</strong>
        </div>
      ))}
    </div>
  );
}
```

---

## Entités — structure

```js
{
  id: "a1b2c3d4",
  type: "person",              // ID catégorie (person, phone, email, infraction...)
  subtype: "person_male",      // ID sous-type
  label: "Jean Dupont",
  description: "Suspect principal",
  notes: "Vu le 12/01...",
  x: 300, y: 200,             // Position sur le canvas
  color: "#6366f1",
  metadata: {
    date: "2025-01-15",
    time: "14:30",
    photo: "https://...",
    lat: 48.8566, lng: 2.3522,
    address: "12 rue de Rivoli, Paris",
    status: "confirmed",       // unverified | confirmed | denied | archived
    reliability: "B",          // A-F (source OTAN)
    credibility: "2",          // 1-6 (info OTAN)
    tags: ["suspect", "priorité"],
    aliases: ["JD", "Le Grand"],
    isFlag: true,              // Flag Tracker
    flag: "HTB{48.8566,2.3522}",
    // ... tout champ custom
  },
  comments: [
    { id: "x1", text: "Vérifié le 15/01", date: "2025-01-15T10:00:00Z", author: "Alice" }
  ],
}
```

---

## Liens — structure

```js
{
  id: "l1m2n3o4",
  from: "a1b2c3d4",           // ID entité source
  to: "e5f6g7h8",             // ID entité cible
  type: "knows",              // related | owns | located | uses | knows | member | alias | contacted | suspected | custom
  label: "",                  // Label personnalisé
  color: "#f59e0b",
  strength: 2,                // 1 (fin) → 3 (épais)
  confidence: 75,             // 0-100%
  date: "2025-01-10",
  bidirectional: false,
  source: "",                 // Source de l'info
}
```

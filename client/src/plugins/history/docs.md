# Historique de versions

Revenir à un état antérieur d'une enquête, **même après un rechargement de page**.

## Pourquoi ce plugin existe

`Ctrl+Z` s'appuie sur `Y.UndoManager`, dont la pile vit en mémoire. Un F5 détruit
le document et le recrée depuis le fichier d'enquête : il n'y a alors plus rien à
annuler. C'est le fonctionnement normal - Figma, Miro ou Google Docs se comportent
de la même façon.

Ce plugin comble ce qui manquait : un filet **au-delà de la session**. Une entité
supprimée hier reste récupérable aujourd'hui.

## Utilisation

### Points automatiques

Le serveur archive l'enquête après une sauvegarde, **au plus une fois toutes les
5 minutes**. Sans ce garde-fou, l'autosave (1 s après la dernière frappe) en
produirait un par caractère tapé.

Ils apparaissent avec une pastille grise. Les 20 derniers sont conservés.

### Points manuels

Avant une manipulation risquée - fusionner deux comptes, importer un fichier,
vider le graphe - posez un point nommé :

1. Saisir un libellé (« avant fusion des comptes »)
2. **+ Créer un point de restauration**

Pastille bleue, 20 conservés, indépendants du quota automatique.

### Restaurer

Le bouton **Restaurer** demande confirmation, puis :

1. L'état **courant** est archivé sous « Avant restauration du … » - se tromper de
   version reste rattrapable ;
2. Le fichier d'enquête est remplacé par l'instantané ;
3. La salle de synchronisation est fermée et **tous les participants rechargent**.

Cette troisième étape n'est pas cosmétique : tant qu'une salle est ouverte, c'est
le document Yjs en mémoire qui fait foi, et il réécrirait le fichier restauré en
moins d'une seconde.

> **Réservé au propriétaire de l'enquête.** Une restauration écrase le travail de
> tous les participants. Les autres membres voient l'historique et peuvent créer
> des points, mais le bouton Restaurer leur est refusé - le serveur répond 403
> même si l'interface était contournée.

## Enquêtes chiffrées

Un instantané est une **copie octet pour octet** du fichier d'enquête. Un fichier
chiffré est donc copié tel quel : l'historique fonctionne sans jamais accéder aux
clés de session, et restaurer n'est que la copie en sens inverse.

Conséquence visible : le serveur ne peut pas compter les entités d'un fichier
chiffré. La liste affiche « contenu chiffré » plutôt qu'un `0 entité` trompeur.

## Ce que ce plugin ne fait pas

**Il ne crée pas les instantanés.** Le système de plugins d'OSINTMapper est
purement **client** : un plugin est un module ESM chargé dans le navigateur. Or
l'archivage se déclenche à la sauvegarde côté serveur et manipule le fichier
d'enquête sur le disque.

La partie serveur vit donc dans le cœur de l'application :

| Élément | Emplacement |
|---|---|
| Création, rétention, restauration | `server/services/snapshots.js` |
| Routes HTTP | `server/routes/cases.js` |
| Métadonnées | table `CaseSnapshot` |
| Fichiers | `server/data/snapshots/<caseId>/` |
| Fermeture de la salle Yjs | `closeYjsRoom` (`server/ws/yjs.js`) |

Ce plugin est **l'interface** de ces routes. Le désactiver retire le panneau, pas
les points de restauration : ils continuent d'être créés, et restent accessibles
par l'API.

## API utilisée

Le plugin s'appuie sur `ctx.api` (SDK 2.1) :

```js
await ctx.api.get(`/cases/${ctx.caseId}/snapshots`);
await ctx.api.post(`/cases/${ctx.caseId}/snapshots`, { label: 'avant fusion' });
await ctx.api.post(`/cases/${ctx.caseId}/snapshots/${id}/restore`);
```

| Route | Rôle requis |
|---|---|
| `GET /api/cases/:id/snapshots` | membre de l'enquête |
| `POST /api/cases/:id/snapshots` | `OWNER` ou `ANALYST` |
| `POST /api/cases/:id/snapshots/:snapId/restore` | `OWNER` |

Un compte sans accès à l'enquête reçoit **404** et non 403 : le serveur ne révèle
pas l'existence d'une enquête à qui n'y a pas droit.

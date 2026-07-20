# Carte géographique

Plugin de visualisation géospatiale pour OSINTMapper. Affiche les entités géolocalisées sur une carte interactive avec trajectoires chronologiques, outils de mesure et export multi-format.

---

## Fonctionnalités

### Marqueurs
Les entités ayant des coordonnées GPS sont automatiquement placées sur la carte. Trois sources de détection :
- **Champs latitude/longitude** remplis dans le panneau droit
- **Coordonnées dans le label** (ex: `48.8566, 2.3522`)
- **Coordonnées dans la description** ou les notes

Les marqueurs sont colorés selon la couleur de l'entité. Un clic sélectionne l'entité dans le graphe.

### Trajectoires chronologiques
Les entités ayant une **date** (et optionnellement une **heure**) sont connectées par des flèches directionnelles dans l'ordre chronologique.

- Gradient de couleur : bleu → violet (ou couleur fixe au choix)
- Flèches au milieu de chaque segment
- Tooltip : dates + distance entre les points
- Distance totale affichée dans la sidebar

### Fonds de carte
Trois fonds disponibles :

| Fond | Usage |
|------|-------|
| 🗺️ OSM | Standard, détaillé |
| 🌑 Dark | Discret, mode sombre |
| 🛰️ Satellite | Imagerie aérienne |

---

## Outils

### ⊙ Cercles de rayon
Cliquez sur la carte pour placer un cercle de rayon fixe (500m à 10km). Utile pour :
- Identifier les entités dans un périmètre
- Visualiser les zones de couverture (antennes, caméras)
- Estimer les temps de déplacement

**Supprimer** : cliquez sur le label `✕` d'un cercle pour le retirer.

### 📏 Mesure de distance
Cliquez pour poser des points de mesure successifs. La distance **vol d'oiseau** (Haversine) est calculée entre chaque segment et en total.

- Multi-points : A → B → C → D
- Ligne qui suit le curseur en temps réel
- Bouton ↩ pour annuler le dernier point

### ✏️ Tracé libre
Maintenez le clic et dessinez sur la carte. Le périmètre total du tracé est calculé automatiquement. Utile pour estimer des contours de zones.

### ▶ Animation
Lance une animation pas à pas des trajectoires. Le marqueur pulsant avance chronologiquement sur les points datés avec une barre de progression.

### 📅 Filtrage par dates
Active deux sélecteurs de date (min/max) pour n'afficher que les points dans la plage choisie. Les points sans date restent toujours visibles. Compteur de points filtrés.

### 🔍 Recherche d'adresse
Barre de recherche intégrée (Nominatim via proxy). Tapez une adresse et appuyez sur Entrée → zoom sur le résultat.

### 🛣️ Street View
Cliquez sur un marqueur → lien **Street View** dans le popup → panneau intégré avec Google Maps. Boutons pour ouvrir dans Google Maps ou Apple Maps.

### 📸 Capture PNG
Exporte la carte visible (marqueurs, trajectoires, cercles) en image PNG.

---

## Export

Bouton **📥 Export** avec 4 formats :

| Format | Extension | Compatible avec |
|--------|-----------|-----------------|
| 🌍 KML | .kml | Google Earth, Google Maps, QGIS, ArcGIS |
| 📐 GeoJSON | .geojson | Leaflet, Mapbox, QGIS, Kepler.gl |
| 📡 GPX | .gpx | Garmin, Strava, Komoot, OsmAnd |
| 📊 CSV | .csv | Excel, Google Sheets |

Chaque export contient les points (label, coordonnées, date, type) et la trajectoire comme LineString.

---

## Ajout de coordonnées

Pour qu'une entité apparaisse sur la carte :

1. **Sélectionnez** l'entité dans le graphe
2. Dans le panneau droit, remplissez les champs **Latitude** et **Longitude**
3. Ou remplissez le champ **Adresse** (géocodage automatique)
4. Pour les trajectoires, ajoutez une **Date** et une **Heure**

> Les entités de type "Lieu" ont automatiquement les champs GPS visibles. Pour les autres types, les coordonnées sont détectées si présentes dans le label ou la description.

---

## Raccourcis

| Action | Comment |
|--------|---------|
| Zoom | Molette de souris |
| Déplacer | Clic + glisser |
| Sélectionner | Clic sur un marqueur |
| Mesurer | Outil 📏 + clics |
| Dessiner | Outil ✏️ + maintenir |

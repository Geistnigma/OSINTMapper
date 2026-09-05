# Geografische Karte

Plugin zur geografischen Darstellung für OSINTMapper. Zeigt georeferenzierte
Entitäten auf einer interaktiven Karte, mit chronologischen Routen,
Messwerkzeugen und Export in mehreren Formaten.

---

## Funktionen

### Marker
Entitäten mit GPS-Koordinaten werden automatisch auf der Karte platziert. Drei
Erkennungsquellen:
- **Felder Breiten-/Längengrad**, im rechten Bereich ausgefüllt
- **Koordinaten in der Bezeichnung** (z. B. `48.8566, 2.3522`)
- **Koordinaten in der Beschreibung** oder in den Notizen

Die Marker übernehmen die Farbe der Entität. Ein Klick wählt die Entität im
Graphen aus.

### Chronologische Routen
Entitäten mit einem **Datum** (und optional einer **Uhrzeit**) werden in
zeitlicher Reihenfolge durch Richtungspfeile verbunden.

- Farbverlauf: Blau → Violett (oder eine feste Farbe nach Wahl)
- Pfeile in der Mitte jedes Abschnitts
- Kurzinfo: Daten + Entfernung zwischen den Punkten
- Gesamtentfernung in der Seitenleiste

### Kartenhintergründe
Drei Hintergründe stehen bereit:

| Hintergrund | Verwendung |
|------|-------|
| 🗺️ OSM | Standard, detailliert |
| 🌑 Dark | Zurückhaltend, dunkler Modus |
| 🛰️ Satellit | Luftbilder |

---

## Werkzeuge

### ⊙ Radiuskreise
Klicken Sie auf die Karte, um einen Kreis mit festem Radius zu setzen (500 m bis
10 km). Nützlich, um:
- Entitäten innerhalb eines Umkreises zu erkennen
- Abdeckungsbereiche darzustellen (Funkmasten, Kameras)
- Fahrzeiten abzuschätzen

**Entfernen**: Klicken Sie auf die Beschriftung `✕` eines Kreises.

### 📏 Entfernungsmessung
Klicken Sie, um nacheinander Messpunkte zu setzen. Die **Luftlinie**
(Haversine) wird je Abschnitt und als Summe berechnet.

- Mehrere Punkte: A → B → C → D
- Eine Linie folgt dem Zeiger in Echtzeit
- Schaltfläche ↩, um den letzten Punkt zurückzunehmen

### ✏️ Freihandzeichnung
Halten Sie die Maustaste gedrückt und zeichnen Sie auf der Karte. Der
Gesamtumfang der Zeichnung wird automatisch berechnet. Nützlich, um Umrisse von
Gebieten abzuschätzen.

### ▶ Animation
Spielt die Routen Schritt für Schritt ab. Ein pulsierender Marker läuft
chronologisch über die datierten Punkte, mit Fortschrittsbalken.

### 📅 Filtern nach Datum
Blendet zwei Datumsfelder (min/max) ein, um nur die Punkte im gewählten Zeitraum
anzuzeigen. Punkte ohne Datum bleiben stets sichtbar. Zähler der gefilterten
Punkte.

### 🔍 Adresssuche
Eingebaute Suchleiste (Nominatim über einen Proxy). Adresse eingeben und Enter
drücken → die Karte springt zum Ergebnis.

### 🛣️ Street View
Marker anklicken → Link **Street View** im Popup → eingebetteter Bereich mit
Google Maps. Schaltflächen zum Öffnen in Google Maps oder Apple Maps.

### 📸 PNG-Aufnahme
Exportiert die sichtbare Karte (Marker, Routen, Kreise) als PNG-Bild.

---

## Export

Die Schaltfläche **📥 Export** bietet 4 Formate:

| Format | Endung | Kompatibel mit |
|--------|-----------|-----------------|
| 🌍 KML | .kml | Google Earth, Google Maps, QGIS, ArcGIS |
| 📐 GeoJSON | .geojson | Leaflet, Mapbox, QGIS, Kepler.gl |
| 📡 GPX | .gpx | Garmin, Strava, Komoot, OsmAnd |
| 📊 CSV | .csv | Excel, Google Sheets |

Jeder Export enthält die Punkte (Bezeichnung, Koordinaten, Datum, Typ) sowie die
Route als LineString.

---

## Koordinaten hinzufügen

Damit eine Entität auf der Karte erscheint:

1. **Wählen** Sie die Entität im Graphen aus
2. Füllen Sie im rechten Bereich die Felder **Breitengrad** und **Längengrad** aus
3. Oder füllen Sie das Feld **Adresse** aus (automatische Verortung)
4. Für Routen ergänzen Sie ein **Datum** und eine **Uhrzeit**

> Bei Entitäten vom Typ „Ort" sind die GPS-Felder von vornherein sichtbar. Bei
> anderen Typen werden Koordinaten erkannt, wenn sie in der Bezeichnung oder der
> Beschreibung stehen.

---

## Kurzbefehle

| Aktion | Wie |
|--------|-----|
| Zoom | Mausrad |
| Verschieben | Klicken + ziehen |
| Auswählen | Klick auf einen Marker |
| Messen | Werkzeug 📏 + Klicks |
| Zeichnen | Werkzeug ✏️ + gedrückt halten |

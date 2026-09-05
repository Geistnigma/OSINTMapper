# Geographic map

Geospatial visualisation plugin for OSINTMapper. Shows geolocated entities on an
interactive map with chronological tracks, measurement tools and multi-format
export.

---

## Features

### Markers
Entities carrying GPS coordinates are placed on the map automatically. Three
detection sources:
- **Latitude/longitude fields** filled in the right-hand panel
- **Coordinates in the label** (e.g. `48.8566, 2.3522`)
- **Coordinates in the description** or the notes

Markers take the entity's colour. Clicking one selects the entity in the graph.

### Chronological tracks
Entities carrying a **date** (and optionally a **time**) are joined by
directional arrows in chronological order.

- Colour gradient: blue → purple (or a fixed colour of your choosing)
- Arrows at the middle of each segment
- Tooltip: dates + distance between points
- Total distance shown in the sidebar

### Base maps
Three backgrounds available:

| Background | Use |
|------|-------|
| 🗺️ OSM | Standard, detailed |
| 🌑 Dark | Discreet, dark mode |
| 🛰️ Satellite | Aerial imagery |

---

## Tools

### ⊙ Radius circles
Click on the map to drop a circle of fixed radius (500 m to 10 km). Useful to:
- Identify entities within a perimeter
- Visualise coverage areas (masts, cameras)
- Estimate travel times

**Removing one**: click the `✕` label of a circle.

### 📏 Distance measurement
Click to drop successive measurement points. The **as-the-crow-flies** distance
(Haversine) is computed for each segment and in total.

- Multi-point: A → B → C → D
- A line follows the cursor in real time
- ↩ button to undo the last point

### ✏️ Freehand drawing
Hold the mouse down and draw on the map. The total perimeter of the drawing is
computed automatically. Useful to estimate the outline of an area.

### ▶ Animation
Plays a step-by-step animation of the tracks. A pulsing marker advances
chronologically over the dated points, with a progress bar.

### 📅 Filtering by date
Enables two date pickers (min/max) to show only the points within the chosen
range. Points without a date always stay visible. Counter of filtered points.

### 🔍 Address search
Built-in search bar (Nominatim through a proxy). Type an address and press Enter
→ the map zooms to the result.

### 🛣️ Street View
Click a marker → **Street View** link in the popup → embedded panel with Google
Maps. Buttons to open in Google Maps or Apple Maps.

### 📸 PNG capture
Exports the visible map (markers, tracks, circles) as a PNG image.

---

## Export

The **📥 Export** button offers 4 formats:

| Format | Extension | Compatible with |
|--------|-----------|-----------------|
| 🌍 KML | .kml | Google Earth, Google Maps, QGIS, ArcGIS |
| 📐 GeoJSON | .geojson | Leaflet, Mapbox, QGIS, Kepler.gl |
| 📡 GPX | .gpx | Garmin, Strava, Komoot, OsmAnd |
| 📊 CSV | .csv | Excel, Google Sheets |

Every export contains the points (label, coordinates, date, type) and the track
as a LineString.

---

## Adding coordinates

For an entity to appear on the map:

1. **Select** the entity in the graph
2. In the right-hand panel, fill the **Latitude** and **Longitude** fields
3. Or fill the **Address** field (automatic geocoding)
4. For tracks, add a **Date** and a **Time**

> Entities of type "Location" show the GPS fields by default. For other types,
> coordinates are detected if present in the label or the description.

---

## Shortcuts

| Action | How |
|--------|-----|
| Zoom | Mouse wheel |
| Pan | Click + drag |
| Select | Click a marker |
| Measure | 📏 tool + clicks |
| Draw | ✏️ tool + hold |

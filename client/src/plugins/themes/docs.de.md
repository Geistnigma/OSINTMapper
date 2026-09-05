# Themes

Drei zusätzliche Paletten für Oberfläche und Arbeitsfläche.

## Verwendung

Aktivieren Sie das Plugin und öffnen Sie das Menü **⚙️** der Werkzeugleiste: Die
neuen Themes erscheinen im Abschnitt **Theme**, nach Dunkel und Hell. Die Wahl
bleibt über Sitzungen hinweg erhalten.

| Theme | Erscheinung | Wofür |
|---|---|---|
| ☕ **Café crème** | warme Beige- und Brauntöne, Terrakotta-Akzent | langes Lesen - reines Weiß ermüdet schnell |
| 🖥️ **Terminal** | tiefes Schwarz, Phosphorgrün | CRT-Anmutung, maximaler Kontrast |
| 🧊 **Nord** | kühle, entsättigte Blaugrautöne | dunkel, aber sanft; weniger kontrastreich als das eingebaute Theme |

## Wenn Sie das Plugin deaktivieren

Die Oberfläche fällt auf das Theme **Dunkel** zurück. Die gewählte Kennung bleibt
gespeichert: Aktivieren Sie das Plugin erneut, und Ihr Theme ist wieder da.

## So funktioniert es

Dieses Plugin enthält **keinen Code** - nur ein Manifest. Themes sind deklarativ:

```js
export default {
  id: 'themes',
  themes: [
    { id: 'cafe', name: 'Café crème', icon: '☕', colors: { bg: '#f4ece1', /* … */ } },
  ],
};
```

Der Host sammelt die Themes aller aktivierten Plugins (`engine.getThemes()`) und
bietet sie im Menü an. Die Kennungen tragen das Plugin als Präfix
(`themes:cafe`), damit zwei Plugins je ein „dark" anbieten können, ohne sich in
die Quere zu kommen oder die eingebauten Themes zu überschreiben.

### Ein eigenes Theme hinzufügen

Legen Sie ein Plugin mit einem `themes`-Array an. Alle **21 Farben sind
Pflicht**:

```
bg, surface, surfaceAlt, border, borderHover,
text, textSecondary, textMuted, accent, accentHover,
canvasBg, canvasGrid, shadow, danger, success,
catHover, itemBg, itemHover, itemBorder, tooltip, tooltipBorder
```

Fehlt eine, wird das Manifest **bei der Registrierung abgelehnt**, mit der Liste
der fehlenden Schlüssel in der Konsole. Das ist Absicht: Eine undefinierte Farbe
zerstört nicht eine Ecke des Bildschirms, sie verbreitet sich überall dort, wo
der Schlüssel gelesen wird.

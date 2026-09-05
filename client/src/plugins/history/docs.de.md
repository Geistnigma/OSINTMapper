# Versionsverlauf

Zu einem früheren Stand einer Ermittlung zurückkehren, **auch nach einem
Neuladen der Seite**.

## Warum es dieses Plugin gibt

`Strg+Z` stützt sich auf `Y.UndoManager`, dessen Stapel im Arbeitsspeicher lebt.
Ein F5 zerstört das Dokument und legt es aus der Ermittlungsdatei neu an: Danach
gibt es nichts mehr rückgängig zu machen. Das ist normales Verhalten - Figma,
Miro und Google Docs arbeiten genauso.

Dieses Plugin schließt die Lücke: ein Netz **über die Sitzung hinaus**. Eine
gestern gelöschte Entität lässt sich heute noch zurückholen.

## Verwendung

### Automatische Punkte

Der Server archiviert die Ermittlung nach einem Speichervorgang, **höchstens
einmal alle 5 Minuten**. Ohne diese Bremse erzeugte das automatische Speichern
(1 s nach dem letzten Tastendruck) einen Punkt pro getipptem Zeichen.

Sie erscheinen mit einem grauen Punkt. Die letzten 20 werden aufbewahrt.

### Manuelle Punkte

Vor einem riskanten Eingriff - zwei Konten zusammenführen, eine Datei
importieren, den Graphen leeren - setzen Sie einen benannten Punkt:

1. Eine Bezeichnung eingeben („vor dem Zusammenführen der Konten")
2. **+ Wiederherstellungspunkt anlegen**

Blauer Punkt, 20 aufbewahrt, unabhängig vom automatischen Kontingent.

### Wiederherstellen

Die Schaltfläche **Wiederherstellen** verlangt eine Bestätigung, dann:

1. Der **aktuelle** Stand wird als „Vor der Wiederherstellung vom …" archiviert -
   die falsche Version zu erwischen bleibt korrigierbar;
2. Die Ermittlungsdatei wird durch die Momentaufnahme ersetzt;
3. Der Synchronisationsraum wird geschlossen und **alle Beteiligten laden neu**.

Der dritte Schritt ist nicht kosmetisch: Solange ein Raum offen ist, gilt das
Yjs-Dokument im Arbeitsspeicher, und es würde die wiederhergestellte Datei binnen
einer Sekunde überschreiben.

> **Nur für den Eigentümer.** Eine Wiederherstellung überschreibt die Arbeit
> aller. Andere Mitglieder sehen den Verlauf und können Punkte anlegen, die
> Schaltfläche Wiederherstellen bleibt ihnen aber verwehrt - der Server antwortet
> mit 403, selbst wenn die Oberfläche umgangen würde.

## Verschlüsselte Ermittlungen

Eine Momentaufnahme ist eine **Byte-für-Byte-Kopie** der Ermittlungsdatei. Eine
verschlüsselte Datei wird also unverändert kopiert: Der Verlauf arbeitet, ohne je
auf Sitzungsschlüssel zuzugreifen, und Wiederherstellen ist nur dieselbe Kopie in
umgekehrter Richtung.

Sichtbare Folge: Der Server kann die Entitäten einer verschlüsselten Datei nicht
zählen. Die Liste zeigt „verschlüsselter Inhalt" statt eines irreführenden
`0 Entitäten`.

## Was dieses Plugin nicht tut

**Es erstellt die Momentaufnahmen nicht.** Das Plugin-System von OSINTMapper ist
rein **clientseitig**: Ein Plugin ist ein ESM-Modul, das im Browser geladen wird.
Die Archivierung wird jedoch beim Speichern auf dem Server ausgelöst und
bearbeitet die Ermittlungsdatei auf der Festplatte.

Der Serverteil lebt daher im Kern der Anwendung:

| Bestandteil | Ort |
|---|---|
| Anlegen, Aufbewahrung, Wiederherstellung | `server/services/snapshots.js` |
| HTTP-Routen | `server/routes/cases.js` |
| Metadaten | Tabelle `CaseSnapshot` |
| Dateien | `server/data/snapshots/<caseId>/` |
| Schließen des Yjs-Raums | `closeYjsRoom` (`server/ws/yjs.js`) |

Dieses Plugin ist **die Oberfläche** zu diesen Routen. Es zu deaktivieren
entfernt den Bereich, nicht die Wiederherstellungspunkte: Sie werden weiter
angelegt und bleiben über die API erreichbar.

## Genutzte API

Das Plugin stützt sich auf `ctx.api` (SDK 2.1):

```js
await ctx.api.get(`/cases/${ctx.caseId}/snapshots`);
await ctx.api.post(`/cases/${ctx.caseId}/snapshots`, { label: 'vor dem Zusammenführen' });
await ctx.api.post(`/cases/${ctx.caseId}/snapshots/${id}/restore`);
```

| Route | Erforderliche Rolle |
|---|---|
| `GET /api/cases/:id/snapshots` | Mitglied der Ermittlung |
| `POST /api/cases/:id/snapshots` | `OWNER` oder `ANALYST` |
| `POST /api/cases/:id/snapshots/:snapId/restore` | `OWNER` |

Ein Konto ohne Zugriff auf die Ermittlung erhält **404**, nicht 403: Der Server
verrät niemandem die Existenz einer Ermittlung, auf die er kein Anrecht hat.

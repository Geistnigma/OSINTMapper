# Flag Tracker

Plugin zur Verfolgung von Flags bei CTF-Wettbewerben (Capture The Flag).

---

## Konfiguration

In den **Einstellungen** des Plugins (Plugin Store → Zahnrad ⚙️):
- **Muster**: Präfix des Flags, z. B. `HTB`, `FLAG`, `picoCTF`. Das Plugin erzeugt `HTB{Wert}`.
- **Name des CTF**: erscheint im Writeup-Export.

---

## Eine Entität als Flag markieren

1. Wählen Sie eine Entität im Graphen aus
2. Klicken Sie im rechten Bereich auf den Reiter **🚩 Flag**
3. Klicken Sie auf **„Als Flag markieren"**
4. Wählen Sie das **Quellfeld** aus der Liste (Bezeichnung, Beschreibung, GPS-Koordinaten, Adresse, Notizen …)
5. Die Vorschau zeigt das formatierte Flag: `HTB{48.8566,2.3522}`
6. Klicken Sie auf **⚡ Erzeugen**, um das Flag an der Entität zu speichern
7. Klicken Sie auf **📋 Kopieren**, um es in die Zwischenablage zu übernehmen

Die Entität wird im Graphen mit 🚩 markiert.

---

## Challenges verwalten (Vollbildbereich)

Klicken Sie in der Werkzeugleiste auf **🚩 Flag Tracker**, um den Bereich zu öffnen.

### Challenge hinzufügen
- Name, Kategorie (OSINT/Crypto/Web/Forensics/Stego/Misc/Rev/Pwn/Network/Mobile)
- Punkte, Status (✅ Gefunden / 🔄 Läuft / 🧱 Blockiert / ⏭️ Übersprungen)
- Manuelles Flag ODER Verknüpfung mit einer Flag-Entität im Graphen (Auswahlliste)
- Notizen (Befehle, Ansätze, Vorgehen)

### Eine Challenge mit einem Flag im Graphen verknüpfen
Wählen Sie in der Liste „Mit einem Flag im Graphen verknüpfen" eine als Flag
markierte Entität. Das dort erzeugte Flag wird automatisch übernommen.

### Zeitnehmer
Globale Stoppuhr ▶ Start / ⏸ Pause / ↺ Zurücksetzen

### Writeup-Export
Erzeugt eine Markdown-Datei mit: Name des CTF, Datum, Punktzahl, Zeit sowie den
Challenges nach Kategorie mit Flags und Notizen.

---

## Kurzbefehle

| Aktion | Wie |
|--------|-----|
| Als Flag markieren | Reiter 🚩 im rechten Bereich → Markieren |
| Erzeugen | ⚡ Erzeugen im Flag-Reiter |
| Kopieren | 📋 Kopieren |
| Status ändern | Klick auf das Symbol ✅🔄🧱⏭️ |
| Export | 📝 Writeup |

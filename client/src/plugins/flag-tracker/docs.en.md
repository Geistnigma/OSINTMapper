# Flag Tracker

Flag tracking plugin for CTF (Capture The Flag) competitions.

---

## Configuration

In the plugin's **settings** (Plugin Store → ⚙️ cog):
- **Pattern**: the flag prefix, e.g. `HTB`, `FLAG`, `picoCTF`. The plugin produces `HTB{value}`.
- **CTF name**: appears in the write-up export.

---

## Marking an entity as a flag

1. Select an entity on the graph
2. In the right-hand panel, click the **🚩 Flag** tab
3. Click **"Mark as flag"**
4. Choose the **source field** from the drop-down (label, description, GPS coordinates, address, notes…)
5. The preview shows the formatted flag: `HTB{48.8566,2.3522}`
6. Click **⚡ Generate** to store the flag on the entity
7. Click **📋 Copy** to copy it to the clipboard

The entity is marked 🚩 on the graph.

---

## Managing challenges (full-screen panel)

Click **🚩 Flag Tracker** in the toolbar to open the panel.

### Adding a challenge
- Name, category (OSINT/Crypto/Web/Forensics/Stego/Misc/Rev/Pwn/Network/Mobile)
- Points, status (✅ Found / 🔄 In progress / 🧱 Stuck / ⏭️ Skipped)
- Manual flag OR linked to a flag entity on the graph (drop-down)
- Notes (commands, leads, method)

### Linking a challenge to a flag on the graph
In the "Link to a flag on the graph" drop-down, pick an entity marked as a flag.
The flag generated on that entity is used automatically.

### Timer
Global stopwatch ▶ Start / ⏸ Pause / ↺ Reset

### Write-up export
Produces a Markdown file with: CTF name, date, score, time, and challenges by
category with their flags and notes.

---

## Shortcuts

| Action | How |
|--------|-----|
| Mark as flag | 🚩 tab in the right-hand panel → Mark |
| Generate | ⚡ Generate in the flag tab |
| Copy | 📋 Copy |
| Change status | Click the ✅🔄🧱⏭️ icon |
| Export | 📝 Write-up |

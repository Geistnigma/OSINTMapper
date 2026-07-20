# Flag Tracker

Plugin de suivi des flags pour compétitions CTF (Capture The Flag).

---

## Configuration

Dans les **settings** du plugin (Plugin Store → roue ⚙️) :
- **Pattern** : préfixe du flag, ex: `HTB`, `FLAG`, `picoCTF`. Le plugin génère `HTB{valeur}`.
- **Nom du CTF** : apparaît dans l'export writeup.

---

## Marquer une entité comme flag

1. Sélectionnez une entité sur le graphe
2. Dans le panneau droit, cliquez sur l'onglet **🚩 Flag**
3. Cliquez **"Marquer comme flag"**
4. Choisissez le **champ source** dans la liste déroulante (label, description, coordonnées GPS, adresse, notes...)
5. L'aperçu affiche le flag formaté : `HTB{48.8566,2.3522}`
6. Cliquez **⚡ Générer** pour enregistrer le flag sur l'entité
7. Cliquez **📋 Copier** pour copier dans le presse-papier

L'entité est marquée 🚩 sur le graphe.

---

## Gestion des challenges (panel plein écran)

Cliquez sur **🚩 Flag Tracker** dans la toolbar pour ouvrir le panel.

### Ajouter un challenge
- Nom, catégorie (OSINT/Crypto/Web/Forensics/Stego/Misc/Rev/Pwn/Network/Mobile)
- Points, statut (✅ Trouvé / 🔄 En cours / 🧱 Bloqué / ⏭️ Passé)
- Flag manuel OU lié à une entité flag du graphe (liste déroulante)
- Notes (commandes, pistes, méthode)

### Lier un challenge à un flag du graphe
Dans la liste déroulante "Lier à un flag du graphe", sélectionnez une entité marquée comme flag. Le flag généré sur l'entité est automatiquement utilisé.

### Timer
Chronomètre global ▶ Start / ⏸ Pause / ↺ Reset

### Export Writeup
Génère un fichier Markdown avec : nom du CTF, date, score, temps, challenges par catégorie avec flags et notes.

---

## Raccourcis

| Action | Comment |
|--------|---------|
| Marquer flag | Onglet 🚩 dans panneau droit → Marquer |
| Générer | ⚡ Générer dans l'onglet flag |
| Copier | 📋 Copier |
| Changer statut | Clic sur l'icône ✅🔄🧱⏭️ |
| Export | 📝 Writeup |

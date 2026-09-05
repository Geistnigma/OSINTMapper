# Thèmes

Trois palettes supplémentaires pour l'interface et le canvas.

## Utilisation

Activez le plugin, puis ouvrez le menu **⚙️** de la barre d'outils : les nouveaux
thèmes apparaissent dans la section **Thème**, à la suite de Sombre et Clair.
Le choix est conservé d'une session à l'autre.

| Thème | Aspect | Pour quoi |
|---|---|---|
| ☕ **Café crème** | beiges et bruns chauds, accent terracotta | lecture prolongée - le blanc pur fatigue vite |
| 🖥️ **Terminal** | noir profond, vert phosphore | ambiance CRT, contraste maximal |
| 🧊 **Nord** | bleus-gris froids et désaturés | sombre mais doux, moins contrasté que le thème intégré |

## Si vous désactivez le plugin

L'interface retombe sur le thème **Sombre**. L'identifiant choisi reste
mémorisé : réactivez le plugin et votre thème revient.

## Comment ça marche

Ce plugin ne contient **aucun code** - seulement un manifeste. Les thèmes sont
déclaratifs :

```js
export default {
  id: 'themes',
  themes: [
    { id: 'cafe', name: 'Café crème', icon: '☕', colors: { bg: '#f4ece1', /* … */ } },
  ],
};
```

L'hôte collecte les thèmes de tous les plugins activés (`engine.getThemes()`) et
les propose dans le menu. Les identifiants sont préfixés par celui du plugin
(`themes:cafe`), pour que deux plugins puissent proposer un « dark » sans se
marcher dessus ni écraser les thèmes intégrés.

### Ajouter votre propre thème

Créez un plugin avec un tableau `themes`. Les **21 couleurs sont obligatoires** :

```
bg, surface, surfaceAlt, border, borderHover,
text, textSecondary, textMuted, accent, accentHover,
canvasBg, canvasGrid, shadow, danger, success,
catHover, itemBg, itemHover, itemBorder, tooltip, tooltipBorder
```

Le manifeste est **refusé à l'enregistrement** s'il en manque une, avec la liste
des absentes en console. C'est volontaire : une couleur indéfinie ne casse pas un
coin de l'écran, elle se propage partout où la clé est lue.

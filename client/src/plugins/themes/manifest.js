/**
 * Thèmes supplémentaires.
 *
 * Purement déclaratif : pas de Panel, pas de code. L'hôte collecte les thèmes
 * des plugins activés (`engine.getThemes()`) et les propose dans le menu ⚙️,
 * section Thème. Désactiver le plugin fait retomber sur un thème intégré.
 *
 * Les 21 couleurs sont obligatoires - le manifeste est refusé s'il en manque
 * une, car un `t.machin` indéfini casse le rendu partout où la clé est lue.
 */
export default {
  id: 'themes',
  name: 'Thèmes',
  version: '1.0.0',
  sdkVersion: '2.1.0',
  description: "Trois thèmes de plus : Café crème, Terminal et Nord. Se choisissent dans le menu ⚙️.",
  author: 'Core',
  icon: '🎨',
  category: 'Visualisation',

  themes: [
    {
      id: 'cafe',
      name: 'Café crème',
      icon: '☕',
      // Clair et chaud : beiges, bruns, un accent terracotta. Pensé pour les
      // longues sessions de lecture, là où le blanc pur fatigue.
      colors: {
        bg: '#f4ece1', surface: '#fbf6ef', surfaceAlt: '#efe4d5',
        border: '#ddcdb8', borderHover: '#c4ae94',
        text: '#3b2f26', textSecondary: '#6f5d4d', textMuted: '#a3907c',
        accent: '#b5651d', accentHover: '#96521a',
        canvasBg: '#f0e6d8', canvasGrid: '#e0d0bb',
        shadow: 'rgba(90,66,42,0.14)',
        warning: '#c8860d', info: '#7a6a52',
        danger: '#a63a2b', success: '#5d7c3f',
        catHover: '#e8dbc9', itemBg: '#fbf6ef', itemHover: '#f0e5d6',
        itemBorder: '#e2d3c0', tooltip: '#3b2f26', tooltipBorder: '#5a4736',
      },
    },
    {
      id: 'terminal',
      name: 'Terminal',
      icon: '🖥️',
      // Noir profond et vert phosphore. L'accent sert aussi de couleur de
      // texte principal : contraste maximal, comme sur un écran cathodique.
      colors: {
        bg: '#000000', surface: '#0a0f0a', surfaceAlt: '#0f1a0f',
        border: '#1c3a1c', borderHover: '#2f6b2f',
        text: '#33ff66', textSecondary: '#22aa44', textMuted: '#146628',
        accent: '#39ff14', accentHover: '#7dff5c',
        canvasBg: '#000000', canvasGrid: '#0d2410',
        shadow: 'rgba(0,255,80,0.18)',
        warning: '#ffb000', info: '#00e5ff',
        danger: '#ff3131', success: '#39ff14',
        catHover: '#0f2410', itemBg: '#060d06', itemHover: '#0f2410',
        itemBorder: '#1c3a1c', tooltip: '#0a1a0a', tooltipBorder: '#2f6b2f',
      },
    },
    {
      id: 'nord',
      name: 'Nord',
      icon: '🧊',
      // Mon choix : palette froide et désaturée (inspirée de Nord). Le thème
      // sombre intégré tire vers le bleu-noir très contrasté ; celui-ci est
      // plus doux, pour travailler longtemps sans éblouissement.
      colors: {
        bg: '#2e3440', surface: '#3b4252', surfaceAlt: '#434c5e',
        border: '#4c566a', borderHover: '#5e6c85',
        text: '#eceff4', textSecondary: '#c8d0dc', textMuted: '#7b88a1',
        accent: '#88c0d0', accentHover: '#8fbcbb',
        canvasBg: '#2e3440', canvasGrid: '#3b4252',
        shadow: 'rgba(0,0,0,0.45)',
        warning: '#ebcb8b', info: '#81a1c1',
        danger: '#bf616a', success: '#a3be8c',
        catHover: '#434c5e', itemBg: '#3b4252', itemHover: '#4c566a',
        itemBorder: '#4c566a', tooltip: '#3b4252', tooltipBorder: '#5e6c85',
      },
    },
  ],
};

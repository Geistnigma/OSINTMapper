# Contribuer à OSINTMapper

Merci de l'intérêt. Le projet est en alpha et se met à jour au fil de l'eau.

## Amorcer un environnement

Node.js 20 ou plus récent, et `git`. Rien d'autre : la base est SQLite et la
synchronisation temps réel est servie par l'API.

```bash
git clone https://github.com/Geistnigma/OSINTMapper.git
cd OSINTMapper
./start.sh --dev
```

`--dev` crée ce qui manque (`.env` de développement, migrations, compte de
seed), puis lance l'API sur 4444 et Vite sur 5173. Ensuite, `npm run dev`
suffit.

> **Piège.** Rien ne charge `server/.env` explicitement : c'est Prisma qui le lit
> et peuple `process.env` au passage. Un `.env` écrit par l'installateur porte
> `NODE_ENV=production` et ferait donc tourner votre environnement de
> développement en mode production. `./start.sh --dev` refuse de démarrer dans ce
> cas.

**Aucun process Yjs à lancer** : la synchronisation est servie par l'API sur
`/yjs`.

## Tests

```bash
npm test        # 256 tests, 24 fichiers
```

> Le script est `cd client && vitest run`. Lancer `npx vitest` **depuis la
> racine** ne trouve pas `client/vite.config.js`, donc pas le plugin React :
> tout fichier important un `.jsx` échoue sur « React is not defined ». Ce n'est
> pas une régression.

Une correction de bug est bienvenue avec le test qui échouait avant elle. La
logique pure (géométrie, regroupements, rejeu, contrôle d'accès) vit dans
`client/src/lib/` et `server/services/` précisément pour être testable sans
monter de composant.

## Ce qui est ouvert, et ce qui ne l'est pas

| | |
|---|---|
| **Ouvert** | corrections de bugs, traductions, accessibilité, documentation, tests, performance |
| **À discuter d'abord** | tout changement d'architecture, de schéma Prisma, ou du protocole collaboratif — ouvrez une issue |
| **Fermé pour l'instant** | les **plugins tiers**. Le contrat du SDK n'est pas figé et l'atelier de création ne fait pas partie du dépôt. Le moteur, les plugins natifs et le magasin restent fonctionnels ; écrire un plugin externe n'est pas encore pris en charge. |

Pour une faille de sécurité, ne passez pas par une issue : voir
[SECURITY.md](SECURITY.md).

## Règles à ne pas casser

Chacune a une raison, souvent une panne :

- **Toute mutation du graphe passe par le document Yjs.** Un `setEntities` sans
  `collab.send*` correspondant produit une divergence silencieuse : invisible
  pour les collaborateurs, absente de l'annulation, écrasée à la première
  resynchronisation.
- **Ce qui touche plusieurs éléments passe par `collab.batch()`** — une
  transaction, donc un seul pas d'annulation. Sinon, annuler un import demande
  autant de Ctrl+Z qu'il y avait d'éléments.
- **Aucune dépendance chargée depuis un CDN.** Tout passe par npm ; `import()`
  dynamique si le chargement différé compte. Un CDN sans SRI, dans une
  application d'enquête, c'est de l'exécution arbitraire — et cela signale
  l'usage de l'outil à un tiers.
- **Toutes les URLs du client dérivent de l'origine de la page**, jamais d'un
  port écrit en dur. Tout `fetch` vers l'API porte `credentials: 'include'` : le
  jeton vit dans un cookie `HttpOnly` et n'est **pas** lisible en JavaScript.
- **Tout HTML injecté passe par DOMPurify.**
- **Tout chemin de données dérive de `DATA_DIR`.** Ne reconstruisez jamais un
  `path.join(__dirname, 'data')` : le même code désignerait un dossier différent
  selon l'endroit d'où le serveur est lancé.
- **`bcryptjs`**, pas `bcrypt`.
- **N'affichez rien qui ne soit branché de bout en bout.** Un formulaire
  d'options dont aucune valeur n'atteignait le serveur a survécu longtemps.

## Traductions

L'interface existe en français, anglais et allemand
(`client/src/i18n/`, ~880 clés). Le **français est la langue source** et le repli
de toute clé manquante.

- **Les données d'enquête ne se traduisent pas** : titres, libellés d'entités,
  notes, commentaires, chat, journal d'actions. Elles appartiennent à
  l'utilisateur — un graphe monté en français doit rester en français pour un
  collègue qui lit l'interface en allemand.
- `useT()` dans un composant, `traduire()` en dehors. **Jamais d'appel au niveau
  module** : un libellé figé à l'import ne suivrait aucun changement de langue.
- Ajouter un message d'erreur serveur = ajouter son **code** aux trois
  dictionnaires. Le serveur renvoie un code stable et un texte français ; le
  client résout `erreurs.<code>`.
- Cinq fichiers de tests dans `client/src/i18n/` verrouillent la parité des
  trois dictionnaires, les marqueurs d'interpolation, les codes d'erreur et les
  portées d'appel. Ils échoueront avant vous.

## Commits et pull requests

Les messages sont **en français**, au format `type(portée): sujet` —
`feat`, `fix`, `docs`, `chore`, `build`, `refactor`, `revert`. Le sujet dit ce
que le commit fait ; le corps dit **pourquoi**, et c'est la partie qui compte.

Exemple de pull request :

- fait une chose ;
- passe `npm test` ;
- décrit le symptôme observé, pas seulement le correctif ;
- ne réintroduit aucune des règles ci-dessus.

Pour un changement d'ampleur, ouvrez une issue d'abord merci ! 

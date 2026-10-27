# MyFitApp

Application personnelle de suivi de musculation, en français, installable sur smartphone et utilisable hors ligne.

**Adresse : https://nicklas-317.github.io/MyFitApp/**

- Quatre onglets : **Séance** (récapitulatif de la semaine et démarrage), **Historique** (regroupé par mois), **Progrès** (bilans, Mon poids) et **Plus** (bibliothèque, réglages, import / export). Le bouton retour d'Android suit la navigation et ne ferme jamais l'appli en pleine séance.
- Saisie d'une séance en quelques secondes, en « mode salle » plein écran avec une barre sous le pouce (« + Exercice », « + Cardio », « Terminer ») : poids, séries, répétitions (« Valider les 3 séries » en un appui), ressenti global, qui ouvre l'exercice suivant. Chaque saisie est écrite aussitôt sur l'appareil : verrouiller le téléphone ou fermer l'appli juste après ne perd rien.
- Séance prévue : préparée au calme (exercices et cardio dans un seul ordre, réordonnables), avec la charge et la cible du moteur ; à la salle, « Démarrer la séance prévue » l'ouvre déjà remplie, charges et cibles recalculées.
- Séance à la salle ou à la maison : une séance libre peut se faire à la maison (sans chronomètre) ; un exercice à charge y a sa propre progression, distincte de la salle. Le lieu d'une séance passée se change dans son détail. Une séance démarrée par erreur s'annule (menu « ⋯ » de l'en-tête, avec confirmation).
- Surcharge progressive automatique : statut vert, orange ou rouge, et prochaine cible calculée par le moteur (deux séances vertes consécutives pour progresser, quatre rouges pour baisser la charge). Les exercices assistés (dips, tractions) suivent le sens inverse : « moins d'aide », « plus d'aide ». Les exercices au poids du corps (pompes, crunch au sol, crunch oblique touche talons, relevés de jambes allongé) progressent par les répétitions seulement (10 à 40) ; la planche (gainage) progresse en secondes (20 à 60 s, par pas de 5 s).
- Bibliothèque illustrée avec une recherche unique par exercice, machine ou groupe musculaire, qui comprend le français, l'anglais et l'argot de salle (« latéral raise haltère », « DB », « pecs ») grâce à un lexique facile à compléter : [`src/library/lexique.json`](src/library/lexique.json). Des puces filtrent par groupe musculaire ; les trois prises d'un même exercice sont regroupées en une entrée.
- Cardio en version minimale : blocs « machine, inclinaison du tapis, durée » ajoutés à la séance, sans progression ; total de la semaine sur l'accueil.
- Import de l'historique depuis des notes en texte brut (`3x8x52kg ++`) ou du JSON, avec aperçu corrigeable.
- Historique, graphiques, bilan de progression, récapitulatif de la semaine sur l'accueil, bilans de la semaine et du mois envoyables par mail, activités habituelles hors salle confirmées en un geste et activités ponctuelles (« + Activité »), records personnels marqués d'une couronne, bilan par groupe musculaire (indice de progression, séries par semaine), suivi du poids.
- Aucun compte ni serveur : les données restent sur l'appareil, dans le navigateur (IndexedDB).

Le cahier des charges complet est dans [CLAUDE.md](CLAUDE.md).

## Installer sur le téléphone

Plateforme visée : **Android, avec Chrome**. L'application doit être ouverte une première fois avec le réseau ; ensuite, elle fonctionne hors ligne.

1. Ouvrir https://nicklas-317.github.io/MyFitApp/ dans Chrome.
2. Menu ⋮ → **Installer l'application** (ou **Ajouter à l'écran d'accueil**), puis confirmer.
3. Lancer MyFitApp depuis l'icône : l'application s'ouvre en plein écran.

Dans **Réglages**, la ligne « Stockage persistant » indique si le navigateur s'est engagé à ne pas effacer les données en cas de manque de place.

## Données et sauvegardes

- Les séances, la bibliothèque, les réglages et les pesées restent **sur l'appareil**. GitHub Pages ne sert que les fichiers de l'application.
- **Sauvegarder** : Plus → Importer / exporter → **Exporter mes données** (fichier JSON complet). Un rappel discret apparaît sur l'accueil après 14 jours sans export.
- **Changer d'appareil** : exporter sur l'ancien, puis sur le nouveau : Importer / exporter → **Choisir un fichier** → **Ajouter à mes données**. L'import fusionne sans rien écraser ; le remplacement complet demande une confirmation et télécharge d'abord une sauvegarde.
- **Reprendre un historique existant** : coller ses notes ou un JSON dans Importer / exporter, vérifier l'aperçu, confirmer.
- Les données d'une adresse ne sont pas visibles depuis une autre : une version de test locale (voir ci-dessous) et la version GitHub Pages ont chacune leurs données. On passe de l'une à l'autre par l'export et l'import.

### Importer ses données de départ après l'installation

Les vraies séances ne sont jamais dans ce dépôt (voir « Données personnelles » ci-dessous). Pour les retrouver sur le téléphone :

1. Copier le fichier de sauvegarde personnel (`perso/mes-seances-depart.json`, sur l'ordinateur) vers le téléphone : envoi à soi-même par e-mail, stockage en ligne ou câble.
2. Dans l'application installée : **Importer / exporter** → **Choisir un fichier** → sélectionner le fichier.
3. Vérifier l'aperçu (« 2 séances à ajouter »), puis **Ajouter à mes données**.

## Mises à jour

À chaque publication, l'application installée détecte la nouvelle version et affiche « Nouvelle version disponible » avec **Recharger** et **Plus tard**. Recharger ne touche jamais aux données : elles restent dans le navigateur, indépendamment des fichiers de l'application.

## Développement

Prérequis : Node 24 LTS (fichier `.nvmrc`), par exemple avec nvm.

```bash
nvm use            # Node 24
npm ci             # dépendances, versions figées
npm run dev        # serveur de développement : http://localhost:5173/MyFitApp/
npm run build      # compilation TypeScript stricte + construction dans dist/
npm run preview    # sert la version construite : http://localhost:4173/MyFitApp/
```

Tester sur un téléphone du même réseau Wi-Fi : `npm run preview:lan`, puis ouvrir l'adresse « Network » affichée suivie de `/MyFitApp/`. Détails et limites : [docs/telephone-reseau-local.md](docs/telephone-reseau-local.md).

### Tests

```bash
npm run typecheck   # TypeScript en mode strict
npm test            # tests unitaires (Vitest) : moteur, import, stockage, analyse…
npx playwright install chromium   # une seule fois
npm run test:e2e    # tests de bout en bout (Playwright, format smartphone Pixel 7, fr-FR, Europe/Paris)
```

Les tests s'exécutent toujours à l'heure de Paris, quelle que soit la machine. Les jeux de test utilisent des données d'exemple anonymisées (`docs/exemples/`).

## Déploiement

Chaque push sur `main` déclenche le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) : installation, compilation TypeScript, tests unitaires, tests de bout en bout, construction, puis publication sur GitHub Pages. Si une étape échoue, rien n'est publié.

Réglage à faire une seule fois sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.

```bash
git push origin main
```

L'avancement est visible dans l'onglet **Actions** du dépôt ; l'adresse publiée apparaît à la fin du job de publication.

## Structure

| Dossier | Contenu |
|---|---|
| `src/engine/` | Moteur de progression : fonctions pures, seule source de vérité des statuts et recommandations |
| `src/session/`, `src/history/` | Opérations sur la séance en cours et les séances passées |
| `src/library/` | Bibliothèque initiale, recherche, gestion des exercices, illustrations |
| `src/transfer/` | Lecture des notes, import et export JSON, brouillons d'import |
| `src/cardio/` | Cardio : blocs de séance, machines, lecture dans les notes |
| `src/plan/` | Séance prévue : préparation, démarrage, consommation |
| `src/activities/` | Activités habituelles hors salle : habitudes, questions de l'accueil, activités ponctuelles |
| `src/analysis/` | Bilan, graphiques, récapitulatif hebdomadaire, bilans de la semaine et du mois |
| `src/body/` | Suivi du poids, base séparée |
| `src/storage/` | Persistance IndexedDB |
| `src/ui/` | Interface React |
| `e2e/` | Tests de bout en bout |
| `docs/` | Exemples anonymisés, sources des illustrations, test sur réseau local |

## Données personnelles

Ce dépôt est public. Il ne contient aucune séance ni pesée réelle : celles-ci restent dans un dossier `perso/` local, ignoré par git, et ont été retirées de tout l'historique. Les exemples de `docs/exemples/` reprennent les mêmes cas avec des valeurs fictives.

## Licences

- Illustrations des exercices : dessins d'Everkinetic, licence [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.fr) via Wikimedia Commons, ou [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr) via le dépôt [everkinetic/data](https://github.com/everkinetic/data) (abducteurs, adducteurs et la plupart des exercices ajoutés en version 8) ; source et licence de chaque image dans [docs/illustrations.md](docs/illustrations.md), attribution affichée sur la fiche de chaque exercice.
- Pictogrammes et icônes : créés pour MyFitApp.
- Code : aucune licence pour l'instant (tous droits réservés).

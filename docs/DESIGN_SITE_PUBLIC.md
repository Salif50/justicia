# Site public — direction « Codex vivant »

Conçu avec la skill ui-ux-pro-max (pattern « Trust & Authority », styles Editorial Grid
et Bento Grid, landing « Product Demo ») puis adapté pour éviter le registre
« cabinet d'avocats » générique. Source de vérité : `frontend/src/app/pages/_public.scss`.

## Idée

La mise en page emprunte au recueil de lois : numéros d'articles (« Art. 121.6 »),
signe § en filigrane, sommaire à points de suite, notes en marge. Le produit est
montré en action dès le haut de page : une consultation se joue en direct et cite
l'article exact.

## Règles

| Élément | Règle |
|---|---|
| Couleurs | Papier `#F5F2EA`, encre chaude `#141210`, un seul accent orange (`#E8650A` en aplat, `#A3470A` en texte). Pas de mode sombre. Contrastes ≥ 4,5:1 vérifiés. |
| Typographie | Newsreader (titres, citations, italique pour l'emphase) · Inter (interface) · JetBrains Mono (références d'articles, étiquettes, chiffres). |
| Formes | Boutons en pilule, cartes à 18 px, champs à 10 px. |
| Étiquettes | `pub-eyebrow` : « § Libellé » en mono. Références : `pub-ref`. |
| Mouvement | Révélation du titre, démonstration du héros, transitions 200–300 ms. Tout est désactivé sous `prefers-reduced-motion`. Pas de carrousel automatique. |
| Contenu | **Aucune citation ni numéro d'article inventé**, même décoratif : les exemples (Art. 121.6, 172.23, 241) sont le texte réel indexé. Chiffres réels : 33 textes, 23 domaines, 12 282 articles. |
| Accessibilité | Lien « Aller au contenu » (cible `#contenu` sur chaque page), onglets au clavier (flèches), focus visibles orange, cibles ≥ 36 px. |

## Expérience de l'accueil (v2)

- **Héros « lampe sur le codex »** : fond encre couvert de références d'articles ; un halo suit le pointeur et les éclaire (désactivé au tactile et en mouvement réduit).
- **Simulateur de chat** (`pages/home/chat-sim/`) : fenêtre de conversation à droite du titre, **sans aucun appel au backend**. Questions et réponses sont préparées à l'avance (`demo-articles.ts` : 9 articles réels, texte vérifié dans l'index, chaque question reliée à son article). Une question se joue automatiquement une seule fois ; le visiteur choisit ensuite parmi les questions proposées. S'il écrit sa propre question, JusticIA l'invite à créer un compte ou à se connecter.
- **Récit épinglé** (`pages/home/scroll-story/`) : 12 282 articles → 30 candidats → ≤ 10 sources → 1 citation (paramètres réels du pipeline). Épinglé seulement sur grand écran sans mouvement réduit ; sinon étapes empilées.
- **Manifeste** encré mot à mot au défilement, **bandeau des codes** (avec bouton pause), **compteurs** animés, **tuiles** inclinées sous le pointeur.

## Pages

Accueil (refonte complète) ; Tarifs, Support, Guide, PCU, Connexion, Inscription
héritent du thème via `_public.scss` (bandeau encre réglé avec § en filigrane).

## Marque et chargement

- **Monogramme JiA** (le favicon) partout où figurait le « J » : en-tête public, barres latérales espace client et admin, chat de démonstration, page de conversation. Fichiers détourés dans `frontend/public/brand/` (`jia-mark`, `@2x`, `@4x`, PNG + WebP), posés sur une tuile claire (classe globale `.brand-mark` dans `styles.scss`) pour rester lisibles sur papier, encre ou marine.
- **Loader « Le sceau du codex »** (`components/loader/`) : barre orange en haut si la navigation dépasse 120 ms ; au-delà de 450 ms, sceau plein écran (tuile JiA, arc orange qui tourne, références d'articles réelles qui défilent), affiché au moins 520 ms pour ne pas clignoter. Navigation rapide : rien ne s'affiche.
- **Écran de démarrage** dans `index.html` (même sceau, CSS en ligne) pendant le téléchargement de l'application.

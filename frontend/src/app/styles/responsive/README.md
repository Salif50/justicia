# Styles Responsive

Ce dossier contient tous les styles responsive pour l'application JusticIA, organisés par type d'appareil.

## Structure

```
responsive/
├── mobile/
│   ├── _index.scss              # Index pour importer tous les styles mobile
│   ├── _accueil.mobile.scss      # Styles mobile pour la page Accueil
│   ├── _connexion.mobile.scss    # Styles mobile pour la page Connexion
│   ├── _inscription.mobile.scss  # Styles mobile pour la page Inscription
│   └── ...                       # Autres pages
└── tablet/
    ├── _index.scss               # Index pour importer tous les styles tablette
    ├── _accueil.tablet.scss      # Styles tablette pour la page Accueil
    ├── _connexion.tablet.scss    # Styles tablette pour la page Connexion
    └── ...                       # Autres pages
```

## Utilisation

### Option 1 : Importer dans chaque composant

Dans chaque fichier `.scss` de composant, ajoutez :

```scss
// Exemple : src/app/pages/accueil/accueil.scss

// Styles de base
.accueil-page {
  // ...
}

// Import des styles responsive
@import '../../styles/responsive/mobile/accueil.mobile';
@import '../../styles/responsive/tablet/accueil.tablet';
```

### Option 2 : Importer globalement

Dans `src/styles.scss`, vous pouvez importer tous les styles responsive :

```scss
@import 'app/styles/responsive/mobile/index';
@import 'app/styles/responsive/tablet/index';
```

## Breakpoints

- **Mobile** : `max-width: 768px`
- **Tablette** : `min-width: 769px` et `max-width: 1024px`
- **Desktop** : `min-width: 1025px` (styles dans les fichiers principaux)

## Notes

- Les fichiers utilisent le préfixe `_` pour indiquer qu'ils sont des partials SCSS
- Chaque fichier contient une media query appropriée
- Les styles sont organisés par page pour faciliter la maintenance


// Détection automatique : si accès via IP réseau (téléphone), utilise la même IP pour le backend
const isLocalhost = window?.location?.hostname === 'localhost' || window?.location?.hostname === '127.0.0.1';
const backendHost  = isLocalhost ? 'localhost' : (window?.location?.hostname ?? 'localhost');

export const environment = {
  production: false,
  apiUrl: `http://${backendHost}:8000/api`,
  googleClientId: '187543661599-uddpi23b7mles0pbjo6fbtt9thgoqcrn.apps.googleusercontent.com',
};

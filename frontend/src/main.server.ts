import './server-storage';
import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

/** Rendu au moment de la construction (pré-rendu des pages publiques pour les moteurs de recherche). */
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfigFor } from './app/app.config';
import { App } from './app/app';
import { loadRuntimeConfig } from './app/runtime-config';

// First the configuration (where the definitions come from), then the application.
loadRuntimeConfig()
  .then((config) => bootstrapApplication(App, appConfigFor(config)))
  .catch((err) => console.error(err));

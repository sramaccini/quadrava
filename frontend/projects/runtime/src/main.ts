import { bootstrapApplication } from '@angular/platform-browser';
import { appConfigFor } from './app/app.config';
import { App } from './app/app';
import { loadApplicationSettings, loadRuntimeConfig } from './app/runtime-config';

// First the configuration (where the definitions come from) and the settings of the application, then the application.
loadRuntimeConfig()
  .then(async (config) => bootstrapApplication(App, appConfigFor(config, await loadApplicationSettings(config))))
  .catch((err) => console.error(err));

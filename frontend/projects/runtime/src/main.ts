import { bootstrapApplication } from '@angular/platform-browser';
import { appConfigFor } from './app/app.config';
import { App } from './app/app';
import { loadApplicationSettings, loadRuntimeConfig } from './app/runtime-config';
import { followStudio, receiveProject, studioOrigin, studioSettings } from './app/studio';

// First the configuration (where the definitions come from) and the settings of the application, then the application.
// Opened by Quadrava Studio («Run project», ADR-16) from an origin the configuration allows: the project comes from
// Studio; if it does not arrive, the runtime starts as usual.
loadRuntimeConfig()
  .then(async (config) => {
    const studio = studioOrigin(config);
    const project = studio
      ? await receiveProject(studio).catch((e: unknown) => {
          console.error('[studio]', e instanceof Error ? e.message : e);
          return null;
        })
      : null;
    if (studio && project) followStudio(studio);
    const settings = project ? await studioSettings(project) : await loadApplicationSettings(config);
    return bootstrapApplication(App, appConfigFor(config, settings, project));
  })
  .catch((err) => console.error(err));

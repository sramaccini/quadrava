import { bootstrapApplication } from '@angular/platform-browser';
import { PREVIEW_QUERY } from './app/preview/protocol';

// La stessa applicazione fa da editor e, dentro il suo iframe, da anteprima (ADR-08). Le due parti si caricano a
// richiesta: l'editor non scarica il codice che serve solo all'anteprima e viceversa.
const preview = new URLSearchParams(location.search).has(PREVIEW_QUERY);
const start = preview
  ? Promise.all([import('./app/preview/preview-app'), import('./app/preview/preview-config')]).then(([m, c]) => bootstrapApplication(m.PreviewApp, c.previewConfig))
  : Promise.all([import('./app/app'), import('./app/app.config')]).then(([m, c]) => bootstrapApplication(m.App, c.appConfig));
start.catch((err) => console.error(err));

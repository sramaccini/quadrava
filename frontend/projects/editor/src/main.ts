import { bootstrapApplication } from '@angular/platform-browser';
import { PREVIEW_QUERY } from './app/preview/protocol';

// The same application acts as editor and, inside its iframe, as preview (ADR-08). The two parts are loaded on
// demand: the editor does not download the code needed only by the preview, and vice versa.
const preview = new URLSearchParams(location.search).has(PREVIEW_QUERY);
const start = preview
  ? Promise.all([import('./app/preview/preview-app'), import('./app/preview/preview-config')]).then(([m, c]) => bootstrapApplication(m.PreviewApp, c.previewConfig))
  : Promise.all([import('./app/app'), import('./app/app.config')]).then(([m, c]) => bootstrapApplication(m.App, c.appConfig));
start.catch((err) => console.error(err));

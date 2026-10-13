import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { PREVIEW_QUERY } from './app/preview/protocol';
import { previewConfig } from './app/preview/preview-config';
import { PreviewApp } from './app/preview/preview-app';

// La stessa applicazione fa da editor e, dentro il suo iframe, da anteprima (ADR-08).
const preview = new URLSearchParams(location.search).has(PREVIEW_QUERY);
(preview ? bootstrapApplication(PreviewApp, previewConfig) : bootstrapApplication(App, appConfig)).catch((err) => console.error(err));

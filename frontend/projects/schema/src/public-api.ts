/*
 * Public API Surface of schema
 */

export * from './lib/types';
// The validators are in the secondary entry point schema/validation (loaded lazily by the runtime).
export * from './lib/data-sources';
export { SCREEN_SCHEMA } from './lib/screen.schema';
export { THEME_SCHEMA } from './lib/theme.schema';
export { NAVIGATION_SCHEMA } from './lib/navigation.schema';
export { MESSAGES_SCHEMA } from './lib/messages.schema';
export { DATASOURCES_SCHEMA } from './lib/datasources.schema';
export { PROJECT_SCHEMA } from './lib/project.schema';

import { DATASOURCES_SCHEMA } from './datasources.schema';
import { MESSAGES_SCHEMA } from './messages.schema';
import { NAVIGATION_SCHEMA } from './navigation.schema';
import { PROJECT_SCHEMA } from './project.schema';
import { SCREEN_SCHEMA } from './screen.schema';
import { THEME_SCHEMA } from './theme.schema';

/**
 * The properties of the schemas without a description: the paths of every property declared with a schema of its own
 * (not true or false, which only name it again), outside the conditions of an if.
 */
function undescribed(schema: unknown, path = ''): string[] {
  if (Array.isArray(schema)) return schema.flatMap((item, i) => undescribed(item, `${path}/${i}`));
  if (!schema || typeof schema !== 'object') return [];
  const missing: string[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'if') continue;
    if (key === 'properties' && value && typeof value === 'object') {
      for (const [name, property] of Object.entries(value)) {
        if (typeof property === 'object' && property !== null && typeof (property as { description?: unknown }).description !== 'string') missing.push(`${path}/properties/${name}`);
        missing.push(...undescribed(property, `${path}/properties/${name}`));
      }
    } else missing.push(...undescribed(value, `${path}/${key}`));
  }
  return missing;
}

describe('descriptions of the schemas', () => {
  // They are the help of the property panel of an editor and the generated reference.
  it('every property has a description', () => {
    const schemas = { screen: SCREEN_SCHEMA, theme: THEME_SCHEMA, navigation: NAVIGATION_SCHEMA, messages: MESSAGES_SCHEMA, datasources: DATASOURCES_SCHEMA, project: PROJECT_SCHEMA };
    for (const [name, schema] of Object.entries(schemas)) expect(undescribed(schema), name).toEqual([]);
  });
});

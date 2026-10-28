/** The HTTP methods of a data source, in the order they are offered. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Methods whose request has a body. */
export const METHODS_WITH_BODY: readonly string[] = ['POST', 'PUT', 'PATCH'];

/**
 * Colour of every method (preset colours of the NG-ZORRO tags), the same in the OpenAPI import and in the data sources
 * panel: blue reads, green creates, orange and gold change, red deletes.
 */
export const METHOD_COLORS: Readonly<Record<string, string>> = { GET: 'blue', POST: 'green', PUT: 'orange', PATCH: 'gold', DELETE: 'red' };

// The boundaries of the architecture (CLAUDE.md § 5), checked by dependency-cruiser: npm run deps:check.
//
//   runtime → components → core → expressions / schema
//   runtime → services → core
//
// Dependencies go only downwards, never in a cycle; a library uses another only through its public API (its bare
// name, `core`, `schema`…), never a file inside it; `core` has no NG-ZORRO apart from the screen shell; only `services`
// (and the runtime that wires it) talks HTTP. The CLI reads checks from the sources of core, expressions and schema.

const LIBRARIES = '(schema|expressions|core|components|services)';

/** Libraries below which a project may not go: [project, forbidden projects]. */
const LAYERS = [
  ['schema', 'expressions|core|components|services|runtime|cli'],
  ['expressions', 'core|components|services|runtime|cli'],
  ['core', 'components|services|runtime|cli'],
  ['components', 'services|runtime|cli'],
  ['services', 'components|runtime|cli'],
  ['cli', 'components|services|runtime'],
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle between modules: one of them depends on the other the wrong way round. A cycle closed by an import type does not exist at run time and is allowed (ScreenRuntime and its ports).',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    ...LAYERS.map(([project, below]) => ({
      name: `layer-${project}`,
      severity: 'error',
      comment: `${project} may not depend on ${below.split('|').join(', ')}: dependencies go only downwards.`,
      from: { path: `^projects/${project}/` },
      to: { path: `^projects/(${below})/` },
    })),
    {
      name: 'public-api-only',
      severity: 'error',
      comment: 'A library uses another only through its public API (import from its name), never a file inside it.',
      from: { path: `^projects/(${LIBRARIES.slice(1, -1)}|runtime)/` },
      to: { path: `^projects/${LIBRARIES}/`, pathNot: ['^projects/$1/', `^projects/${LIBRARIES}/(validation/)?src/public-api\\.ts$`] },
    },
    {
      name: 'core-without-ng-zorro',
      severity: 'error',
      comment: 'core has no NG-ZORRO: components that use it live in components. Exceptions: the screen shell (alert, typography, breadcrumb) and the tooltip of the node host.',
      from: { path: '^projects/core/', pathNot: ['^projects/core/src/lib/screen\\.component\\.ts$', '^projects/core/src/lib/node-host\\.component\\.ts$', '\\.spec\\.ts$'] },
      to: { path: '^node_modules/ng-zorro-antd/' },
    },
    {
      name: 'core-shell-ng-zorro',
      severity: 'error',
      comment: 'The exceptions of core use only these NG-ZORRO modules.',
      from: { path: '^projects/core/src/lib/(screen|node-host)\\.component\\.ts$' },
      // An entry point resolves to its declarations, types/ng-zorro-antd-<module>.d.ts.
      to: { path: '^node_modules/ng-zorro-antd/', pathNot: '^node_modules/ng-zorro-antd/types/ng-zorro-antd-(alert|typography|breadcrumb|tooltip)\\.d\\.ts$' },
    },
    {
      name: 'http-only-in-services',
      severity: 'error',
      comment: 'All calls go through the DataClient port: only services (and the runtime that provides it) uses HttpClient.',
      from: { path: '^projects/(schema|expressions|core|components|cli)/', pathNot: '\\.spec\\.ts$' },
      to: { path: '^node_modules/@angular/common/(types/)?http' },
    },
    {
      name: 'no-dev-dependencies-in-libraries',
      severity: 'error',
      comment: 'The code of a library ships to applications: it cannot use a development dependency (tests may).',
      from: { path: `^projects/${LIBRARIES}/`, pathNot: ['\\.spec\\.ts$', '-testing\\.ts$'] },
      to: { dependencyTypes: ['npm-dev'], pathNot: ['^node_modules/@types/'] },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'An import that does not resolve: a missing package or a wrong path. The examples in public/examples are copied by demo:prepare.',
      from: {},
      to: { couldNotResolve: true, pathNot: '/public/examples/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^dist/', '^\\.angular/', 'validators\\.generated\\.ts$'] },
    tsPreCompilationDeps: true,
    // The package.json of a library (its peer dependencies) together with that of the workspace (dependencies and
    // devDependencies), so that a development dependency is recognised as such.
    combinedDependencies: true,
    tsConfig: { fileName: 'tsconfig.deps.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};

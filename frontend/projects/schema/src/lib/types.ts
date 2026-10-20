/** Types of the core language, aligned with schemas/screen.schema.json. */

/** CEL expression in double braces, for example `{{can('orders.order.approve')}}`. */
export type Expression = string;

export interface DataSourceDefinition {
  type: 'rest';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** Query parameters (GET, DELETE). */
  params?: Record<string, unknown>;
  /** Body (POST, PUT, PATCH): an object with expressions or a single expression such as `{{form}}`. If missing, `params` is used. */
  body?: Record<string, unknown> | Expression;
  paging?: 'server' | 'none';
}

/** Reference to a data source of the project (`<document>/<name>`); `params` and `body` replace those of the referenced one. */
export interface DataSourceReference {
  ref: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown> | Expression;
}

/** A data source of a screen: defined in the screen or referred to in the project. */
export type DataSourceEntry = DataSourceDefinition | DataSourceReference;

/** Data sources of a project shared by its screens (`datasources.schema.json`). */
export interface DataSourcesDefinition {
  schemaVersion: string;
  /** Identifier of the document: the first part of the references. */
  datasources: string;
  description?: string;
  sources: Record<string, DataSourceDefinition>;
}

export interface CallStep {
  call: string;
  args?: Record<string, unknown>;
  /** Name under which the following steps see the response. */
  as?: string;
  /** Steps if the call fails; they see `error.status`. */
  onError?: Step | Step[];
}
/** Conditional step. */
export interface IfStep {
  if: string;
  then: Step | Step[];
  else?: Step | Step[];
}
/** Runs a named sequence of the screen (`actions`). */
export interface RunStep {
  run: string;
}
export interface RefreshStep {
  refresh: string;
}
export interface NavigateStep {
  navigate: string;
  params?: Record<string, unknown>;
}
export interface ToastStep {
  toast: string;
}
export interface SetStep {
  set: { path: string; value: unknown };
}
export interface ConfirmStep {
  /** Question to the user; if they give up the sequence stops without errors. */
  confirm: string;
}
export interface DialogStep {
  /** Window with a form; the `onSubmit` steps see the values in `form`. If the user cancels the sequence stops. */
  dialog: {
    title: string;
    fields: FieldDefinition[];
    initial?: Record<string, unknown>;
    columns?: number;
    submitLabel?: string;
    onSubmit: Step[];
  };
}
/** Checks the standalone fields of a group (`*` = all): if one is not valid it shows the errors and stops the sequence. */
export interface ValidateStep {
  validate: string;
}
/** Opens the browser's print dialog. */
export interface PrintStep {
  print: true;
}
/** Downloads as CSV the rows of a data source. */
export interface ExportStep {
  export: { source: string; fileName?: string; args?: Record<string, unknown>; columns: { field: string; label?: string }[] };
}
export type Step = CallStep | RefreshStep | NavigateStep | ToastStep | SetStep | ConfirmStep | DialogStep | ValidateStep | PrintStep | ExportStep | IfStep | RunStep;

export interface ConditionalProps {
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  readOnlyIf?: Expression;
}

export interface ActionDefinition {
  id?: string;
  label: string;
  tooltip?: string;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  onClick: Step[];
}

export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea' | 'datetime' | 'radio' | 'switch' | 'multiselect' | 'lookup' | 'file' | 'repeater' | 'richtext' | 'password';
  /** For `repeater`: the fields of every row (simple types only). */
  fields?: FieldDefinition[];
  /** For `repeater`: minimum and maximum rows. */
  minRows?: number;
  maxRows?: number;
  /** For `repeater`: text of the button that adds a row. */
  addLabel?: string;
  /** For `file`: allowed extensions and MIME types, separated by commas. */
  accept?: string;
  /** For `file`: maximum size in KB (1024 if absent). */
  maxSizeKb?: number;
  /** For `file`: data source the file is sent to right away (variable `file`). */
  upload?: string;
  /** For `file` with `upload`: multipart (default) or base64 in the JSON body. */
  uploadAs?: 'multipart' | 'base64';
  /** For `lookup`: data source searched while typing (variable `search`), value field and text field. */
  lookup?: { source: string; valueField?: string; labelField: string; minChars?: number };
  /** Columns taken in the form grid (1 if absent). */
  span?: number;
  /** Visible rows of a `textarea` field (4 if absent). */
  rows?: number;
  label?: string;
  tooltip?: string;
  required?: boolean;
  options?: string[];
  /** Prefix of the translation keys of the option labels (`<prefix>.<value>`). */
  optionKey?: string;
  /** The value never appears in traces and logs. */
  sensitive?: boolean;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  readOnlyIf?: Expression;
  validate?: { rule: Expression; message: string };
  /** For text, textarea and richtext: number of characters allowed. */
  minLength?: number;
  maxLength?: number;
  /** For text and textarea: regular expression the whole value must match (Unicode, as the HTML `pattern` attribute). */
  pattern?: string;
  /** For text and textarea: expected format (built-in validator). */
  format?: ValidationFormat;
  /** For the national formats: ISO country code or an expression that gives it. */
  country?: string;
  /** For text and textarea: changes applied when leaving the field and before checking and sending. */
  transform?: TextTransform[];
  /** For number: limits, multiple of `step` (from `min`), maximum decimal places, whole numbers only. */
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  integer?: boolean;
  /** For date and datetime: earliest and latest date (YYYY-MM-DD, YYYY-MM-DDTHH:mm, or today, today+30d, today-18y). */
  minDate?: string;
  maxDate?: string;
  /** For password: a new password (strength meter, autocomplete new-password) and its minimum strength (0–4). */
  newPassword?: boolean;
  minStrength?: number;
  /** For multiselect: minimum and maximum number of choices. */
  minItems?: number;
  maxItems?: number;
  /** Messages that replace the standard ones, by constraint. */
  messages?: Partial<Record<FlatConstraint, string>>;
  /** Advanced validation: rules checked in order after the flat constraints. */
  validation?: ValidationRule[];
}

/** Formats of the built-in validators (`format`). */
export type ValidationFormat = 'email' | 'url' | 'phone' | 'iban' | 'bic' | 'uuid' | 'alphanumeric' | 'vatNumber' | 'taxCode' | 'companyId' | 'postalCode';
/** Changes applied to a text before it is checked and sent. */
export type TextTransform = 'trim' | 'uppercase' | 'lowercase' | 'removeSpaces';
/** Constraints that can be written as flat properties of a field (and whose message `messages` can replace). */
export type FlatConstraint = 'required' | 'minLength' | 'maxLength' | 'pattern' | 'format' | 'min' | 'max' | 'step' | 'decimals' | 'integer' | 'minDate' | 'maxDate' | 'minStrength' | 'minItems' | 'maxItems';

/**
 * Rule of a validation list, named by its key (exactly one of `required` … `use`), with an optional message,
 * condition and severity. The schema keeps the variants apart; here they share one shape.
 */
export interface ValidationRule {
  required?: true;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: ValidationFormat;
  country?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  integer?: true;
  minDate?: string;
  maxDate?: string;
  minStrength?: number;
  minItems?: number;
  maxItems?: number;
  /** Equal to another field. */
  sameAs?: string;
  /** Date after / before that of another field (`inclusive`: the same date is allowed). */
  after?: string;
  before?: string;
  inclusive?: boolean;
  /** At least one of these fields (or this one) is filled in. */
  atLeastOne?: string[];
  /** For repeater: column whose values must not repeat across rows. */
  unique?: string;
  /** CEL condition that must be true. */
  rule?: Expression;
  /** Validator registered by the application, with its parameters. */
  use?: string;
  params?: Record<string, unknown>;
  /** Data source that checks the value on a service, after `debounce` ms without typing (400 if absent). */
  remote?: string;
  debounce?: number;
  message?: string;
  /** The rule applies only while this condition is true. */
  when?: Expression;
  /** `warning` shows the message without blocking (`error` if absent). */
  severity?: 'error' | 'warning';
}

/** Rule of a form across its fields: `fields` are those it checks and that receive the message. */
export interface FormValidationRule extends ValidationRule {
  fields?: string[];
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger';
export type CellFormat = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'badge' | 'markdown';
/** Plain or formatted text (restricted Markdown). */
export type TextFormat = 'plain' | 'markdown';

/** Column of a table or field of a detail panel. */
export interface ColumnDefinition {
  field: string;
  label?: string;
  tooltip?: string;
  format?: CellFormat;
  /** Prefix of the translation keys of the shown values (`<prefix>.<value>`); badges stay tied to the original value. */
  valueKey?: string;
  /** Decimals for `number` (up to 2 if absent). */
  decimals?: number;
  /** ISO 4217 code for `currency` (EUR if absent). */
  currency?: string;
  /** For `badge`: tone for every value. */
  badges?: Record<string, Tone>;
  visibleIf?: Expression;
  hiddenIf?: Expression;
}

/** Table column: compared with a detail field, it adds the properties that make sense only in a table. */
export interface TableColumnDefinition extends ColumnDefinition {
  /** The column can be sorted. */
  sortable?: boolean;
  /** The value becomes a link that runs the steps with the row in `row`. */
  onClick?: Step[];
  /** Value of the column in the totals row, computed on the loaded rows. */
  aggregate?: Aggregate;
}

export type Aggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** Path in the screen state, for example `state.sorting`. */
export type StatePath = string;

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

interface NodeBase extends ConditionalProps {
  id?: string;
  /** In a `box`: share of the free space. */
  grow?: number;
  /** In a `grid`: columns taken. */
  span?: number;
  /** In a `border`: region (center if absent). */
  region?: BorderRegion;
  /** Help text on mouse hover or with the focus (text only, it can contain `{{ }}`). */
  tooltip?: string;
}

export interface SectionNode extends NodeBase {
  type: 'section';
  title?: string;
  /** Components stacked (default) or side by side (`row`). */
  layout?: 'column' | 'row';
  components: NodeDefinition[];
}
export interface TextNode extends NodeBase {
  type: 'text';
  text: string;
  style?: 'heading' | 'body';
  /** markdown: formatted text (lists, bold…), always drawn without HTML. */
  format?: TextFormat;
}
export interface ButtonNode extends NodeBase {
  type: 'button';
  label: string;
  onClick: Step[];
}
export interface FilterBarNode extends NodeBase {
  type: 'filterBar';
  bind: string;
  fields: FieldDefinition[];
}
export interface TableNode extends NodeBase {
  type: 'table';
  source: string;
  /** «Refresh» button in the footer. */
  refreshable?: boolean;
  columns: TableColumnDefinition[];
  /** Sorting: with server paging it is written in the `bind` state for the service, otherwise it sorts in the page. */
  sort?: { bind?: StatePath; default?: SortSpec };
  /** Row selection: keys in the `bind` state (field `key`, id if absent). */
  selection?: { bind: StatePath; key?: string };
  /** Actions on the selected rows; expressions see `selection`. */
  bulkActions?: ActionDefinition[];
  rowActions?: ActionDefinition[];
  /** How many visible row actions to show as buttons; the others go into the «⋯» menu (0 = all in the menu). */
  rowActionsInline?: number;
  /** Area that opens under the row; its nodes see the row as `row`. */
  expand?: { components: NodeDefinition[]; expandIf?: Expression };
}
export interface FormNode extends NodeBase {
  type: 'form';
  /** Data source of the initial values; absent in entry forms. */
  source?: string;
  /** Initial values with expressions, resolved once when the screen opens. */
  initial?: Record<string, unknown>;
  fields: FieldDefinition[];
  actions?: ActionDefinition[];
  /** Columns of the field grid (1 if absent). */
  columns?: number;
  /** Rules across fields, checked with those of the fields. */
  validation?: FormValidationRule[];
}

export interface TabDefinition {
  id?: string;
  label: string;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  components: NodeDefinition[];
}
export interface TabsNode extends NodeBase {
  type: 'tabs';
  tabs: TabDefinition[];
}
export interface DetailNode extends NodeBase {
  type: 'detail';
  title?: string;
  /** Data source that returns a single record. */
  source: string;
  fields: ColumnDefinition[];
}
export interface AlertNode extends NodeBase {
  type: 'alert';
  text: string;
  kind?: 'info' | 'success' | 'error';
  format?: TextFormat;
}

/** An indicator: value from a field of the record (`field`) or from an expression (`value`, with the record as `row`). */
export interface StatItem {
  id?: string;
  label: string;
  field?: string;
  value?: Expression;
  format?: CellFormat;
  currency?: string;
  decimals?: number;
  valueKey?: string;
  tone?: Tone;
  caption?: string;
  tooltip?: string;
  visibleIf?: Expression;
  hiddenIf?: Expression;
}
export interface StatsNode extends NodeBase {
  type: 'stats';
  /** Data source that returns a record with the values. */
  source?: string;
  items: StatItem[];
}

export interface WizardStep {
  id?: string;
  label: string;
  description?: string;
  components: NodeDefinition[];
  /** Next is enabled only if true. */
  nextIf?: Expression;
}
export interface WizardNode extends NodeBase {
  type: 'wizard';
  /** State with the index of the current step (from 0). */
  bind?: StatePath;
  steps: WizardStep[];
  nextLabel?: string;
  backLabel?: string;
}

export interface TreeNode extends NodeBase {
  type: 'tree';
  /** Data source with the root nodes and their nested children. */
  source: string;
  keyField?: string;
  labelField: string;
  childrenField?: string;
  /** State where the key of the chosen node is written. */
  bind?: StatePath;
  searchable?: boolean;
  expandAll?: boolean;
  /** Steps run when a node is chosen (the node is `row`). */
  onSelect?: Step[];
}

export interface CalendarNode extends NodeBase {
  type: 'calendar';
  source: string;
  dateField: string;
  labelField: string;
  badgeField?: string;
  badges?: Record<string, Tone>;
  /** State with the visible month (YYYY-MM). */
  bind?: StatePath;
  maxPerDay?: number;
  /** Steps on click on an event (the event is `row`). */
  onSelect?: Step[];
}

export interface ChartSeries {
  field: string;
  label?: string;
  tone?: Tone;
  /** How to draw the series (combined charts); if absent the chart kind applies. */
  kind?: 'bar' | 'line';
  /** Value axis: on the right for different quantities. */
  axis?: 'left' | 'right';
}
export interface ChartNode extends NodeBase {
  type: 'chart';
  kind: 'bar' | 'line' | 'pie';
  source: string;
  categoryField: string;
  categoryFormat?: 'text' | 'date' | 'month';
  categoryKey?: string;
  series: ChartSeries[];
  format?: 'number' | 'currency' | 'percent';
  currency?: string;
  decimals?: number;
  height?: number;
  caption?: string;
  /** Stacked bars instead of side by side. */
  stacked?: boolean;
  /** Format of the values of the right axis (as `format` if absent). */
  rightFormat?: 'number' | 'currency' | 'percent';
}

/** Column of the datatable: adds filter and grouping. */
export interface DataColumnDefinition extends TableColumnDefinition {
  filter?: 'text' | 'select' | 'number' | 'date';
  groupable?: boolean;
}
export interface DataTableNode extends NodeBase {
  type: 'dataTable';
  source: string;
  /** «Refresh» button in the footer. */
  refreshable?: boolean;
  columns: DataColumnDefinition[];
  /** Initial grouping columns, in order. */
  groupBy?: string[];
  defaultSort?: SortSpec;
  pageSize?: number;
  rowActions?: ActionDefinition[];
  rowActionsInline?: number;
}

/** Datatable driven by the service: filters, sorting, groups, totals and pages are computed by the data source. */
export interface ServerDataTableNode extends NodeBase {
  type: 'serverDataTable';
  /** «Refresh» button in the footer. */
  refreshable?: boolean;
  /** Search data source: it receives `request` and returns rows, groups or distinct values. */
  source: string;
  columns: DataColumnDefinition[];
  groupBy?: string[];
  defaultSort?: SortSpec;
  pageSize?: number;
  /** State where the current request (without the page) is written. */
  bind?: StatePath;
  rowActions?: ActionDefinition[];
  rowActionsInline?: number;
}

export type LayoutGap = 'none' | 'small' | 'medium' | 'large';
export type BorderRegion = 'north' | 'south' | 'west' | 'east' | 'center';

/** Flexible container: children in a row or in a column. */
export interface BoxNode extends NodeBase {
  type: 'box';
  components: NodeDefinition[];
  direction?: 'row' | 'column';
  gap?: LayoutGap;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

/** Grid of columns: children take `span` columns. */
export interface GridNode extends NodeBase {
  type: 'grid';
  components: NodeDefinition[];
  columns?: number;
  gap?: LayoutGap;
}

/** Border layout: north, south, west, east and center regions, chosen by the children with `region`. */
export interface BorderNode extends NodeBase {
  type: 'border';
  components: NodeDefinition[];
  westWidth?: number;
  eastWidth?: number;
  gap?: LayoutGap;
  /** Draggable dividers between the center and the sides. */
  resizable?: boolean;
}

/** Image with alternative text; only relative, https or data:image addresses. */
export interface ImageNode extends NodeBase {
  type: 'image';
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover';
}

/** Link to a screen of the application or to an external https address. */
export interface LinkNode extends NodeBase {
  type: 'link';
  label: string;
  screen?: string;
  params?: Record<string, unknown>;
  href?: string;
}

/** Progress bar or circle. */
export interface ProgressNode extends NodeBase {
  type: 'progress';
  value: string | number;
  max?: string | number;
  label?: string;
  kind?: 'line' | 'circle';
  tone?: Tone;
}

/** Events in date order. */
export interface TimelineNode extends NodeBase {
  type: 'timeline';
  source: string;
  dateField: string;
  labelField: string;
  descriptionField?: string;
  toneField?: string;
  tones?: Record<string, Tone>;
  order?: 'desc' | 'asc';
  withTime?: boolean;
}

/** Cards in columns according to a field (for example the status), movable with `onMove`. */
export interface KanbanNode extends NodeBase {
  type: 'kanban';
  source: string;
  columnField: string;
  titleField: string;
  descriptionField?: string;
  columns: { value: string; label: string; tone?: Tone }[];
  moveIf?: Expression;
  onMove?: Step[];
}

/** Standalone field (text box, drop-down list, date…) bound to the screen state. */
export interface InputNode extends NodeBase {
  type: 'input';
  /** The field, with the same properties as the form fields. */
  field: FieldDefinition;
  /** State of the value (`state.<field name>` if absent). */
  bind?: StatePath;
  /** Initial value, if the state does not have one already. */
  default?: unknown;
  /** Steps after every change; they see the new value in `value`. */
  onChange?: Step[];
  /** Validation group for the `validate` step. */
  group?: string;
}

export type NodeDefinition = SectionNode | TextNode | ButtonNode | FilterBarNode | TableNode | FormNode | TabsNode | DetailNode | AlertNode | StatsNode | WizardNode | TreeNode | CalendarNode | ChartNode | DataTableNode | ServerDataTableNode | InputNode | BoxNode | GridNode | BorderNode | ImageNode | LinkNode | ProgressNode | TimelineNode | KanbanNode;
export type NodeType = NodeDefinition['type'];

export interface ScreenDefinition {
  schemaVersion: string;
  screen: string;
  title?: string;
  description?: string;
  requires?: string;
  /** Data sources by name; a reference is replaced by the referenced definition when the screen is loaded (`resolveDataSources`). */
  dataSources?: Record<string, DataSourceEntry>;
  /** Named sequences of steps, called by the `run` step. */
  actions?: Record<string, Step | Step[]>;
  components: NodeDefinition[];
}

/** Theme: design tokens applied by the runtime as CSS variables. Aligned with schemas/theme.schema.json. */
export interface ThemeColors {
  primary: string;
  onPrimary: string;
  background: string;
  surface: string;
  onSurface: string;
  mutedText?: string;
  border: string;
  danger?: string;
  success?: string;
  /** Warnings that do not block (#ad6800 if absent). */
  warning?: string;
}

export interface ThemeLayout {
  sider?: {
    tone?: 'light' | 'dark';
    background?: string;
    text?: string;
    mutedText?: string;
    activeBackground?: string;
    activeText?: string;
    border?: string;
    width?: number;
    collapsedWidth?: number;
  };
  header?: { background?: string; text?: string; border?: string; height?: number };
  pageHeader?: { background?: string; text?: string; mutedText?: string; border?: string };
  content?: { padding?: number };
}

export interface ThemeTokens {
  colors: ThemeColors;
  typography?: { fontFamily?: string; baseSize?: number };
  shape?: { radius?: number };
  density?: 'compact' | 'comfortable';
  layout?: ThemeLayout;
}

/** Logo and name of the application at the top left (the Quadrava logo if absent). Images: relative, https:// or data:image/…. */
export interface ThemeBrand {
  name?: string;
  logo?: string;
  /** For a dark side bar. */
  logoOnDark?: string;
  /** Square, for the collapsed side bar. */
  icon?: string;
  /** The name next to the logo. */
  showName?: boolean;
  /** Height of the logo in px (32 if absent). */
  height?: number;
}

export interface ThemeDefinition {
  schemaVersion: string;
  theme: string;
  label?: string;
  mode?: 'light' | 'dark';
  /** Logo and name of the application at the top left. */
  brand?: ThemeBrand;
  tokens: ThemeTokens;
}

/** Navigation: areas with a three-level menu. Aligned with schemas/navigation.schema.json. */
export interface NavigationBase {
  id: string;
  label: string;
  icon?: string;
  /** Permission needed to see the item. */
  requires?: string;
  visibleIf?: Expression;
}

export interface NavigationLeaf extends NavigationBase {
  screen: string;
  params?: Record<string, string | number | boolean>;
}

export interface NavigationGroup2 extends NavigationBase {
  children: NavigationLeaf[];
}

export type NavigationItem2 = NavigationLeaf | NavigationGroup2;

export interface NavigationGroup1 extends NavigationBase {
  children: NavigationItem2[];
}

export type NavigationItem1 = NavigationLeaf | NavigationGroup1;

/** Group at any level: the runtime walks the tree without telling levels apart (the schema limits them). */
export interface NavigationGroup extends NavigationBase {
  children: NavigationItem[];
}

export type NavigationItem = NavigationLeaf | NavigationGroup;

export interface NavigationArea {
  id: string;
  label: string;
  icon?: string;
  requires?: string;
  visibleIf?: Expression;
  items: NavigationItem1[];
}

export interface NavigationDefinition {
  schemaVersion: string;
  navigation: string;
  default?: string;
  /** Counters next to the items: GET that returns { item id: number }. */
  badges?: { url: string; refreshSeconds?: number };
  areas: NavigationArea[];
}

/** Translation catalogue of one language (`messages` document of the registry). */
export interface MessagesDefinition {
  schemaVersion: string;
  /** Language, which is also the identifier of the document. */
  messages: string;
  /** Key → text. */
  texts: Record<string, string>;
}

/** Manifest of a project (`project.json`): the configuration of an application. Aligned with schemas/project.schema.json. */
export interface ProjectDefinition {
  schemaVersion: string;
  /** Identifier of the project (kebab-case). */
  project: string;
  name: string;
  description?: string;
  /** Languages of the application; one translation catalogue each. */
  languages: string[];
  /** Language of the fallback texts written in the screens. */
  defaultLanguage: string;
  /** Themes the user can choose, the first one initial (all those of the project if missing). */
  themes?: string[];
}

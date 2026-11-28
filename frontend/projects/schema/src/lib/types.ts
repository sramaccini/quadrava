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
  /** GET only: the data source is read again when an event of this same-origin event stream arrives. */
  live?: { url: string; events?: string[] };
}

/** Reference to a data source of the project (`<document>/<name>`); `params` and `body` replace those of the referenced one. */
export interface DataSourceReference {
  ref: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown> | Expression;
}

/**
 * A data source of a screen. In the screen document it is always a reference to the project (the schema allows nothing
 * else); once the screen is loaded the reference is replaced by the definition it points to (`resolveDataSources`).
 */
export type DataSourceEntry = DataSourceDefinition | DataSourceReference;

/** Data sources of a project shared by its screens (`datasources.schema.json`). */
export interface DataSourcesDefinition {
  schemaVersion: string;
  /** Identifier of the document: the first part of the references. */
  datasources: string;
  description?: string;
  /** Address put in front of the url of every data source of the document (`joinUrl`). */
  baseUrl?: string;
  sources: Record<string, DataSourceDefinition>;
}

export interface CallStep {
  call: string;
  args?: Record<string, unknown>;
  /** Name under which the following steps see the response. */
  as?: string;
  /** Steps if the call fails; they see `error.status`. Not run on a 401, which the session handles. */
  onError?: Step | Step[];
}
/** Saves as a file the answer of a GET data source, called like `call`. */
export interface DownloadStep {
  download: string;
  args?: Record<string, unknown>;
  /** Name of the file when the service gives none (`Content-Disposition`); it can contain `{{ }}`. */
  fileName?: string;
  /** Steps if the download fails; they see `error.status`. Not run on a 401. */
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
/** Window that shows components with the data of the screen; the sequence goes on when the user closes it. */
export interface ViewStep {
  view: {
    title: string;
    size?: 'small' | 'medium' | 'large' | 'full';
    components: NodeDefinition[];
    closeLabel?: string;
  };
}
/**
 * Small panel with a form under the button that ran the step; the `onSubmit` steps see the values in `form`. If the user
 * closes it the sequence stops. Without a button to point at it opens as a dialog window.
 */
export interface PopoverStep {
  popover: {
    title: string;
    icon?: string;
    tone?: Tone;
    fields: FieldDefinition[];
    initial?: Record<string, unknown>;
    submitLabel?: string;
    submitEnabledIf?: Expression;
    onSubmit: Step[];
  };
}
/** Checks the standalone fields of a group (`*` = all): if one is not valid it shows the errors and stops the sequence. */
export interface ValidateStep {
  validate: string;
}
/** Opens the browser's print dialog. */
/** Writes a text to the clipboard. */
export interface CopyStep {
  copy: string;
  /** Notice when it is copied («Copied to the clipboard» if absent). */
  copied?: string;
  /** Steps if the browser refuses. */
  onError?: Step | Step[];
}
/** Writes to the clipboard the full address of a screen (the current one if `screen` is absent). */
export interface CopyLinkStep {
  copyLink: { screen?: string; params?: Record<string, unknown> };
  copied?: string;
  onError?: Step | Step[];
}
export interface PrintStep {
  print: true;
}
/** Shows the files (images, PDFs) of the rows of a data source, with next and previous. */
export interface PreviewStep {
  preview: { source: string; start?: string; urlField?: string; nameField?: string; typeField?: string };
}
/** Brings a component into view and focuses its first field, or the field named. */
export interface FocusStep {
  focus: string | { component: string; field?: string };
}
/** Downloads as CSV the rows of a data source. */
export interface ExportStep {
  export: { source: string; fileName?: string; args?: Record<string, unknown>; columns: { field: string; label?: string }[] };
}
export type Step = CallStep | DownloadStep | CopyStep | CopyLinkStep | RefreshStep | NavigateStep | ToastStep | SetStep | ConfirmStep | DialogStep | ViewStep | PopoverStep | ValidateStep | PrintStep | FocusStep | PreviewStep | ExportStep | IfStep | RunStep;

export interface ConditionalProps {
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  readOnlyIf?: Expression;
}

export interface ActionDefinition {
  id?: string;
  label: string;
  /** Icon before the text, from the built-in set. */
  icon?: string;
  tooltip?: string;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  onClick: Step[];
}

/** Action on a row of a table: it runs steps or opens a relative path of the application, with the row in `row`. */
/** Highlight of a row or a card: colour of `tone` and an icon whose `label` screen readers hear (not colour alone). */
export interface RowHighlight {
  /** Condition that sees the row as `row`; an error does not highlight. */
  when: Expression;
  /** `warning` if absent. */
  tone?: 'warning' | 'danger' | 'success' | 'primary';
  /** `warning` if absent; drawn filled when it has a filled form. */
  icon?: string;
  label: string;
}
/**
 * Action shown as a link under a field of a form: it puts `value` in the field (saved at once in an inline form) or runs
 * steps; its expressions see `form`, `field` and `value`.
 */
export type FieldActionDefinition = (Omit<ActionDefinition, 'onClick'> & { value: unknown; onClick?: never }) | (Omit<ActionDefinition, 'onClick'> & { onClick: Step[]; value?: never });
export type RowActionDefinition = (Omit<ActionDefinition, 'onClick'> & { onClick: Step[]; href?: never }) | (Omit<ActionDefinition, 'onClick'> & { href: string; onClick?: never });

/** Sizes of an input: about 8, 16, 32 and 48 characters, or the whole line (`full`). */
export type FieldWidth = 'xs' | 's' | 'm' | 'l' | 'full';

export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea' | 'datetime' | 'radio' | 'switch' | 'multiselect' | 'lookup' | 'file' | 'repeater' | 'richtext' | 'password' | 'tags';
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
  /** For `file`: several files, each uploaded on its own; the value is their list. */
  multiple?: boolean;
  /** For `file`: a button (default) or a drop zone, with the label as the text of its button; for text in an inline form: a heading. */
  display?: 'button' | 'dropzone' | 'heading';
  /** For `file` shown as dropzone: a short text under the button. */
  hint?: string;
  /** Links under the field in a form, such as «Assign to me». */
  actions?: FieldActionDefinition[];
  /** In an inline form: the text in place of an empty value that can be changed. */
  emptyText?: string;
  /** For `file`: data source the file is sent to right away (variable `file`). */
  upload?: string;
  /** For `file` with `upload`: multipart (default) or base64 in the JSON body. */
  uploadAs?: 'multipart' | 'base64';
  /** For `lookup`: data source searched while typing (variable `search`), value field and text field. */
  lookup?: { source: string; valueField?: string; labelField: string; minChars?: number };
  /** For `text` and `tags`: suggestions from a data source while typing (variables `search` and `word`); the value stays free text. */
  suggest?: { source: string; valueField?: string; labelField?: string; descriptionField?: string; minChars?: number; replace?: 'word' | 'all' };
  /** Columns taken in the form grid (1 if absent). */
  span?: number;
  /** Width of the input, from the sizes of the theme or the whole line (`full`); without it the whole cell (in a `flow` form a whole line, at most 560px). */
  width?: FieldWidth;
  /** Visible rows of a `textarea` field (4 if absent). */
  rows?: number;
  label?: string;
  tooltip?: string;
  required?: boolean;
  options?: string[];
  /** Prefix of the translation keys of the option labels (`<prefix>.<value>`). */
  optionKey?: string;
  /** Translation keys of single option labels, by value (a value such as `*` cannot be part of a key); before `optionKey`. */
  optionKeys?: Record<string, string>;
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
  /** For multiselect and tags: minimum and maximum number of choices. */
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
export type CellFormat = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'relative' | 'boolean' | 'badge' | 'markdown' | 'image';
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
  /** Translation keys of single shown values, by value (a value such as `*` cannot be part of a key); before `valueKey`. */
  valueKeys?: Record<string, string>;
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
  /** The value becomes a link to this relative path of the application, with the row in `row` (not with `onClick`). */
  href?: string;
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
/** How a button looks: `display` icon alone (with `icon`), a `count` next to it, a `pressed` state. */
export interface ButtonFaceProps {
  /** A tone or an expression that gives one: the colour of the button, or of its pressed state on a toggle. */
  tone?: string;
  display?: 'label' | 'icon';
  count?: string;
  pressed?: Expression;
}
export interface ButtonNode extends NodeBase, ButtonFaceProps {
  type: 'button';
  label: string;
  /** Icon before the text, from the built-in set; alone with display icon. */
  icon?: string;
  onClick: Step[];
}
/** A fixed item of the menu of a `menuButton`. */
export interface MenuActionItem {
  id?: string;
  label: string;
  icon?: string;
  /** danger for an action that removes something; neutral if absent. */
  tone?: Tone;
  visibleIf?: string;
  enabledIf?: string;
  onClick: Step[];
}
/** The items of a menu made from the rows of a data source: their steps and expressions see the row as `item`. */
export interface MenuSourceItems {
  source: string;
  labelField: string;
  /** Field that identifies the row (`id` if absent). */
  keyField?: string;
  /** Field shown as a coloured label after the text. */
  badgeField?: string;
  /** Field whose value picks the colour in `tones` (`badgeField` if absent). */
  toneField?: string;
  tones?: Record<string, Tone>;
  /** Prefix of the translation keys of the label (prefix.value). */
  valueKey?: string;
  enabledIf?: string;
  onClick: Step[];
}
export interface MenuDivider {
  divider: true;
}
export type MenuItemDefinition = MenuActionItem | MenuSourceItems | MenuDivider;
/** A button that opens a menu of items, each with its own steps (for example the statuses an issue can move to). */
export interface MenuButtonNode extends NodeBase, ButtonFaceProps {
  type: 'menuButton';
  label: string;
  icon?: string;
  items: MenuItemDefinition[];
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
  rowActions?: RowActionDefinition[];
  /** How many visible row actions to show as buttons; the others go into the «⋯» menu (0 = all in the menu). */
  rowActionsInline?: number;
  /** Area that opens under the row; its nodes see the row as `row`. */
  expand?: { components: NodeDefinition[]; expandIf?: Expression };
  /** Rows highlighted while `when` is true. */
  highlight?: RowHighlight;
}
/** Fields of a form that are data (`fieldsFrom`): one row per field, the names of its properties configurable. */
export interface FieldsFromDefinition {
  source: string;
  /** Object that holds their values (`form.<into>.<name>`); without it they sit next to the other fields. */
  into?: string;
  nameField?: string;
  labelField?: string;
  typeField?: string;
  optionsField?: string;
  requiredField?: string;
  /** Models by type of the row: fields of the screen whose name, label, options and required the row replaces. */
  types?: Record<string, FieldDefinition>;
}

export interface FormNode extends NodeBase {
  type: 'form';
  /** Data source of the initial values; absent in entry forms. */
  source?: string;
  /** Initial values with expressions, resolved once when the screen opens. */
  initial?: Record<string, unknown>;
  fields: FieldDefinition[];
  /** More fields read from a data source, after `fields` (labels and options are data, shown as they are). */
  fieldsFrom?: FieldsFromDefinition;
  actions?: ActionDefinition[];
  /** `form` (the default): the inputs always open; `inline`: values as text, one field at a time opened by a click. */
  edit?: 'form' | 'inline';
  /** With `edit: inline`: steps when a field is confirmed (`field` the name, `value` the new value). */
  onSave?: Step[];
  /** Columns of the field grid (1 if absent). */
  columns?: number;
  /** `grid` (the default): the fields in the columns; `flow`: one after the other while they fit, by their `width`. */
  layout?: 'grid' | 'flow';
  /** Rules across fields, checked with those of the fields. */
  validation?: FormValidationRule[];
  /** JSON Pointer of the values of the form in the body its actions send (`/order`); absent, they are the body. */
  errorPath?: string;
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
  valueKeys?: Record<string, string>;
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
/** A compact square-column time series for high-density activity dashboards. */
/** Nodes and edges read from one data source and laid out from left to right, for example a workflow. */
export interface GraphNode extends NodeBase {
  type: 'graph';
  source: string;
  nodes: { field?: string; keyField?: string; labelField?: string; valueKey?: string; toneField?: string; tones?: Record<string, Tone> };
  edges: { field?: string; fromField?: string; toField?: string; labelField?: string };
  highlight?: string;
  start?: string;
  edgeLabels?: boolean;
  height?: number;
  caption?: string;
}

export interface SquareChartNode extends NodeBase {
  type: 'squareChart';
  source: string;
  categoryField: string;
  categoryFormat?: 'text' | 'date' | 'month';
  valueField: string;
  format?: 'number' | 'currency' | 'percent';
  currency?: string;
  decimals?: number;
  height?: number;
  caption?: string;
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
  rowActions?: RowActionDefinition[];
  rowActionsInline?: number;
  /** Rows highlighted while `when` is true (only those of the current page are evaluated). */
  highlight?: RowHighlight;
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
  /** Row selection: keys in the `bind` state (field `key`, id if absent), kept across pages and groups. */
  selection?: { bind: StatePath; key?: string };
  /** Actions on the selected rows; expressions see `selection`. */
  bulkActions?: ActionDefinition[];
  rowActions?: RowActionDefinition[];
  rowActionsInline?: number;
  /** Rows of the page highlighted while `when` is true. */
  highlight?: RowHighlight;
}

export type LayoutGap = 'none' | 'small' | 'medium' | 'large';
export type BorderRegion = 'north' | 'south' | 'west' | 'east' | 'center';

/** Flexible container: children in a row or in a column. */
export interface BoxNode extends NodeBase {
  type: 'box';
  components: NodeDefinition[];
  /** plain (default) or dashed: a quiet dashed frame with some padding. */
  variant?: 'plain' | 'dashed';
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

/** A column of the kanban: `value` of `columnField`, header, colour and maximum number of cards. */
export interface KanbanColumnDefinition {
  value: string;
  label: string;
  tone?: Tone;
  limit?: number;
}

/** Cards in columns according to a field (for example the status), movable with `onMove`. */
export interface KanbanNode extends NodeBase {
  type: 'kanban';
  source: string;
  columnField: string;
  titleField: string;
  descriptionField?: string;
  /** Field that identifies the card (`id` if absent): `onMove` sees the neighbours' keys in `beforeId` and `afterId`. */
  keyField?: string;
  /** Name of the person of the card, shown with the initials. */
  avatarField?: string;
  /** Coloured labels on the card; `valueKey` translates the shown value (`<prefix>.<value>`), the tones stay tied to the stored one. */
  badges?: { field: string; tones?: Record<string, Tone>; valueKey?: string }[];
  /** Values at the bottom of the card. */
  footerFields?: { field: string; label?: string }[];
  /** Cards highlighted while `when` is true. */
  highlight?: RowHighlight;
  /** Columns, or an expression that returns them; `limit` is the maximum number of cards (work in progress). */
  columns?: KanbanColumnDefinition[] | Expression;
  /** Columns read from a data source instead of `columns`. */
  columnsFrom?: { source: string; valueField?: string; labelField?: string; toneField?: string; limitField?: string };
  /** Field that decides the swimlane, or an expression that returns its name; `lanes` gives order and headers (or an expression). */
  laneField?: string;
  lanes?: { value: string; label: string }[] | Expression;
  /** Cards can also change place within their column. */
  reorder?: boolean;
  /** With `laneField`, cards can also move to another lane (`lane` and `fromLane` in `onMove` and `moveIf`). */
  moveAcrossLanes?: boolean;
  moveIf?: Expression;
  onMove?: Step[];
  /** Steps that open a card (usually `navigate`), with the row in `row`. */
  onOpen?: Step[];
}

/** Thread of comments of a data source, in restricted Markdown, with a box for writing and mentions. */
export interface CommentsNode extends NodeBase {
  type: 'comments';
  source: string;
  textField?: string;
  authorField?: string;
  dateField?: string;
  order?: 'asc' | 'desc';
  /** Field with the kind of the row, for a feed that mixes comments, changes (`changes`) and work logs (`workLog`). */
  kindField?: string;
  /** Rows that record the change of a field, drawn as one line. */
  changes?: { kind?: string; fieldField?: string; fromField?: string; toField?: string; fieldKey?: string; valueKey?: string };
  /** Rows that record time spent (in minutes), drawn as one line with their text under it. */
  workLog?: { kind?: string; minutesField?: string };
  /** Chips above the feed: `true` for All, Comments, History, Work log, or the chips of the screen with the kinds they show. */
  filters?: boolean | { label: string; kinds?: string[] }[];
  /** Button that turns the order between newest and oldest first. */
  orderToggle?: boolean;
  /** State where the order chosen with `orderToggle` is kept. */
  orderBind?: StatePath;
  /** Steps that publish a comment; they see `text` and `mentions`. */
  onPost?: Step[];
  postIf?: Expression;
  /** Steps that save a changed comment; they see `row`, `text` and `mentions`. */
  onEdit?: Step[];
  /** Condition for the Edit button of each comment, with the comment in `row`. */
  editIf?: Expression;
  /** Steps that delete a comment, with the comment in `row`. */
  onDelete?: Step[];
  /** Condition for the Delete button of each comment, with the comment in `row`. */
  deleteIf?: Expression;
  /** Field of the row that says the comment was changed. */
  editedField?: string;
  /** People who can be mentioned with @ (a data source searched with `search`). */
  mentions?: { source: string; valueField?: string; labelField: string; minChars?: number };
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
  /** JSON Pointer of the value in the body of the calls started outside a form; `/<field name>` reaches it too. */
  errorPath?: string;
}

export type NodeDefinition = SectionNode | TextNode | ButtonNode | MenuButtonNode | FilterBarNode | TableNode | FormNode | TabsNode | DetailNode | AlertNode | StatsNode | WizardNode | TreeNode | CalendarNode | ChartNode | SquareChartNode | GraphNode | DataTableNode | ServerDataTableNode | InputNode | BoxNode | GridNode | BorderNode | ImageNode | LinkNode | ProgressNode | TimelineNode | KanbanNode | CommentsNode;
export type NodeType = NodeDefinition['type'];

/** Item of the path above the title of a screen: a link when it has `navigate`. */
export interface BreadcrumbItem {
  label: string;
  navigate?: string;
  params?: Record<string, unknown>;
  /** The item is in the path only while this is true (an error leaves it out). */
  visibleIf?: Expression;
}

/** A key of the screen that runs steps. */
export interface Shortcut {
  /** `m`, `shift+e`, `ctrl+k`: modifiers joined with `+`, in lower case. */
  key: string;
  label: string;
  onClick: Step[];
  visibleIf?: Expression;
  enabledIf?: Expression;
}

export interface ScreenDefinition {
  schemaVersion: string;
  screen: string;
  title?: string;
  /** Path above the title, in place of the path in the menu; the last item is the screen itself. */
  breadcrumb?: BreadcrumbItem[];
  description?: string;
  requires?: string;
  /**
   * Data sources by name: references to the data sources documents of the project, replaced by the definitions they point
   * to when the screen is loaded (`resolveDataSources`).
   */
  dataSources?: Record<string, DataSourceEntry>;
  /** Named sequences of steps, called by the `run` step. */
  actions?: Record<string, Step | Step[]>;
  /** Keys that run steps; `?` shows the list. */
  shortcuts?: Shortcut[];
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

/** Icons of the browser tab, in place of the Quadrava ones. */
export interface ThemeBrandIcons {
  svg?: string;
  /** PNG, 32 x 32 px. */
  png32?: string;
  /** PNG, 180 x 180 px, for the iOS home screen. */
  appleTouch?: string;
}

/** Logo and name of the application at the top left and in the browser tab (the Quadrava ones if absent). Images: relative, https:// or data:image/…. */
export interface ThemeBrand {
  name?: string;
  logo?: string;
  /** For a dark side bar. */
  logoOnDark?: string;
  /** Square, for the collapsed side bar. */
  icon?: string;
  /** Icons of the browser tab: with them, a kind not given is left out. */
  icons?: ThemeBrandIcons;
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

/** Messages of the user (ADR-22): GET that lists them, POST that marks them read, optional event stream. */
export interface NavigationNotifications {
  url: string;
  /** POST with { ids } that marks messages as read. */
  readUrl?: string;
  live?: { url: string; events?: string[] };
  /** Seconds between two reads (60 if absent). */
  refreshSeconds?: number;
}

export interface NavigationDefinition {
  schemaVersion: string;
  navigation: string;
  default?: string;
  /** Counters next to the items: GET that returns { item id: number }. */
  badges?: { url: string; refreshSeconds?: number };
  /** Messages of the user behind a bell in the top bar (ADR-22). */
  notifications?: NavigationNotifications;
  /** Items of the application in the user menu, each opening a screen (ADR-25). */
  userMenu?: NavigationLeaf[];
  /** Sections of the application in the settings dialog, each drawing a screen in a tab (ADR-25). */
  settings?: NavigationLeaf[];
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

/** Drawing of an icon of an asset pack: geometry only, in the current text colour. */
export interface AssetIconGeometry {
  viewBox: string;
  /** Path data (the `d` attribute of SVG paths). */
  paths: string[];
  fillRule?: 'nonzero' | 'evenodd';
}
/** An icon of an asset pack, named `pack/name` in the JSON. */
export interface AssetIcon extends AssetIconGeometry {
  /** Filled form, for a pressed toggle. */
  filled?: AssetIconGeometry;
  keywords?: string[];
}
/** An image of an asset pack, addressed as `asset:pack/name`. */
export interface AssetImage {
  type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';
  /** Base64 content. */
  data: string;
  alt?: string;
}
/** Asset pack (`assets` document of the registry, ADR-29), already cleaned by the CLI. Aligned with schemas/assets.schema.json. */
export interface AssetsDefinition {
  schemaVersion: string;
  /** Name of the pack, the namespace of its entries and the identifier of the document. */
  assets: string;
  version: string;
  license: string;
  description?: string;
  icons?: Record<string, AssetIcon>;
  images?: Record<string, AssetImage>;
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
  /** Values of the application, read by the expressions as `settings.<name>` (never secrets: they reach the browser). */
  settings?: Record<string, string>;
}

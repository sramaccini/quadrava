/** Tipi del nucleo del linguaggio, allineati a schemas/screen.schema.json. */

/** Espressione CEL tra doppie graffe, per esempio `{{can('ordini.ordine.approva')}}`. */
export type Expression = string;

export interface DataSourceDefinition {
  type: 'rest';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** Parametri di query (GET, DELETE). */
  params?: Record<string, unknown>;
  /** Corpo (POST, PUT, PATCH): oggetto con espressioni o una sola espressione come `{{form}}`. Se manca si usa `params`. */
  body?: Record<string, unknown> | Expression;
  paging?: 'server' | 'none';
}

export interface CallStep {
  call: string;
  args?: Record<string, unknown>;
  onError?: Step | Step[];
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
  /** Domanda all'utente; se rinuncia la sequenza si ferma senza errori. */
  confirm: string;
}
export type Step = CallStep | RefreshStep | NavigateStep | ToastStep | SetStep | ConfirmStep;

export interface ConditionalProps {
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  readOnlyIf?: Expression;
}

export interface ActionDefinition {
  id?: string;
  label: string;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  enabledIf?: Expression;
  onClick: Step[];
}

export interface FieldDefinition {
  name: string;
  type: 'text' | 'number' | 'select' | 'checkbox' | 'date';
  label?: string;
  required?: boolean;
  options?: string[];
  /** Il valore non compare mai in tracce e log. */
  sensitive?: boolean;
  visibleIf?: Expression;
  hiddenIf?: Expression;
  readOnlyIf?: Expression;
  validate?: { rule: Expression; message: string };
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger';
export type CellFormat = 'text' | 'currency' | 'percent' | 'date' | 'datetime' | 'boolean' | 'badge';

/** Colonna di una tabella o campo di una scheda di dettaglio. */
export interface ColumnDefinition {
  field: string;
  label?: string;
  format?: CellFormat;
  /** Codice ISO 4217 per `currency` (EUR se assente). */
  currency?: string;
  /** Per `badge`: tono per ogni valore. */
  badges?: Record<string, Tone>;
  visibleIf?: Expression;
  hiddenIf?: Expression;
}

interface NodeBase extends ConditionalProps {
  id?: string;
}

export interface SectionNode extends NodeBase {
  type: 'section';
  title?: string;
  components: NodeDefinition[];
}
export interface TextNode extends NodeBase {
  type: 'text';
  text: string;
  style?: 'heading' | 'body';
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
  columns: ColumnDefinition[];
  rowActions?: ActionDefinition[];
}
export interface FormNode extends NodeBase {
  type: 'form';
  /** Data source dei valori iniziali; assente nei form di inserimento. */
  source?: string;
  /** Valori iniziali con espressioni, risolti una sola volta all'apertura. */
  initial?: Record<string, unknown>;
  fields: FieldDefinition[];
  actions?: ActionDefinition[];
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
  /** Data source che restituisce un solo record. */
  source: string;
  fields: ColumnDefinition[];
}
export interface AlertNode extends NodeBase {
  type: 'alert';
  text: string;
  kind?: 'info' | 'success' | 'error';
}

export type NodeDefinition = SectionNode | TextNode | ButtonNode | FilterBarNode | TableNode | FormNode | TabsNode | DetailNode | AlertNode;
export type NodeType = NodeDefinition['type'];

export interface ScreenDefinition {
  schemaVersion: string;
  screen: string;
  title?: string;
  requires?: string;
  dataSources?: Record<string, DataSourceDefinition>;
  components: NodeDefinition[];
}

/** Tema: design token applicati dal runtime come variabili CSS. Allineato a schemas/theme.schema.json. */
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
}

export interface ThemeTokens {
  colors: ThemeColors;
  typography?: { fontFamily?: string; baseSize?: number };
  shape?: { radius?: number };
  density?: 'compact' | 'comfortable';
}

export interface ThemeDefinition {
  schemaVersion: string;
  theme: string;
  label?: string;
  mode?: 'light' | 'dark';
  tokens: ThemeTokens;
}

/** Navigazione: casi d'uso con un menu a tre livelli. Allineata a schemas/navigation.schema.json. */
export interface NavigationBase {
  id: string;
  label: string;
  icon?: string;
  /** Permesso necessario per vedere la voce. */
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

/** Gruppo a un livello qualsiasi: il runtime attraversa l'albero senza distinguere i livelli (li limita lo schema). */
export interface NavigationGroup extends NavigationBase {
  children: NavigationItem[];
}

export type NavigationItem = NavigationLeaf | NavigationGroup;

export interface NavigationUseCase {
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
  useCases: NavigationUseCase[];
}

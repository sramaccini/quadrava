/** Tipi del nucleo del linguaggio, allineati a schemas/screen.schema.json. */

/** Espressione CEL tra doppie graffe, per esempio `{{can('ordini.approva')}}`. */
export type Expression = string;

export interface DataSourceDefinition {
  type: 'rest';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  params?: Record<string, unknown>;
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
export type Step = CallStep | RefreshStep | NavigateStep | ToastStep | SetStep;

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

export interface ColumnDefinition {
  field: string;
  label?: string;
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
  source: string;
  fields: FieldDefinition[];
  actions?: ActionDefinition[];
}

export type NodeDefinition = SectionNode | TextNode | ButtonNode | FilterBarNode | TableNode | FormNode;
export type NodeType = NodeDefinition['type'];

export interface ScreenDefinition {
  schemaVersion: string;
  screen: string;
  title?: string;
  requires?: string;
  dataSources?: Record<string, DataSourceDefinition>;
  components: NodeDefinition[];
}

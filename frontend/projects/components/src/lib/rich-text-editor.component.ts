import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, safeHref } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { IconComponent } from './icon.component';
import { domToMarkdown, renderMarkdownInto } from './rich-text-dom';

/** Toolbar commands: name, icon, browser command and its argument. */
interface Tool {
  id: 'bold' | 'italic' | 'strike' | 'heading' | 'bullets' | 'numbers' | 'quote' | 'code' | 'link' | 'clear';
  icon: string;
  command?: string;
  argument?: string;
  /** State to read for aria-pressed (queryCommandState). */
  state?: string;
}

const TOOLS: Tool[] = [
  { id: 'bold', icon: 'bold', command: 'bold', state: 'bold' },
  { id: 'italic', icon: 'italic', command: 'italic', state: 'italic' },
  { id: 'strike', icon: 'strike', command: 'strikeThrough', state: 'strikeThrough' },
  { id: 'heading', icon: 'heading' },
  { id: 'bullets', icon: 'bullets', command: 'insertUnorderedList', state: 'insertUnorderedList' },
  { id: 'numbers', icon: 'numbers', command: 'insertOrderedList', state: 'insertOrderedList' },
  { id: 'quote', icon: 'quote' },
  { id: 'link', icon: 'link' },
  { id: 'clear', icon: 'clear' },
];

/**
 * Formatted-text editor for `richtext` fields. The value is restricted Markdown (`core/markdown.ts`): never HTML.
 * The editable area is filled by building the elements (`renderMarkdownInto`) and read back accepting only the allowed
 * tags (`domToMarkdown`); what is pasted goes in as plain text. Toolbar with bold, italic, strikethrough,
 * heading, bulleted and numbered lists, quote, link (only https, mailto or relative paths) and «remove
 * formatting»; Ctrl+B and Ctrl+I work as in text editors.
 *
 * The value is emitted at every change (\`commitOn: input\`) or when leaving the editor (\`change\`).
 */
@Component({
  selector: 'lc-rich-text-editor',
  imports: [FormsModule, IconComponent, NzButtonModule, NzInputModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .box { border: 1px solid var(--lc-color-border, #d0d7de); border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff); }
    .box:focus-within { border-color: var(--lc-color-primary, #1f5fbf); box-shadow: 0 0 0 2px color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 20%, transparent); }
    .box.invalid { border-color: var(--lc-color-danger, #c62828); }
    .box.disabled { background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 8%, transparent); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; border-bottom: 1px solid var(--lc-color-border, #d0d7de); }
    .toolbar button[aria-pressed='true'] { background: color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 15%, transparent); color: var(--lc-color-primary, #1f5fbf); }
    .link { display: flex; gap: 4px; align-items: center; padding: 4px; border-bottom: 1px solid var(--lc-color-border, #d0d7de); }
    .link input { flex: 1; }
    .link .error { color: var(--lc-color-danger, #c62828); font-size: 12px; }
    .area { min-height: var(--lc-rich-min-height, 7em); max-height: 32em; overflow: auto; padding: 6px 11px; outline: none; line-height: 1.55; overflow-wrap: anywhere; }
    .area p, .area ul, .area ol, .area blockquote, .area h3, .area h4, .area h5 { margin: 0 0 0.5em; }
    .area h3 { font-size: 1.2em; font-weight: 600; }
    .area h4 { font-size: 1.08em; font-weight: 600; }
    .area h5 { font-size: 1em; font-weight: 600; }
    .area ul, .area ol { padding-left: 1.5em; }
    .area blockquote { padding-left: 0.9em; border-left: 3px solid var(--lc-color-border, #d0d7de); color: var(--lc-color-muted, #5d6b7a); }
    .area code { padding: 0 0.3em; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 12%, transparent); }
    .area a { color: var(--lc-color-primary, #1f5fbf); }
    .area:empty::before, .area.blank::before { content: attr(data-placeholder); color: var(--lc-color-muted, #5d6b7a); pointer-events: none; }
  `,
  template: `
    <div class="box" [class.invalid]="invalid()" [class.disabled]="disabled()">
      @if (!disabled()) {
        <div class="toolbar" role="toolbar" [attr.aria-label]="i18n.t('lc.rich.toolbar')" [attr.aria-controls]="inputId()">
          @for (tool of tools; track tool.id) {
            <button
              nz-button
              nzType="text"
              nzSize="small"
              type="button"
              [attr.aria-label]="i18n.t('lc.rich.' + tool.id)"
              [attr.aria-pressed]="tool.state ? active().includes(tool.id) : null"
              [nz-tooltip]="i18n.t('lc.rich.' + tool.id)"
              (mousedown)="$event.preventDefault()"
              (click)="apply(tool)"
            >
              <lc-icon [name]="'rich-' + tool.icon" />
            </button>
          }
        </div>
        @if (linking()) {
          <div class="link">
            <input
              nz-input
              nzSize="small"
              [attr.aria-label]="i18n.t('lc.rich.linkAddress')"
              placeholder="https://"
              [ngModel]="linkHref()"
              (ngModelChange)="linkHref.set($event); linkError.set(false)"
              (keydown.enter)="$event.preventDefault(); confirmLink()"
              (keydown.escape)="linking.set(false)"
            />
            <button nz-button nzSize="small" type="button" (click)="confirmLink()">{{ i18n.t('lc.rich.linkApply') }}</button>
            @if (linkError()) {
              <span class="error" role="alert">{{ i18n.t('lc.rich.linkInvalid') }}</span>
            }
          </div>
        }
      }
      <div
        #area
        class="area"
        [id]="inputId()"
        role="textbox"
        aria-multiline="true"
        [attr.aria-labelledby]="labelId() || null"
        [attr.aria-invalid]="invalid()"
        [attr.aria-readonly]="disabled()"
        [attr.contenteditable]="disabled() ? 'false' : 'true'"
        [attr.data-placeholder]="placeholder()"
        [class.blank]="blank()"
        [style.--lc-rich-min-height]="rows() * 1.55 + 'em'"
        (input)="changed()"
        (blur)="committed()"
        (paste)="paste($event)"
        (keyup)="refreshState()"
        (mouseup)="refreshState()"
      ></div>
    </div>
  `,
})
export class RichTextEditorComponent {
  protected readonly i18n = inject(I18n);
  protected readonly tools = TOOLS;
  /** Value in restricted Markdown. */
  readonly value = input<string | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly inputId = input.required<string>();
  /** Id of the label that names the area. */
  readonly labelId = input<string>('');
  readonly placeholder = input('');
  /** Minimum height in lines. */
  readonly rows = input(5);
  readonly commitOn = input<'input' | 'change'>('input');
  readonly valueChange = output<string | null>();

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  /** Commands active at the cursor position (for aria-pressed). */
  protected readonly active = signal<string[]>([]);
  protected readonly blank = signal(true);
  protected readonly linking = signal(false);
  protected readonly linkHref = signal('');
  protected readonly linkError = signal(false);
  /** Selection saved when the link box opens (the focus moves to the address). */
  private savedRange: Range | null = null;
  /** Last value emitted or received: if the incoming value is the same, the area is not redrawn (the cursor stays). */
  private last: string | null | undefined;

  constructor() {
    effect(() => {
      const value = this.value() ?? '';
      const area = this.area().nativeElement;
      if (value === (this.last ?? null) || value === domToMarkdown(area)) {
        this.last = value;
        this.updateBlank();
        return;
      }
      this.last = value;
      renderMarkdownInto(area, value);
      this.updateBlank();
    });
    const onSelection = () => this.refreshState();
    document.addEventListener('selectionchange', onSelection);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('selectionchange', onSelection));
  }

  /** The current text in Markdown (empty = null). */
  private current(): string | null {
    const text = domToMarkdown(this.area().nativeElement).trim();
    return text ? text : null;
  }

  private emit(): void {
    const value = this.current();
    this.last = value ?? '';
    this.valueChange.emit(value);
  }

  protected changed(): void {
    this.updateBlank();
    if (this.commitOn() === 'input') this.emit();
  }

  protected committed(): void {
    if (this.commitOn() === 'change' && (this.current() ?? '') !== (this.value() ?? '')) this.emit();
  }

  /** Only text is pasted: no styles, scripts or tags from other pages. */
  protected paste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text) this.exec('insertText', text);
  }

  protected apply(tool: Tool): void {
    if (this.disabled()) return;
    this.area().nativeElement.focus();
    switch (tool.id) {
      case 'heading':
        this.exec('formatBlock', this.inside('h3, h4, h5') ? 'p' : 'h3');
        break;
      case 'quote':
        this.exec('formatBlock', this.inside('blockquote') ? 'p' : 'blockquote');
        break;
      case 'clear':
        this.exec('removeFormat');
        this.exec('formatBlock', 'p');
        break;
      case 'link': {
        const selection = document.getSelection();
        this.savedRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        this.linkHref.set(this.inside('a')?.getAttribute('href') ?? '');
        this.linkError.set(false);
        this.linking.set(true);
        return;
      }
      default:
        this.exec(tool.command!, tool.argument);
    }
    this.changed();
    this.refreshState();
  }

  /** Applies the link to the saved selection; an empty address removes the link. */
  protected confirmLink(): void {
    const raw = this.linkHref().trim();
    const href = raw ? safeHref(raw) : '';
    if (href === null) {
      this.linkError.set(true);
      return;
    }
    const area = this.area().nativeElement;
    area.focus();
    if (this.savedRange) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(this.savedRange);
    }
    if (href) {
      const selection = document.getSelection();
      if (selection && selection.rangeCount && selection.isCollapsed && area.contains(selection.anchorNode)) {
        // Without selected text the link has its address as text (built element, address already checked).
        const link = document.createElement('a');
        link.setAttribute('href', href);
        link.textContent = href;
        const range = selection.getRangeAt(0);
        range.insertNode(link);
        range.setStartAfter(link);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        this.exec('createLink', href);
      }
    } else {
      this.exec('unlink');
    }
    this.linking.set(false);
    this.changed();
  }

  /** The element (in the area) that contains the cursor and matches the selector. */
  private inside(selector: string): Element | null {
    const node = document.getSelection()?.anchorNode ?? null;
    const element = node instanceof Element ? node : node?.parentElement;
    const found = element?.closest(selector) ?? null;
    return found && this.area().nativeElement.contains(found) ? found : null;
  }

  private exec(command: string, argument?: string): void {
    // execCommand is the only way common to browsers to change an editable area keeping undo
    // (Ctrl+Z); the result is read back with domToMarkdown anyway, which accepts only the allowed format.
    document.execCommand?.(command, false, argument);
  }

  protected refreshState(): void {
    const area = this.area().nativeElement;
    const node = document.getSelection()?.anchorNode;
    if (!node || !area.contains(node)) return;
    const on = TOOLS.filter((t) => t.state && document.queryCommandState?.(t.state)).map((t) => t.id);
    if (on.join() !== this.active().join()) this.active.set(on);
  }

  private updateBlank(): void {
    this.blank.set(!(this.area().nativeElement.textContent ?? '').trim() && !this.area().nativeElement.querySelector('li'));
  }
}

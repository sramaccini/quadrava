import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseMarkdown } from 'core';

/**
 * Formatted text (restricted Markdown, see `core/markdown.ts`) drawn with templates: paragraphs, headings, bulleted
 * and numbered lists also nested, quotes, bold, italic, strikethrough, code, links. No HTML from the text:
 * every piece is a text node or an element written here. External links open in a new tab.
 * `inline`: for cells and narrow spaces, blocks become lines without margins.
 */
@Component({
  selector: 'lc-markdown',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; line-height: 1.55; overflow-wrap: anywhere; }
    p, ul, ol, blockquote, h3, h4, h5 { margin: 0 0 0.6em; }
    :host > :last-child, blockquote > :last-child, li > ul, li > ol { margin-bottom: 0; }
    h3 { font-size: 1.2em; font-weight: 600; }
    h4 { font-size: 1.08em; font-weight: 600; }
    h5 { font-size: 1em; font-weight: 600; }
    ul, ol { padding-left: 1.5em; }
    blockquote { padding: 0.1em 0 0.1em 0.9em; border-left: 3px solid var(--lc-color-border, #d0d7de); color: var(--lc-color-muted, #5d6b7a); }
    code { padding: 0 0.3em; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.92em;
      background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 12%, transparent); }
    a { color: var(--lc-color-primary, #1f5fbf); }
    :host(.inline) p, :host(.inline) ul, :host(.inline) ol, :host(.inline) blockquote, :host(.inline) h3, :host(.inline) h4, :host(.inline) h5 { margin: 0; }
  `,
  host: { '[class.inline]': 'inline()' },
  template: `
    <ng-template #inlines let-items>
      @for (x of items; track $index) {
        @switch (x.kind) {
          @case ('text') {<ng-container>{{ x.text }}</ng-container>}
          @case ('break') {<br />}
          @case ('strong') {<strong><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: x.children }" /></strong>}
          @case ('em') {<em><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: x.children }" /></em>}
          @case ('del') {<s><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: x.children }" /></s>}
          @case ('code') {<code>{{ x.text }}</code>}
          @case ('link') {
            @if (x.external) {
              <a [href]="x.href" target="_blank" rel="noopener noreferrer"><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: x.children }" /></a>
            } @else {
              <a [href]="x.href"><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: x.children }" /></a>
            }
          }
        }
      }
    </ng-template>
    <ng-template #blocks let-items>
      @for (b of items; track $index) {
        @switch (b.kind) {
          @case ('paragraph') {
            <p><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: b.content }" /></p>
          }
          @case ('heading') {
            @if (b.level === 1) {
              <h3><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: b.content }" /></h3>
            } @else if (b.level === 2) {
              <h4><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: b.content }" /></h4>
            } @else {
              <h5><ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: b.content }" /></h5>
            }
          }
          @case ('quote') {
            <blockquote><ng-container [ngTemplateOutlet]="blocks" [ngTemplateOutletContext]="{ $implicit: b.blocks }" /></blockquote>
          }
          @case ('list') {
            <ng-container [ngTemplateOutlet]="list" [ngTemplateOutletContext]="{ $implicit: b }" />
          }
        }
      }
    </ng-template>
    <ng-template #list let-l>
      @if (l.ordered) {
        <ol [attr.start]="l.start === 1 ? null : l.start">
          @for (item of l.items; track $index) {
            <li>
              <ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: item.content }" />
              @if (item.list) {
                <ng-container [ngTemplateOutlet]="list" [ngTemplateOutletContext]="{ $implicit: item.list }" />
              }
            </li>
          }
        </ol>
      } @else {
        <ul>
          @for (item of l.items; track $index) {
            <li>
              <ng-container [ngTemplateOutlet]="inlines" [ngTemplateOutletContext]="{ $implicit: item.content }" />
              @if (item.list) {
                <ng-container [ngTemplateOutlet]="list" [ngTemplateOutletContext]="{ $implicit: item.list }" />
              }
            </li>
          }
        </ul>
      }
    </ng-template>
    <ng-container [ngTemplateOutlet]="blocks" [ngTemplateOutletContext]="{ $implicit: parsed() }" />
  `,
})
export class MarkdownComponent {
  /** Text in restricted Markdown. */
  readonly source = input<string | null | undefined>('');
  readonly inline = input(false);
  protected readonly parsed = computed(() => parseMarkdown(this.source()));
}

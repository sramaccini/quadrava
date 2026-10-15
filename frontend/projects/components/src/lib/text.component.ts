import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { MarkdownComponent } from './markdown.component';
import type { TextNode } from 'schema';

@Component({
  selector: 'lc-text',
  imports: [NzTypographyModule, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Plain text also honours line breaks (they used to get lost).
  styles: `h2, p { margin: 0; } h2[nz-typography] { font-size: 18px; font-weight: 600; line-height: 1.4; } p.plain { white-space: pre-line; }`,
  template: `
    @if (node().format === 'markdown') {
      <!-- Formatted text: lists, bold, links… drawn without HTML (restricted Markdown). -->
      <lc-markdown [source]="runtime().text(node().text, scope())" />
    } @else if (node().style === 'heading') {
      <h2 nz-typography>{{ runtime().text(node().text, scope()) }}</h2>
    } @else {
      <p nz-typography class="plain">{{ runtime().text(node().text, scope()) }}</p>
    }
  `,
})
export class TextComponent {
  readonly node = input.required<TextNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
}

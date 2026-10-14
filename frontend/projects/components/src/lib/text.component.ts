import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import { MarkdownComponent } from './markdown.component';
import type { TextNode } from 'schema';

@Component({
  selector: 'lc-text',
  imports: [NzTypographyModule, MarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Anche il testo semplice rispetta gli a capo (prima si perdevano).
  styles: `h2, p { margin: 0; } h2[nz-typography] { font-size: 18px; font-weight: 600; line-height: 1.4; } p.plain { white-space: pre-line; }`,
  template: `
    @if (node().format === 'markdown') {
      <!-- Testo formattato: elenchi, grassetto, collegamenti… disegnati senza HTML (Markdown ristretto). -->
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

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import type { TextNode } from 'schema';

@Component({
  selector: 'lc-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `h2 { margin: 0; font-size: 1.25em; } p { margin: 0; }`,
  template: `
    @if (node().style === 'heading') {
      <h2>{{ runtime().text(node().text, scope()) }}</h2>
    } @else {
      <p>{{ runtime().text(node().text, scope()) }}</p>
    }
  `,
})
export class TextComponent {
  readonly node = input.required<TextNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
}

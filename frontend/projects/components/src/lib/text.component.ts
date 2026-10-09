import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import type { TextNode } from 'schema';

@Component({
  selector: 'lc-text',
  imports: [NzTypographyModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `h2, p { margin: 0; }`,
  template: `
    @if (node().style === 'heading') {
      <h2 nz-typography>{{ runtime().text(node().text, scope()) }}</h2>
    } @else {
      <p nz-typography>{{ runtime().text(node().text, scope()) }}</p>
    }
  `,
})
export class TextComponent {
  readonly node = input.required<TextNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
}

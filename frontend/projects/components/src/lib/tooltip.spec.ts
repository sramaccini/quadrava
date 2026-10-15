import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider } from 'core';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

describe('optional tooltip', () => {
  async function render(components: NodeDefinition[]): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: () => true } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'mario' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: () => undefined } },
        { provide: DataClient, useValue: { request: async () => ({}) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'test', components } satisfies ScreenDefinition);
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function overlayText(fixture: ComponentFixture<unknown>): Promise<string> {
    for (let i = 0; i < 40; i++) {
      fixture.detectChanges();
      const tip = document.querySelector('.ant-tooltip-inner');
      if (tip) return tip.textContent ?? '';
      await new Promise((r) => setTimeout(r, 25));
    }
    return '';
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((e) => (e.innerHTML = '')));

  it('shows the text with the expressions resolved, without interpreting HTML', async () => {
    const { fixture, el } = await render([
      { type: 'button', label: 'Save', tooltip: 'Hello {{user.username}} <b>x</b>', onClick: [] },
    ]);
    el.querySelector('.tip')!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(await overlayText(fixture)).toBe('Hello mario <b>x</b>');
    expect(document.querySelector('.ant-tooltip-inner b')).toBeNull();
  });

  it('without a tooltip it adds no wrappers', async () => {
    const { el } = await render([{ type: 'text', text: 'Hello' }]);
    expect(el.querySelector('.tip')).toBeNull();
  });

  it('a tooltip resolving to empty is not shown', async () => {
    const { el } = await render([{ type: 'text', text: 'Hello', tooltip: '{{ "" }}' }]);
    expect(el.querySelector('.tip')).toBeNull();
  });

  it('field labels show the help icon', async () => {
    const { el } = await render([
      { type: 'form', fields: [{ name: 'n', type: 'text', label: 'Name', tooltip: 'The name' }], actions: [] } as NodeDefinition,
    ]);
    expect(el.querySelector('nz-form-label [nz-icon], nz-form-label .anticon')).not.toBeNull();
  });
});

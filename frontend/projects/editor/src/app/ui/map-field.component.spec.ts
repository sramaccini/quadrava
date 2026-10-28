import { TestBed } from '@angular/core/testing';
import { provideLowcodeComponents } from 'components';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { PROJECT } from '../model/project-store';
import { MapFieldComponent } from './map-field.component';

describe('table of names and values (the settings of the project)', () => {
  it('the settings of the project are shown as a table, with the rule of the names of the schema', () => {
    const settings = PROJECT.rootProperties().find((p) => p.name === 'settings');
    expect(settings).toMatchObject({ kind: 'map', pattern: '^[A-Za-z][A-Za-z0-9_]*$' });
  });

  it('adds, renames (refusing invalid or repeated names), changes and removes; an empty table removes the property', async () => {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
    const fixture = TestBed.createComponent(MapFieldComponent);
    const changes: unknown[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => {
      changes.push(v);
      fixture.componentRef.setInput('value', v);
    });
    fixture.componentRef.setInput('namePattern', '^[A-Za-z][A-Za-z0-9_]*$');
    fixture.componentRef.setInput('value', { ordersApi: '/api/orders' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = () => [...el.querySelectorAll<HTMLInputElement>('tbody input')];

    (el.querySelector('button[nzType="dashed"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(changes.at(-1)).toEqual({ ordersApi: '/api/orders', name: '' });

    // A name that does not follow the rule, or that is already there, is not applied and is said.
    const name = inputs()[2];
    name.value = 'base-url';
    name.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Invalid or repeated name');
    expect(name.value).toBe('name');
    name.value = 'ordersApi';
    name.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(changes).toHaveLength(1);
    name.value = 'staffApi';
    name.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(changes.at(-1)).toEqual({ ordersApi: '/api/orders', staffApi: '' });

    const value = inputs()[3];
    value.value = '/api/staff';
    value.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(changes.at(-1)).toEqual({ ordersApi: '/api/orders', staffApi: '/api/staff' });

    for (const label of ['Delete ordersApi', 'Delete staffApi']) {
      (el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    expect(changes.at(-1)).toBeUndefined();
    expect(el.querySelector('.empty')?.textContent).toContain('No entries');
  });
});

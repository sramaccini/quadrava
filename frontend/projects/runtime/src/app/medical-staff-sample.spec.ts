import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ProjectSnapshot } from 'core';
import manifest from '../../../../../samples/medical-staff/project.json';
import navigation from '../../../../../samples/medical-staff/navigation.json';
import staffSources from '../../../../../samples/medical-staff/datasources/medical-staff.json';
import list from '../../../../../samples/medical-staff/screens/medical-staff-list.json';
import detail from '../../../../../samples/medical-staff/screens/medical-staff-detail.json';
import edit from '../../../../../samples/medical-staff/screens/medical-staff-edit.json';
import create from '../../../../../samples/medical-staff/screens/medical-staff-new.json';
import light from '../../../../../samples/medical-staff/themes/light.json';
import english from '../../../../../samples/medical-staff/i18n/en.json';
import italian from '../../../../../samples/medical-staff/i18n/it.json';
import { App } from './app';
import { appConfigFor } from './app.config';
import { DemoDiagnostics } from '../demo/demo-ports';
import { DEFAULT_RUNTIME_CONFIG } from './runtime-config';
import { studioSettings } from './studio';

/**
 * The medical-staff sample project in the demo runtime, as «Run project» of Studio gives it: its screens read the staff
 * service of the demo back end, through the base address taken from the settings of the project.
 */
describe('the medical-staff sample in the demo runtime', () => {
  const project: ProjectSnapshot = {
    manifest,
    navigation,
    screens: { 'medical-staff-list': list, 'medical-staff-detail': detail, 'medical-staff-edit': edit, 'medical-staff-new': create },
    dataSources: { 'medical-staff': staffSources },
    themes: { light },
    messages: { en: english, it: italian },
  };

  it('the list shows the staff, in pages, without diagnostics', { timeout: 20000 }, async () => {
    localStorage.setItem('lc.language', 'en');
    const settings = await studioSettings(project);
    expect(settings.settings).toEqual({ staffApi: '/api/medical-staff' });
    TestBed.configureTestingModule({ providers: appConfigFor(DEFAULT_RUNTIME_CONFIG, settings, project).providers });
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/staff-registry/medical-staff-list');
    for (let i = 0; i < 200 && el.querySelectorAll('main tbody tr:not(.ant-table-placeholder)').length === 0; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 20));
    }
    const rows = el.querySelectorAll('main tbody tr:not(.ant-table-placeholder)');
    expect(rows.length).toBe(8);
    expect(el.querySelector('main tbody td')?.textContent?.trim()).toMatch(/^HS\d{6}$/);
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });
});

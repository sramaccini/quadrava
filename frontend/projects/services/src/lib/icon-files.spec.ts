import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpIconFiles } from './icon-files';

describe('HttpIconFiles', () => {
  const svg = '<svg viewBox="0 0 1024 1024"><path d="M0 0h1024v1024H0z"></path></svg>';
  let files: HttpIconFiles;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    files = TestBed.inject(HttpIconFiles);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the SVG of an icon from the static files of the same origin', async () => {
    const answer = files.svg('fill', 'heart');
    http.expectOne('assets/fill/heart.svg').flush(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
    expect(await answer).toBe(svg);
  });

  it('refuses a page in place of the icon, a missing file and a failed connection', async () => {
    const page = files.svg('outline', 'team');
    http.expectOne('assets/outline/team.svg').flush('<!doctype html><title>app</title>', { headers: { 'Content-Type': 'text/html' } });
    expect(await page).toBeNull();
    const missing = files.svg('outline', 'trophy');
    http.expectOne('assets/outline/trophy.svg').flush('', { status: 404, statusText: 'Not Found' });
    expect(await missing).toBeNull();
    const offline = files.svg('outline', 'rocket');
    http.expectOne('assets/outline/rocket.svg').error(new ProgressEvent('error'));
    expect(await offline).toBeNull();
  });
});

import { previewAddress, previewFiles, previewKind } from './preview';

describe('files of the preview step', () => {
  it('accepts only paths of the same application', () => {
    expect(previewAddress('/api/files/1')).toBe('/api/files/1');
    expect(previewAddress('https://example.com/a.png')).toBeNull();
    expect(previewAddress('//example.com/a.png')).toBeNull();
    expect(previewAddress('/api/../admin')).toBeNull();
    expect(previewAddress('javascript:alert(1)')).toBeNull();
    expect(previewAddress(42)).toBeNull();
  });

  it('the type decides, then the extension', () => {
    expect(previewKind('image/png', 'x')).toBe('image');
    expect(previewKind('application/pdf', 'x.png')).toBe('pdf');
    expect(previewKind('application/zip', 'x.png')).toBeNull();
    expect(previewKind(undefined, 'Photo.JPG')).toBe('image');
    expect(previewKind(null, 'quote.pdf')).toBe('pdf');
    expect(previewKind('', 'notes.txt')).toBeNull();
  });

  it('keeps the rows that can be shown and starts from the one asked', () => {
    const rows = [
      { url: '/files/1', name: 'plan.png', type: 'image/png' },
      { url: '/files/2', name: 'data.zip', type: 'application/zip' },
      { url: 'https://elsewhere/x.pdf', name: 'x.pdf' },
      { url: '/files/3', name: 'quote.pdf' },
      { url: '/files/4/scan.jpg' },
    ];
    const { files, start } = previewFiles(rows, {}, '/files/3');
    expect(files).toEqual([
      { url: '/files/1', name: 'plan.png', kind: 'image' },
      { url: '/files/3', name: 'quote.pdf', kind: 'pdf' },
      { url: '/files/4/scan.jpg', name: 'scan.jpg', kind: 'image' },
    ]);
    expect(start).toBe(1);
    expect(previewFiles(rows, {}, '/files/2').start).toBe(0);
    expect(previewFiles([{ link: '/a', file: 'A.png' }], { urlField: 'link', nameField: 'file', typeField: 'mime' }).files).toEqual([{ url: '/a', name: 'A.png', kind: 'image' }]);
  });
});

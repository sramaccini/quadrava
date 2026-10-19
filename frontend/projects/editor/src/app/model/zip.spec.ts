import { crc32, createZip, readZip } from './zip';

describe('zip archives', () => {
  it('computes the CRC-32 of the zip format', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes the files and reads them back, with UTF-8 names and texts', async () => {
    const files = [
      { path: 'project.json', text: '{"name":"Café"}\n' },
      { path: 'screens/order-list.json', text: JSON.stringify({ screen: 'order-list', title: 'Ordini — elenco' }) },
      { path: 'i18n/it.json', text: '{}' },
    ];
    const zip = await createZip(files, new Date(2026, 9, 19, 10, 30, 0));
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await readZip(await zip.arrayBuffer())).toEqual(files);
  });

  it('reads a stored archive with a folder entry and a comment, as other tools write them', async () => {
    const zip = new Uint8Array(await (await createZip([{ path: 'my-app/project.json', text: '{}' }])).arrayBuffer());
    // The same archive with a trailing comment: the end record is found before it.
    const comment = new TextEncoder().encode('made elsewhere');
    const withComment = new Uint8Array(zip.length + comment.length);
    withComment.set(zip);
    withComment.set(comment, zip.length);
    new DataView(withComment.buffer).setUint16(zip.length - 2, comment.length, true);
    expect(await readZip(withComment.buffer)).toEqual([{ path: 'my-app/project.json', text: '{}' }]);
  });

  it('refuses what is not a zip archive', async () => {
    await expect(readZip(new TextEncoder().encode('not a zip at all, just text').buffer as ArrayBuffer)).rejects.toThrow('not a zip archive');
  });
});

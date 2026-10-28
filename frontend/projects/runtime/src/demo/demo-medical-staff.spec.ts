import type { DataRequest } from 'core';
import { DemoBackend } from './demo-backend';

describe('staff service of the medical-staff sample, in the demo back end', () => {
  const call = (backend: DemoBackend, method: DataRequest['method'], url: string, extra: Partial<DataRequest> = {}) => backend.handle({ method, url, ...extra });
  type Page = { items: { id: number; staffType: string; registrationNumber: string; lastName: string }[]; total: number; size: number };

  it('list in pages with the filters of the screen; without page all the rows (CSV export)', async () => {
    const backend = new DemoBackend();
    const first = (await call(backend, 'GET', '/api/medical-staff', { query: { page: 0 } })) as Page;
    expect(first.total).toBe(26);
    expect(first.items).toHaveLength(DemoBackend.PAGE_SIZE);
    const doctors = (await call(backend, 'GET', '/api/medical-staff', { query: { page: 0, staffType: 'doctor', active: 'true' } })) as Page;
    expect(doctors.items.every((s) => s.staffType === 'doctor')).toBe(true);
    const all = (await call(backend, 'GET', '/api/medical-staff')) as unknown[];
    expect(all).toHaveLength(26);
    const found = (await call(backend, 'GET', '/api/medical-staff', { query: { page: 0, q: 'hs001001' } })) as Page;
    expect(found.items.map((s) => s.registrationNumber)).toEqual(['HS001001']);
  });

  it('create, read, update (the staff number stays), delete; 409 for a staff number used, 400 without the required fields, 404', async () => {
    const backend = new DemoBackend();
    const member = { registrationNumber: 'HS999999', staffType: 'nurse', firstName: 'Ada', lastName: 'Verdi', department: 'surgery', contract: 'permanent', hireDate: '2026-10-01' };
    const created = (await call(backend, 'POST', '/api/medical-staff', { body: member })) as { id: number };
    expect(created).toMatchObject({ ...member, id: 27, active: true });
    await expect(call(backend, 'POST', '/api/medical-staff', { body: member })).rejects.toThrow('409');
    await expect(call(backend, 'POST', '/api/medical-staff', { body: { firstName: 'X' } })).rejects.toThrow('400');
    const updated = await call(backend, 'PUT', `/api/medical-staff/${created.id}`, { body: { ...member, registrationNumber: 'HS000000', department: 'pharmacy' } });
    expect(updated).toMatchObject({ registrationNumber: 'HS999999', department: 'pharmacy' });
    expect(await call(backend, 'GET', `/api/medical-staff/${created.id}`)).toMatchObject({ department: 'pharmacy' });
    await call(backend, 'DELETE', `/api/medical-staff/${created.id}`);
    await expect(call(backend, 'GET', `/api/medical-staff/${created.id}`)).rejects.toThrow('404');
  });
});

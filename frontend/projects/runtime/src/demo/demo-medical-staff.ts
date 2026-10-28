import type { DataRequest } from 'core';

/** A member of the staff of the hospital, as `samples/medical-staff` describes it. */
export interface StaffMember {
  id: number;
  registrationNumber: string;
  staffType: string;
  firstName: string;
  lastName: string;
  specialty?: string;
  licenseNumber?: string;
  department: string;
  contract: string;
  hireDate: string;
  contractEnd?: string;
  shift: string;
  weeklyHours: number;
  email: string;
  phone: string;
  active: boolean;
  notes?: string;
}

const TYPES = ['doctor', 'nurse', 'nurse', 'midwife', 'technician', 'therapist', 'pharmacist', 'assistant'];
const DEPARTMENTS = ['emergency', 'cardiology', 'surgery', 'pediatrics', 'radiology', 'internal-medicine', 'obstetrics', 'pharmacy'];
const SPECIALTIES = ['Emergency medicine', 'Cardiology', 'General surgery', 'Paediatrics', 'Radiology', 'Internal medicine'];
const FIRST = ['Anna', 'Marco', 'Giulia', 'Luca', 'Sara', 'Paolo', 'Elena', 'Davide', 'Chiara', 'Matteo', 'Laura', 'Andrea'];
const LAST = ['Rossi', 'Bianchi', 'Ferrari', 'Russo', 'Romano', 'Gallo', 'Costa', 'Fontana', 'Conti', 'Ricci', 'Marino', 'Greco'];
/** Types of staff with a professional register number. */
const LICENSED = ['doctor', 'nurse', 'midwife', 'pharmacist'];
/** Fields a client may write; `id` is the service's. */
const WRITABLE: (keyof StaffMember)[] = [
  'registrationNumber', 'staffType', 'firstName', 'lastName', 'specialty', 'licenseNumber', 'department', 'contract', 'hireDate',
  'contractEnd', 'shift', 'weeklyHours', 'email', 'phone', 'active', 'notes',
];

/**
 * The staff service of `samples/medical-staff`, in memory, for the demo: list with filters and pages, the whole list for
 * the CSV, read, create, update, delete under `/api/medical-staff`. A staff number already used gets 409, a member that
 * does not exist 404, a request without the required fields 400.
 */
export class MedicalStaffRegister {
  private readonly staff: StaffMember[] = Array.from({ length: 26 }, (_, i) => {
    const staffType = TYPES[i % TYPES.length];
    const contract = (['permanent', 'permanent', 'fixed-term', 'consultant'] as const)[i % 4];
    const firstName = FIRST[i % FIRST.length];
    const lastName = LAST[(i * 5) % LAST.length];
    return {
      id: i + 1,
      registrationNumber: `HS${String(1001 + i).padStart(6, '0')}`,
      staffType,
      firstName,
      lastName,
      ...(staffType === 'doctor' ? { specialty: SPECIALTIES[i % SPECIALTIES.length] } : {}),
      ...(LICENSED.includes(staffType) ? { licenseNumber: `REG-${String(52000 + i * 7)}` } : {}),
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      contract,
      hireDate: `20${String(10 + (i % 15)).padStart(2, '0')}-${String(1 + (i % 12)).padStart(2, '0')}-01`,
      ...(contract === 'fixed-term' ? { contractEnd: '2027-06-30' } : {}),
      shift: (['day', 'rotating', 'night', 'on-call'] as const)[i % 4],
      weeklyHours: contract === 'consultant' ? 18 : 36,
      email: `${firstName}.${lastName}${i + 1}@hospital.example`.toLowerCase(),
      phone: `+39 02 5550 ${String(100 + i)}`,
      active: i % 9 !== 8,
    };
  });

  constructor(private readonly pageSize: number) {}

  /** The answer for a request under `/api/medical-staff`, or undefined when the path is not this service's. */
  handle(req: DataRequest, path: string): unknown {
    if (path === '/api/medical-staff') {
      if (req.method === 'GET') return req.query?.['page'] === undefined ? this.filtered(req.query).map((s) => ({ ...s })) : this.page(req.query);
      if (req.method === 'POST') return this.create(req.body ?? {});
      return undefined;
    }
    const one = /^\/api\/medical-staff\/(\d+)$/.exec(path);
    if (!one) return undefined;
    const index = this.staff.findIndex((s) => s.id === Number(one[1]));
    if (index < 0) throw new Error('404');
    if (req.method === 'GET') return { ...this.staff[index] };
    if (req.method === 'PUT') return this.update(index, req.body ?? {});
    if (req.method === 'DELETE') {
      this.staff.splice(index, 1);
      return {};
    }
    return undefined;
  }

  /** Filters of the list: free text on name and staff number, type, department, in service. */
  private filtered(query: DataRequest['query']): StaffMember[] {
    const q = String(query?.['q'] ?? '').trim().toLowerCase();
    const type = query?.['staffType'];
    const department = query?.['department'];
    const active = query?.['active'];
    return this.staff
      .filter((s) => !q || `${s.firstName} ${s.lastName} ${s.registrationNumber}`.toLowerCase().includes(q))
      .filter((s) => !type || s.staffType === type)
      .filter((s) => !department || s.department === department)
      .filter((s) => active === undefined || active === '' || String(s.active) === String(active))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'en') || a.firstName.localeCompare(b.firstName, 'en'));
  }

  private page(query: DataRequest['query']): { items: StaffMember[]; total: number; size: number } {
    const rows = this.filtered(query);
    const page = Number(query?.['page'] ?? 0);
    return { items: rows.slice(page * this.pageSize, (page + 1) * this.pageSize).map((s) => ({ ...s })), total: rows.length, size: this.pageSize };
  }

  private create(body: Record<string, unknown>): StaffMember {
    const member = this.check(body, null);
    const created = { ...member, id: Math.max(0, ...this.staff.map((s) => s.id)) + 1 } as StaffMember;
    this.staff.push(created);
    return { ...created };
  }

  private update(index: number, body: Record<string, unknown>): StaffMember {
    const current = this.staff[index];
    // The staff number cannot change (the edit form shows it read-only): the stored one stays.
    const member = this.check({ ...body, registrationNumber: current.registrationNumber }, current.id);
    this.staff[index] = { ...member, id: current.id } as StaffMember;
    return { ...this.staff[index] };
  }

  /** The writable fields of a request, checked: 400 without the required ones, 409 with a staff number already used. */
  private check(body: Record<string, unknown>, id: number | null): Omit<StaffMember, 'id'> {
    const member = Object.fromEntries(WRITABLE.filter((k) => body[k] !== undefined && body[k] !== null && body[k] !== '').map((k) => [k, body[k]]));
    for (const required of ['registrationNumber', 'staffType', 'firstName', 'lastName', 'department', 'contract', 'hireDate']) {
      if (typeof member[required] !== 'string') throw new Error('400');
    }
    if (this.staff.some((s) => s.registrationNumber === member['registrationNumber'] && s.id !== id)) throw new Error('409');
    return { shift: 'day', weeklyHours: 36, email: '', phone: '', active: true, ...member } as Omit<StaffMember, 'id'>;
  }
}

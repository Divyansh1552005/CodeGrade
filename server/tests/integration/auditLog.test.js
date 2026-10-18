import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import AuditLog from '../../models/AuditLog.js';
import { audit, auditCoalesced } from '../../services/audit.js';
import { createUser } from '../helpers/users.js';

const req = (ip = '10.0.0.1') => ({ ip, get: () => 'Jest Agent/1.0' });

describe('audit log', () => {
  it('stores who, what, to whom, before and after, with an email snapshot, ip and agent', async () => {
    const admin = await createUser({ role: 'admin' });
    const teacher = await createUser({ role: 'teacher' });
    await audit({ action: 'role.changed', actor: admin.user, target: teacher.user, before: { role: 'teacher' }, after: { role: 'student' }, req: req() });
    const row = await AuditLog.findOne({ action: 'role.changed' }).lean();
    expect(row).toMatchObject({ actorEmail: admin.email, targetEmail: teacher.email, before: { role: 'teacher' }, after: { role: 'student' }, ip: '10.0.0.1', userAgent: 'Jest Agent/1.0', count: 1 });
    expect(String(row.actorId)).toBe(String(admin.user._id));
  });
  it('never keeps anything that looks like a secret', async () => {
    await audit({ action: 'role.changed', before: { role: 'student', password: 'hunter2', token: 'abc' }, after: { role: 'teacher', passwordHash: 'x', totpCode: '123456' } });
    const row = await AuditLog.findOne().lean();
    expect(JSON.stringify(row)).not.toMatch(/hunter2|abc|123456|passwordHash/);
    expect(row.before).toEqual({ role: 'student' });
  });
  it('rejects an action it does not know', async () => {
    await expect(audit({ action: 'made.up' })).rejects.toThrow();
  });
  it('cannot be updated, replaced or deleted through the model', async () => {
    const row = await audit({ action: 'user.suspended' });
    await expect(AuditLog.updateOne({ _id: row._id }, { $set: { action: 'user.unsuspended' } })).rejects.toThrow(/append-only/);
    await expect(AuditLog.updateMany({}, { $set: { ip: 'x' } })).rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndUpdate({ _id: row._id }, { ip: 'x' })).rejects.toThrow(/append-only/);
    await expect(AuditLog.replaceOne({ _id: row._id }, { action: 'user.suspended' })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteOne({ _id: row._id })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(AuditLog.findOneAndDelete({ _id: row._id })).rejects.toThrow(/append-only/);
    const loaded = await AuditLog.findById(row._id);
    loaded.ip = 'changed';
    await expect(loaded.save()).rejects.toThrow(/append-only/);
    await expect(loaded.deleteOne()).rejects.toThrow(/append-only/);
    expect(await AuditLog.countDocuments()).toBe(1);
  });
  it('has no service function that edits or removes a row', () => {
    const source = fs.readFileSync(path.resolve(new URL('../../services/audit.js', import.meta.url).pathname), 'utf8');
    expect(source).not.toMatch(/deleteOne|deleteMany|findOneAndDelete|findOneAndUpdate|replaceOne|\.save\(/);
  });
  it('shares one row between repeated failures from one IP in the same minute and counts them', async () => {
    for (let i = 0; i < 5; i += 1) await auditCoalesced({ action: 'admin.login_failed', req: req('10.0.0.9') });
    await auditCoalesced({ action: 'admin.login_failed', req: req('10.0.0.10') });
    const rows = await AuditLog.find({ action: 'admin.login_failed' }).sort({ ip: 1 }).lean();
    expect(rows.map((r) => [r.ip, r.count])).toEqual([['10.0.0.10', 1], ['10.0.0.9', 5]]);
  });
  it('does not change the rest of a coalesced row when the counter goes up', async () => {
    await auditCoalesced({ action: 'admin.login_failed', req: req('10.0.0.5'), detail: 'wrong password' });
    const first = await AuditLog.findOne().lean();
    await auditCoalesced({ action: 'admin.login_failed', req: req('10.0.0.5'), detail: 'something else' });
    const second = await AuditLog.findOne().lean();
    expect([second.detail, second.ip, second.count]).toEqual([first.detail, first.ip, 2]);
  });
});

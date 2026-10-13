import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';

const { createAccount, approveAccount, rejectAccount, suspendAccount } = await import('../src/services/adminService.js');
const { loginUser, changePassword } = await import('../src/services/authService.js');
const prisma = (await import('../src/config/database.js')).default;

const stamp = Date.now();
const email = `planwise.approval.${stamp}@example.com`;

test.after(async () => {
  await prisma.user.deleteMany({ where: { email } }).catch(() => {});
  await prisma.$disconnect();
});

test('admin approval controls who can log in', async (t) => {
  await t.test('a pending account cannot log in', async () => {
    const created = await createAccount({
      fullName: 'Pending Lecturer',
      email,
      role: 'Lecturer',
      institution: 'University of Zambia (UNZA)',
      department: 'Science',
    });
    assert.equal(created.accountStatus, 'pending');
    await assert.rejects(
      () => loginUser({ email, password: 'NotThePassword1' }),
      (error) => error.status === 401 && /incorrect username or password/i.test(error.message),
    );
  });

  await t.test('approval returns a temporary password and blocks the dashboard password', async () => {
    const { user, temporaryPassword } = await approveAccount((await prisma.user.findUnique({ where: { email } })).id);
    assert.equal(user.accountStatus, 'approved');
    assert.equal(user.mustChangePassword, true);
    assert.match(temporaryPassword, /^Pw/);
    const session = await loginUser({ email, password: temporaryPassword });
    assert.equal(session.user.mustChangePassword, true);
    const updated = await changePassword(session.user.id, {
      currentPassword: temporaryPassword,
      password: 'PlanwiseApproved1',
    });
    assert.equal(updated.mustChangePassword, false);
    const next = await loginUser({ email, password: 'PlanwiseApproved1' });
    assert.equal(next.user.email, email);
  });

  await t.test('rejected and suspended accounts are denied with a specific message', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    await rejectAccount(user.id);
    await assert.rejects(
      () => loginUser({ email, password: 'PlanwiseApproved1' }),
      (error) => error.status === 403 && /not approved/i.test(error.message),
    );
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'approved' } });
    await suspendAccount(user.id);
    await assert.rejects(
      () => loginUser({ email, password: 'PlanwiseApproved1' }),
      (error) => error.status === 403 && /suspended/i.test(error.message),
    );
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'inactive' } });
    await assert.rejects(
      () => loginUser({ email, password: 'PlanwiseApproved1' }),
      (error) => error.status === 403 && /inactive/i.test(error.message),
    );
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = 'test-key';
process.env.NEXUS_BASE_URL = 'https://nexuszm.com/api/v1';
process.env.NEXUS_LOGIN_TEMPLATE = 'user_created';

const { createAccount, approveAccount, rejectAccount, suspendAccount } = await import('../src/services/adminService.js');
const { loginUser, changePassword } = await import('../src/services/authService.js');
const { takeCapturedNotifications } = await import('../src/services/nexusService.js');
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
      (error) => error.status === 401 && /incorrect email or password/i.test(error.message),
    );
  });

  await t.test('approval emails a temporary password and blocks the dashboard password', async () => {
    takeCapturedNotifications();
    const approved = await approveAccount((await prisma.user.findUnique({ where: { email } })).id);
    assert.equal(approved.accountStatus, 'approved');
    assert.equal(approved.mustChangePassword, true);
    const [sent] = takeCapturedNotifications();
    assert.equal(sent.template, 'user_created');
    assert.equal(sent.to, email);
    assert.equal(sent.data.user_name, 'Pending Lecturer');
    assert.equal(Object.hasOwn(sent.data, 'otp_code'), false);
    assert.match(sent.data.password, /^Pw/);
    const session = await loginUser({ email, password: sent.data.password });
    assert.equal(session.user.mustChangePassword, true);
    const updated = await changePassword(session.user.id, {
      currentPassword: sent.data.password,
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

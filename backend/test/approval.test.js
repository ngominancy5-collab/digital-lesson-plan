import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.NEXUS_CAPTURE = 'true';
process.env.NEXUS_API_KEY = process.env.NEXUS_API_KEY || 'test-key';
process.env.NEXUS_BASE_URL = process.env.NEXUS_BASE_URL || 'https://nexuszm.com/api/v1';

const { createAccount, approveAccount, rejectAccount, suspendAccount, resendCredentialEmail } = await import('../src/services/adminService.js');
const { loginUser, changePassword, confirmAssignedRole, maybeSendAccountCreatedConfirmation } = await import('../src/services/authService.js');
const { takeCapturedNotifications, loginTemplateName, accountCreatedTemplateName } = await import('../src/services/nexusService.js');
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

  await t.test('approval requires institution details and emails a temporary password', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    await assert.rejects(
      () => approveAccount(user.id, {
        role: 'lecturer',
        institution: 'University of Zambia (UNZA)',
        department: '',
      }, 'admin-actor'),
      (error) => /department/i.test(error.message),
    );

    takeCapturedNotifications();
    const approved = await approveAccount(
      user.id,
      { role: 'lecturer', institution: 'University of Zambia (UNZA)', department: 'Science' },
      'admin-actor',
    );
    assert.equal(approved.accountStatus, 'approved');
    assert.equal(approved.mustChangePassword, true);
    assert.equal(approved.credentialEmailStatus, 'accepted');
    const [sent] = takeCapturedNotifications();
    assert.equal(sent.template, loginTemplateName());
    assert.equal(sent.to, email);
    assert.equal(sent.data.user_name, 'Pending Lecturer');
    assert.match(String(sent.data.login_url || ''), /\/login$/);
    assert.match(sent.data.password, /^Pw/);

    const temporaryPassword = sent.data.password;
    const session = await loginUser({ email, password: temporaryPassword });
    assert.equal(session.user.mustChangePassword, true);

    takeCapturedNotifications();
    const updated = await changePassword(session.user.id, {
      currentPassword: temporaryPassword,
      password: 'PlanwiseApproved1',
    });
    assert.equal(updated.mustChangePassword, false);
    assert.equal(takeCapturedNotifications().some((row) => row.template === accountCreatedTemplateName()), false);

    takeCapturedNotifications();
    await confirmAssignedRole(session.user.id);
    const confirmationMails = takeCapturedNotifications().filter((row) => row.template === accountCreatedTemplateName());
    assert.equal(confirmationMails.length, 1);
    assert.equal(confirmationMails[0].to, email);
    assert.match(String(confirmationMails[0].data.user_name || ''), /Pending Lecturer|Pending/);

    const again = await maybeSendAccountCreatedConfirmation(session.user.id);
    assert.equal(again.sent, false);
    assert.equal(again.reason, 'already_sent');

    const next = await loginUser({ email, password: 'PlanwiseApproved1' });
    assert.equal(next.user.email, email);
  });

  await t.test('resend credentials issues a new temporary password', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    takeCapturedNotifications();
    await resendCredentialEmail(user.id, 'admin-actor');
    const [sent] = takeCapturedNotifications();
    assert.equal(sent.template, loginTemplateName());
    assert.match(sent.data.password, /^Pw/);
    const session = await loginUser({ email, password: sent.data.password });
    assert.equal(session.user.mustChangePassword, true);
    await changePassword(session.user.id, { password: 'PlanwiseApproved1' });
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

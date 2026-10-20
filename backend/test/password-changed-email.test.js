import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordChangedMail, passwordChangedTemplateData, passwordChangedTemplateName } from '../src/services/nexusService.js';

test('the password-change notice names the user and never includes a password', () => {
  const mail = passwordChangedMail('Liah Phiri');
  const data = passwordChangedTemplateData('Liah Phiri');
  assert.equal(passwordChangedTemplateName(), 'password_changed');
  assert.equal(mail.subject, 'Your Password Has Been Changed');
  assert.match(mail.text, /Hello Liah Phiri,/);
  assert.match(mail.text, /password for your account has been successfully changed/);
  assert.match(mail.text, /this email does not contain your password/i);
  assert.match(mail.text, /HRMS Administration/);
  assert.doesNotMatch(mail.text, /temporary password/i);
  assert.doesNotMatch(mail.html, /Pw[A-Za-z0-9]+9a/);
  assert.equal(Object.hasOwn(data, 'password'), false);
  assert.equal(data.user_name, 'Liah Phiri');
  assert.deepEqual(Object.keys(data), ['user_name']);
});

import { useEffect, useMemo, useState } from 'react';
import { adminApi, institutionApi } from '../services/api.js';
import Notice from './Notice.jsx';
import './admin-panel.css';

function formatWhen(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AssignRoleDialog({ user, onClose, onApproved }) {
  const initialRole = String(user?.requestedRoleKey || '').toLowerCase() === 'teacher'
    ? 'teacher'
    : String(user?.requestedRoleKey || '').toLowerCase() === 'lecturer'
      ? 'lecturer'
      : '';
  const [role, setRole] = useState(initialRole);
  const [institution, setInstitution] = useState(user?.institution || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [institutions, setInstitutions] = useState({ universities: [], schools: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    institutionApi.list()
      .then((places) => setInstitutions({
        universities: places.universities || [],
        schools: places.schools || [],
      }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setRole(initialRole);
    setInstitution(user?.institution || '');
    setDepartment(user?.department || '');
    setError('');
    setLoading(false);
  }, [user?.id, initialRole, user?.institution, user?.department]);

  const options = useMemo(
    () => (role === 'teacher' ? institutions.schools : institutions.universities),
    [role, institutions],
  );

  if (!user) return null;

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    if (!role) {
      setError('Select Teacher or Lecturer.');
      return;
    }
    if (!institution) {
      setError(role === 'teacher' ? 'Select a school.' : 'Select a university.');
      return;
    }
    if (!department.trim()) {
      setError('Enter a department.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.approve(user.id, {
        role,
        institution,
        department: department.trim(),
      });
      onApproved?.({
        credentialsQueued: result?.credentialsQueued !== false,
        credentialsSent: result?.credentialsSent,
        message: result?.message || 'Account approved. Login email is being sent now.',
        user: result?.user,
      });
    } catch (err) {
      setError(err.message || 'Could not approve this account. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <form className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-role-title" onSubmit={submit}>
        <h2 id="assign-role-title">Approve registration</h2>
        <div className="admin-identity">
          <strong>{user.username || user.fullName || user.name}</strong>
          <span>{user.email}</span>
          <span>
            Requested role: {user.requestedRole || 'Not provided'}
            {' · '}
            Registered {formatWhen(user.createdAt)}
          </span>
        </div>
        <fieldset className="admin-role-choice">
          <legend>Approved role</legend>
          {[
            ['teacher', 'Teacher'],
            ['lecturer', 'Lecturer'],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="assigned-role"
                value={value}
                checked={role === value}
                onChange={() => {
                  setRole(value);
                  setInstitution('');
                  setError('');
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>{role === 'teacher' ? 'School' : 'University'}</span>
          <select
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            disabled={!role}
          >
            <option value="">{role === 'teacher' ? 'Select a school' : 'Select a university'}</option>
            {options.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Department</span>
          <input
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="Department"
          />
        </label>
        {error ? <Notice tone="error" message={error} onDismiss={() => setError('')} /> : null}
        <div className="admin-actions">
          <button type="submit" className="primary" disabled={loading || !role}>
            {loading ? 'Approving and sending email…' : 'Approve and send login email'}
          </button>
          <button type="button" onClick={onClose} disabled={loading}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Central API client for PlanWise.
 * Auth token is stored as planwiseToken (JWT) — never store passwords here.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');
const TOKEN_KEY = 'planwiseToken';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && body.success === true && Object.prototype.hasOwnProperty.call(body, 'data')) {
      response.data = body.data;
    }
    return response;
  },
  (error) => {
    const message = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || 'Request failed.';
    const err = new Error(message);
    err.status = error.response?.status;
    err.detail = error.response?.data?.detail
      || (typeof error.response?.data?.details === 'string' ? error.response.data.details : '');
    err.details = error.response?.data?.details;
    err.response = error.response;
    throw err;
  },
);

export function streamAiChat(body, { signal } = {}) {
  const token = getToken();
  return fetch(`${API_BASE}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  updateMe: (payload) => api.put('/auth/me', payload).then((r) => r.data.user),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload) => api.post('/auth/reset-password', payload).then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => r.data),
  confirmRole: () => api.post('/auth/confirm-role', {}).then((r) => r.data),
  createTestAccount: (payload) => api.post('/auth/create-account', payload).then((r) => r.data),
};

export const adminApi = {
  list: () => api.get('/admin/users').then((r) => r.data.users || []),
  create: (payload) => api.post('/admin/users', payload).then((r) => r.data),
  approve: (id, payload) => api.post(`/admin/users/${id}/approve`, payload || {}).then((r) => r.data),
  resendCredentials: (id) => api.post(`/admin/users/${id}/resend-credentials`).then((r) => r.data),
  reject: (id) => api.post(`/admin/users/${id}/reject`).then((r) => r.data),
  suspend: (id) => api.post(`/admin/users/${id}/suspend`).then((r) => r.data),
  deactivate: (id) => api.post(`/admin/users/${id}/deactivate`).then((r) => r.data),
  restore: (id) => api.post(`/admin/users/${id}/restore`).then((r) => r.data),
  overview: () => api.get('/admin/overview').then((r) => r.data),
  directory: (params) => api.get('/admin/directory', { params }).then((r) => r.data),
  user: (id) => api.get(`/admin/directory/${id}`).then((r) => r.data.user),
  activity: (params) => api.get('/admin/activity', { params }).then((r) => r.data),
  lessonPlans: (params) => api.get('/admin/lesson-plans', { params }).then((r) => r.data),
  assessments: (params) => api.get('/admin/assessments', { params }).then((r) => r.data),
  attendance: (params) => api.get('/admin/attendance', { params }).then((r) => r.data),
  aiUsage: (params) => api.get('/admin/ai-usage', { params }).then((r) => r.data),
  analytics: (params) => api.get('/admin/analytics', { params }).then((r) => r.data),
  exportCsv: async (kind, params = {}) => {
    const token = getToken();
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE}/admin/export/${kind}?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Could not export this report.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planwise-${kind}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const dashboardApi = {
  get: () => api.get('/dashboard').then((r) => r.data),
};

export const lessonPlanApi = {
  list: () => api.get('/lesson-plans').then((r) => r.data.plans || []),
  get: (id) => api.get(`/lesson-plans/${id}`).then((r) => r.data.plan),
  create: (payload) => api.post('/lesson-plans', payload).then((r) => r.data.plan),
  update: (id, payload) => api.put(`/lesson-plans/${id}`, payload).then((r) => r.data.plan),
  remove: (id) => api.delete(`/lesson-plans/${id}`).then((r) => r.data),
  generate: (payload) => api.post('/lesson-plans/generate', payload).then((r) => r.data),
  regenerate: (payload) => api.post('/lesson-plans/regenerate', payload).then((r) => r.data),
};

export const assessmentApi = {
  list: () => api.get('/assessments').then((r) => r.data.assessments || []),
  create: (payload) => api.post('/assessments', payload).then((r) => r.data.assessment),
  update: (id, payload) => api.put(`/assessments/${id}`, payload).then((r) => r.data.assessment),
  remove: (id) => api.delete(`/assessments/${id}`).then((r) => r.data),
  generate: (payload) => api.post('/ai/generate-assessment', payload).then((r) => r.data.assessment),
};

export const quizApi = {
  list: () => api.get('/quizzes').then((r) => r.data.quizzes || []),
  create: (payload) => api.post('/quizzes', payload).then((r) => r.data.quiz),
  update: (id, payload) => api.put(`/quizzes/${id}`, payload).then((r) => r.data.quiz),
  remove: (id) => api.delete(`/quizzes/${id}`).then((r) => r.data),
  generate: (payload) => api.post('/ai/generate-quiz', payload).then((r) => r.data.quiz),
};

export const calendarApi = {
  list: () => api.get('/calendar').then((r) => r.data.events || []),
  create: (payload) => api.post('/calendar', payload).then((r) => r.data.event),
  update: (id, payload) => api.put(`/calendar/${id}`, payload).then((r) => r.data.event),
  remove: (id) => api.delete(`/calendar/${id}`).then((r) => r.data),
};

export const courseApi = {
  list: () => api.get('/courses').then((r) => r.data.courses || []),
  create: (payload) => api.post('/courses', payload).then((r) => r.data.course),
  update: (id, payload) => api.put(`/courses/${id}`, payload).then((r) => r.data.course),
  remove: (id) => api.delete(`/courses/${id}`).then((r) => r.data),
};

export const documentApi = {
  list: () => api.get('/documents').then((r) => r.data.documents || []),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    // Let the browser set multipart boundary — do not force Content-Type.
    return api.post('/documents/upload', form).then((r) => r.data.document);
  },
  remove: (id) => api.delete(`/documents/${id}`).then((r) => r.data),
};

export async function downloadLessonPlanPdf(id) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/lesson-plans/${id}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = 'Could not export the lesson plan.';
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // The response is not JSON.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const named = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '');
  const filename = named?.[1] || 'PlanWise-Lesson-Plan.pdf';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const attendanceApi = {
  get: () => api.get('/attendance').then((r) => r.data),
  clockIn: () => api.post('/attendance/clock-in').then((r) => r.data),
  clockOut: () => api.post('/attendance/clock-out').then((r) => r.data),
};

export const reportApi = {
  get: () => api.get('/reports').then((r) => r.data),
};

export const searchApi = {
  query: (q) => api.get('/search', { params: { q } }).then((r) => r.data),
};

export const notificationApi = {
  list: () => api.get('/notifications').then((r) => r.data),
  read: (id) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  readAll: () => api.post('/notifications/read-all').then((r) => r.data),
};

export const settingsApi = {
  notifications: () => api.get('/settings/notifications').then((r) => r.data),
  updateNotifications: (payload) => api.put('/settings/notifications', payload).then((r) => r.data),
};

export const resourceApi = {
  list: () => api.get('/resources').then((r) => r.data.resources || []),
  get: (id) => api.get(`/resources/${id}`).then((r) => r.data.resource),
  upload: (file, details = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (details.courseName) form.append('courseName', details.courseName);
    if (details.courseCode) form.append('courseCode', details.courseCode);
    // Let the browser set multipart boundary — do not force Content-Type.
    return api.post('/resources/upload', form).then((r) => r.data.resource);
  },
  remove: (id) => api.delete(`/resources/${id}`).then((r) => r.data),
};

export const markingApi = {
  list: () => api.get('/marking').then((r) => (r.data.papers || []).map((item) => ({
    ...item,
    studentLabel: item.studentName || item.studentLabel,
    subject: item.assessmentName || item.subject,
    obtained: item.obtained ?? item.score,
    aiFeedback: item.aiFeedback || item.feedback,
  }))),
  get: (id) => api.get(`/marking/${id}`).then((r) => r.data.paper),
  saveDraft: (id, payload) => api.patch(`/marking/${id}/draft`, payload).then((r) => r.data.paper),
  update: (id, payload) => api.patch(`/marking/${id}`, payload).then((r) => r.data.paper),
  finalize: (id, payload) => api.post(`/marking/${id}/finalize`, payload).then((r) => r.data.paper),
  reopen: (id) => api.post(`/marking/${id}/reopen`).then((r) => r.data.paper),
  remove: (id) => api.delete(`/marking/${id}`).then((r) => r.data),
  mark: (payload) => api.post('/ai/mark-paper', payload).then((r) => r.data),
  /**
   * Stream marking progress via SSE. Calls onProgress({ percent, message, estimated, done }).
   * Resolves with the final result only after the backend confirms completion.
   */
  markWithProgress: async (payload, { onProgress, signal } = {}) => {
    const token = getToken();
    const response = await fetch(`${API_BASE}/ai/mark-paper/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let message = 'Marking failed.';
      try {
        const body = await response.json();
        message = body.error || body.message || message;
      } catch {
        /* keep default */
      }
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    if (!response.body) {
      throw new Error('Marking stream is not available in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    let streamError = null;

    const handleBlock = (block) => {
      const lines = block.split(/\r?\n/);
      let event = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let data;
      try {
        data = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      if (event === 'progress') {
        onProgress?.(data);
      } else if (event === 'done') {
        result = data.result || data;
        onProgress?.({
          percent: 100,
          message: 'Marking completed successfully!',
          estimated: false,
          done: true,
        });
      } else if (event === 'error') {
        streamError = new Error(data.error || 'Marking failed.');
        streamError.detail = data.detail || '';
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (part.trim()) handleBlock(part);
      }
    }
    if (buffer.trim()) handleBlock(buffer);

    if (streamError) throw streamError;
    if (!result) throw new Error('Marking ended without a result. Please try again.');
    return result;
  },
};

export const institutionApi = {
  list: (params) => api.get('/institutions', { params }).then((r) => r.data),
};

export const aiApi = {
  status: () => api.get('/ai/status').then((r) => r.data),
  conversations: () => api.get('/ai/conversations').then((r) => r.data.conversations || []),
  conversation: (id) => api.get(`/ai/conversations/${id}`).then((r) => r.data.conversation),
  createConversation: (title) => api.post('/ai/conversations', { title }).then((r) => r.data.conversation),
  chat: (payload) => api.post('/ai/chat', payload).then((r) => r.data),
  extract: (payload) => api.post('/ai/extract', payload).then((r) => r.data),
  analyze: (payload) => api.post('/ai/analyze', payload).then((r) => r.data),
};

export const siteImageApi = {
  hero: () => api.get('/site-images/hero').then((r) => r.data.images || []),
  section: (sectionKey) => api.get(`/site-images/section/${sectionKey}`).then((r) => r.data.images || []),
  list: () => api.get('/site-images').then((r) => r.data.images || []),
  upload: (file, details = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (details.sectionKey) form.append('sectionKey', details.sectionKey);
    if (details.title) form.append('title', details.title);
    if (details.altText) form.append('altText', details.altText);
    if (details.sortOrder != null) form.append('sortOrder', String(details.sortOrder));
    if (details.isActive != null) form.append('isActive', String(details.isActive));
    // Let the browser set multipart boundary — do not force Content-Type.
    return api.post('/site-images', form).then((r) => r.data.image);
  },
  update: (id, payload) => api.patch(`/site-images/${id}`, payload).then((r) => r.data.image),
  remove: (id) => api.delete(`/site-images/${id}`).then((r) => r.data),
};

export const billingApi = {
  plans: () => api.get('/billing/plans').then((r) => r.data.plans || []),
  subscription: () => api.get('/billing/subscription').then((r) => r.data),
  history: () => api.get('/billing/history').then((r) => r.data.transactions || []),
  admin: () => api.get('/billing/admin').then((r) => r.data),
  checkout: (planCode) => api.post('/billing/checkout', { planCode }).then((r) => r.data),
  preview: (token) => api.get('/billing/checkout', { params: { token } }).then((r) => r.data),
  confirm: (token) => api.post('/billing/checkout/confirm', { token }).then((r) => r.data),
  cancel: () => api.post('/billing/cancel').then((r) => r.data),
};

export function apiUrl(path) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export { API_BASE, TOKEN_KEY };

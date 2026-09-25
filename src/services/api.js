/**
 * Central API client for PlanWise.
 * Auth token is stored as planwiseToken (JWT) — never store passwords here.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'planwiseToken';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  setToken('');
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
  (response) => response,
  (error) => {
    const message = error.response?.data?.error
      || error.response?.data?.message
      || error.message
      || 'Request failed.';
    const err = new Error(message);
    err.status = error.response?.status;
    err.details = error.response?.data?.details;
    throw err;
  },
);

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  updateMe: (payload) => api.put('/auth/me', payload).then((r) => r.data.user),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload) => api.post('/auth/reset-password', payload).then((r) => r.data),
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
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.document);
  },
  remove: (id) => api.delete(`/documents/${id}`).then((r) => r.data),
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

export function apiUrl(path) {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export { API_BASE, TOKEN_KEY };

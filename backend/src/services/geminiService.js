/**
 * Gemini-facing AI helpers. All Gemini calls stay on the server.
 */
import { completeJson, completeText, getLlmStatus, streamText } from './llm.js';

export { getLlmStatus };

export async function generateWithGemini({ system, user, history = [], json = false }) {
  if (json) {
    return completeJson(system, user, history);
  }
  return completeText(system, user, history);
}

export async function streamWithGemini({ system, user, history = [], onToken }) {
  if (typeof streamText === 'function') {
    return streamText(system, user, history, onToken);
  }
  const result = await completeText(system, user, history);
  if (onToken && result?.text) onToken(result.text);
  return result;
}

export function buildAssistantSystemPrompt({ user, lessonPlans = [], documents = [] }) {
  const planTitles = lessonPlans.slice(0, 12).map((p) => `- ${p.title}`).join('\n') || '- None yet';
  const docNames = documents.slice(0, 12).map((d) => `- ${d.originalName}`).join('\n') || '- None yet';
  return `You are PlanWise AI, a teaching assistant for educators.
Help the user navigate the system, create lesson plans, quizzes, and assessments, and answer questions about their content.
Be concise, practical, and professional. Do not invent files or lesson plans the user does not have.

User: ${user?.fullName || user?.name || 'Educator'} (${user?.role || 'Lecturer'})
Institution: ${user?.profile?.institution || user?.institution || 'N/A'}

Their lesson plans:
${planTitles}

Their documents:
${docNames}`;
}

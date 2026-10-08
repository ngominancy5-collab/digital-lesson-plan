/**
 * Persisted records are declared in prisma/schema.prisma.
 * Only repositories query them.
 */
export const MODEL_NAMES = Object.freeze([
  'User',
  'UserProfile',
  'PasswordResetToken',
  'Document',
  'Course',
  'LessonPlan',
  'Quiz',
  'QuizQuestion',
  'QuizOption',
  'Assessment',
  'CalendarEvent',
  'AiConversation',
  'AiMessage',
]);

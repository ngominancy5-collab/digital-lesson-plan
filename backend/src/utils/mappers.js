export function mapUser(user) {
  if (!user) return null;
  const profile = user.profile || {};
  return {
    id: user.id,
    name: user.fullName,
    fullName: user.fullName,
    email: user.email,
    username: user.username || '',
    emailVerified: Boolean(user.emailVerified),
    role: formatRole(user.role),
    roleKey: user.role,
    accountStatus: user.accountStatus || 'approved',
    mustChangePassword: Boolean(user.mustChangePassword),
    roleConfirmed: user.roleConfirmed !== false,
    institution: profile.institution || '',
    department: profile.department || '',
    phone: profile.phone || '',
    specialization: profile.specialization || '',
    educationLevel: profile.educationLevel || '',
    avatar: user.profileImage || '',
    preferences: profile.preferences || {},
    memberSince: user.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function formatRole(role) {
  const map = {
    teacher: 'Teacher',
    lecturer: 'Lecturer',
    admin: 'Administrator',
    student: 'Student',
    coordinator: 'Academic Coordinator',
    unassigned: 'Not assigned',
  };
  return map[role] || 'Lecturer';
}

export function parseRole(input) {
  const value = String(input || '').toLowerCase();
  if (value.includes('admin')) return 'admin';
  if (value.includes('student')) return 'student';
  if (value.includes('coord')) return 'coordinator';
  if (value.includes('teacher') || value.includes('school')) return 'teacher';
  return 'lecturer';
}

export function mapCalendarEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    description: event.description || '',
    type: event.eventType,
    eventType: event.eventType,
    date: event.date || (event.startAt ? event.startAt.toISOString().slice(0, 10) : ''),
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    startAt: event.startAt,
    endAt: event.endAt,
    status: event.status,
    source: event.source,
    lessonPlanId: event.lessonPlanId || null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function mapAssessment(item) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    description: item.description || '',
    kind: item.type,
    type: item.type,
    instructions: item.instructions || '',
    totalMarks: item.marks,
    marks: item.marks,
    dueDate: item.dueDate,
    status: item.status,
    questions: item.questions || [],
    lessonPlanId: item.lessonPlanId || null,
    meta: item.meta || {},
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function mapLessonPlan(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    title: plan.title,
    subject: plan.subject || '',
    topic: plan.topic || '',
    gradeLevel: plan.gradeLevel || '',
    duration: plan.duration || '',
    learningObjectives: plan.learningObjectives || [],
    introduction: plan.introduction || '',
    lessonActivities: plan.lessonActivities || [],
    teachingMethods: plan.teachingMethods || [],
    requiredMaterials: plan.requiredMaterials || [],
    assessmentMethod: plan.assessmentMethod || '',
    conclusion: plan.conclusion || '',
    difficulty: plan.difficulty,
    sourceDocumentId: plan.sourceDocumentId,
    aiGenerated: plan.aiGenerated,
    status: plan.status,
    courseName: plan.courseName || plan.title,
    courseCode: plan.courseCode || '',
    lessons: plan.lessons || [],
    warnings: plan.warnings || [],
    meta: plan.meta || {},
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

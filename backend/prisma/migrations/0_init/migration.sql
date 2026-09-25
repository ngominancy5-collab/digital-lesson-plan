-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('teacher', 'lecturer', 'admin', 'student', 'coordinator');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('Easy', 'Intermediate', 'Advanced', 'Professional');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'lecturer',
    "profileImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institution" TEXT,
    "department" TEXT,
    "specialization" TEXT,
    "educationLevel" TEXT,
    "phone" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "storageUrl" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "extractedText" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "fileName" TEXT,
    "semester" TEXT,
    "duration" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "modules" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "topic" TEXT,
    "gradeLevel" TEXT,
    "duration" TEXT,
    "learningObjectives" JSONB NOT NULL DEFAULT '[]',
    "introduction" TEXT,
    "lessonActivities" JSONB NOT NULL DEFAULT '[]',
    "teachingMethods" JSONB NOT NULL DEFAULT '[]',
    "requiredMaterials" JSONB NOT NULL DEFAULT '[]',
    "assessmentMethod" TEXT,
    "conclusion" TEXT,
    "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'Intermediate',
    "sourceDocumentId" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "courseName" TEXT,
    "courseCode" TEXT,
    "lessons" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonPlanId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "difficulty" "DifficultyLevel" NOT NULL DEFAULT 'Intermediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "correctAnswer" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionText" TEXT NOT NULL,
    "optionLabel" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonPlanId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'quiz',
    "instructions" TEXT,
    "marks" INTEGER,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'lesson',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "date" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "lessonPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Course_userId_idx" ON "Course"("userId");

-- CreateIndex
CREATE INDEX "LessonPlan_userId_idx" ON "LessonPlan"("userId");

-- CreateIndex
CREATE INDEX "LessonPlan_sourceDocumentId_idx" ON "LessonPlan"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "Quiz_userId_idx" ON "Quiz"("userId");

-- CreateIndex
CREATE INDEX "Quiz_lessonPlanId_idx" ON "Quiz"("lessonPlanId");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX "QuizOption_questionId_idx" ON "QuizOption"("questionId");

-- CreateIndex
CREATE INDEX "Assessment_userId_idx" ON "Assessment"("userId");

-- CreateIndex
CREATE INDEX "Assessment_lessonPlanId_idx" ON "Assessment"("lessonPlanId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_idx" ON "CalendarEvent"("userId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_lessonPlanId_idx" ON "CalendarEvent"("lessonPlanId");

-- CreateIndex
CREATE INDEX "AiConversation_userId_idx" ON "AiConversation"("userId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizOption" ADD CONSTRAINT "QuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


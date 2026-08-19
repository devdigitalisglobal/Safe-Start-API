-- DropIndex
DROP INDEX "Partner_isDefault_idx";

-- DropIndex
DROP INDEX "User_partnerConsentAt_idx";

-- CreateIndex
CREATE INDEX "AssessmentAttempt_completedAt_idx" ON "AssessmentAttempt"("completedAt");

-- CreateIndex
CREATE INDEX "LessonView_userId_viewedAt_idx" ON "LessonView"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "ModuleProgress_userId_idx" ON "ModuleProgress"("userId");

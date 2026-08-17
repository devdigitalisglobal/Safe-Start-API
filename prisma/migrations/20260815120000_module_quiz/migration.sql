-- Module quiz (R4): per-module 3-question quiz step
ALTER TABLE "ModuleProgress" ADD COLUMN "quizSubmittedAt" TIMESTAMP(3);

CREATE TABLE "ModuleQuizQuestion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ModuleQuizQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleQuizOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModuleQuizOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleQuizAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleQuizAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleQuizQuestion_moduleId_orderIndex_key" ON "ModuleQuizQuestion"("moduleId", "orderIndex");
CREATE INDEX "ModuleQuizQuestion_moduleId_idx" ON "ModuleQuizQuestion"("moduleId");
CREATE INDEX "ModuleQuizOption_questionId_idx" ON "ModuleQuizOption"("questionId");
CREATE UNIQUE INDEX "ModuleQuizAnswer_userId_moduleId_questionId_key" ON "ModuleQuizAnswer"("userId", "moduleId", "questionId");
CREATE INDEX "ModuleQuizAnswer_moduleId_idx" ON "ModuleQuizAnswer"("moduleId");
CREATE INDEX "ModuleQuizAnswer_questionId_idx" ON "ModuleQuizAnswer"("questionId");

ALTER TABLE "ModuleQuizQuestion" ADD CONSTRAINT "ModuleQuizQuestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleQuizOption" ADD CONSTRAINT "ModuleQuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ModuleQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleQuizAnswer" ADD CONSTRAINT "ModuleQuizAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleQuizAnswer" ADD CONSTRAINT "ModuleQuizAnswer_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleQuizAnswer" ADD CONSTRAINT "ModuleQuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ModuleQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleQuizAnswer" ADD CONSTRAINT "ModuleQuizAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "ModuleQuizOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

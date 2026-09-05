-- CreateTable
CREATE TABLE "CaseSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "entities" INTEGER,
    "links" INTEGER,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseSnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaseSnapshot_caseId_createdAt_idx" ON "CaseSnapshot"("caseId", "createdAt");

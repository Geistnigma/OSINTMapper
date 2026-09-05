-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ANALYST',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" DATETIME
);
INSERT INTO "new_User" ("active", "createdAt", "displayName", "email", "id", "lastLogin", "passwordHash", "role", "username") SELECT "active", "createdAt", "displayName", "email", "id", "lastLogin", "passwordHash", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Les instances déjà en service ont un compte d'amorçage créé avant l'existence
-- de cette colonne : sans cette ligne, la protection ne s'appliquerait qu'aux
-- installations neuves, et l'admin historique resterait supprimable.
UPDATE "User" SET "protected" = true WHERE "username" = 'admin' AND "role" = 'ADMIN';

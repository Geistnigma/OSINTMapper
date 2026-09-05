/*
  Warnings:

  - You are about to drop the column `config` on the `Plugin` table. All the data in the column will be lost.
  - You are about to drop the column `enabled` on the `Plugin` table. All the data in the column will be lost.
  - Added the required column `bundleHash` to the `Plugin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `manifest` to the `Plugin` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "PluginPreference" (
    "pluginId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" TEXT,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("pluginId", "userId"),
    CONSTRAINT "PluginPreference_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Plugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sdkVersion" TEXT,
    "description" TEXT,
    "author" TEXT,
    "category" TEXT,
    "icon" TEXT,
    "manifest" TEXT NOT NULL,
    "docs" TEXT,
    "bundleHash" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "installedBy" TEXT,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Plugin" ("author", "description", "id", "installedAt", "name", "version") SELECT "author", "description", "id", "installedAt", "name", "version" FROM "Plugin";
DROP TABLE "Plugin";
ALTER TABLE "new_Plugin" RENAME TO "Plugin";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PluginPreference_userId_idx" ON "PluginPreference"("userId");

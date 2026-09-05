# Version history

Return to an earlier state of an investigation, **even after a page reload**.

## Why this plugin exists

`Ctrl+Z` relies on `Y.UndoManager`, whose stack lives in memory. An F5 destroys
the document and recreates it from the investigation file: there is then nothing
left to undo. That is normal behaviour - Figma, Miro and Google Docs all work the
same way.

This plugin fills what was missing: a safety net **beyond the session**. An
entity deleted yesterday can still be recovered today.

## Using it

### Automatic points

The server archives the investigation after a save, **at most once every
5 minutes**. Without that guard, autosave (1 s after the last keystroke) would
produce one per character typed.

They appear with a grey dot. The last 20 are kept.

### Manual points

Before a risky operation - merging two accounts, importing a file, clearing the
graph - create a named point:

1. Type a label ("before merging the accounts")
2. **+ Create a restore point**

Blue dot, 20 kept, independent of the automatic quota.

### Restoring

The **Restore** button asks for confirmation, then:

1. The **current** state is archived as "Before restoring …" - picking the wrong
   version stays recoverable;
2. The investigation file is replaced by the snapshot;
3. The synchronisation room is closed and **every participant reloads**.

That third step is not cosmetic: as long as a room is open, the in-memory Yjs
document is what counts, and it would rewrite the restored file within a second.

> **Owner only.** A restore overwrites everyone's work. Other members can see the
> history and create points, but the Restore button is refused to them - the
> server answers 403 even if the interface were bypassed.

## Encrypted investigations

A snapshot is a **byte-for-byte copy** of the investigation file. An encrypted
file is therefore copied as is: the history works without ever touching session
keys, and restoring is just the copy in the other direction.

Visible consequence: the server cannot count the entities of an encrypted file.
The list shows "encrypted content" rather than a misleading `0 entities`.

## What this plugin does not do

**It does not create the snapshots.** OSINTMapper's plugin system is purely
**client-side**: a plugin is an ESM module loaded in the browser. Archiving,
however, is triggered on save server-side and handles the investigation file on
disk.

The server part therefore lives in the core of the application:

| Part | Location |
|---|---|
| Creation, retention, restore | `server/services/snapshots.js` |
| HTTP routes | `server/routes/cases.js` |
| Metadata | `CaseSnapshot` table |
| Files | `server/data/snapshots/<caseId>/` |
| Closing the Yjs room | `closeYjsRoom` (`server/ws/yjs.js`) |

This plugin is **the interface** to those routes. Disabling it removes the panel,
not the restore points: they keep being created and stay reachable through the
API.

## API used

The plugin relies on `ctx.api` (SDK 2.1):

```js
await ctx.api.get(`/cases/${ctx.caseId}/snapshots`);
await ctx.api.post(`/cases/${ctx.caseId}/snapshots`, { label: 'before merge' });
await ctx.api.post(`/cases/${ctx.caseId}/snapshots/${id}/restore`);
```

| Route | Required role |
|---|---|
| `GET /api/cases/:id/snapshots` | member of the investigation |
| `POST /api/cases/:id/snapshots` | `OWNER` or `ANALYST` |
| `POST /api/cases/:id/snapshots/:snapId/restore` | `OWNER` |

An account without access to the investigation receives **404**, not 403: the
server does not reveal that an investigation exists to someone with no right to it.

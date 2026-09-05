/**
 * usePermissions - Role-based access control for the UI.
 *
 * Usage:
 *   const { canEdit, canDelete, canManageUsers, isAdmin, isViewer, role } = usePermissions();
 *
 * Rules:
 *   ADMIN   → everything
 *   ANALYST → create/edit/delete entities, links, cases. No user management.
 *   VIEWER  → read-only. Can view graph, map, export. Cannot modify anything.
 */

/** Parse role from props or localStorage */
export function getPermissions(role) {
  const r = (role || 'VIEWER').toUpperCase();
  return {
    role: r,
    isAdmin: r === 'ADMIN',
    isAnalyst: r === 'ANALYST',
    isViewer: r === 'VIEWER',

    // Data mutations
    canEdit: r === 'ADMIN' || r === 'ANALYST',
    canCreate: r === 'ADMIN' || r === 'ANALYST',
    canDelete: r === 'ADMIN' || r === 'ANALYST',

    // Case management
    canCreateCase: r === 'ADMIN' || r === 'ANALYST',
    canDeleteCase: r === 'ADMIN',
    canImportCase: r === 'ADMIN' || r === 'ANALYST',
    canExportCase: true, // everyone can export

    // User management
    canManageUsers: r === 'ADMIN',

    // Collaboration
    canInvite: r === 'ADMIN' || r === 'ANALYST',

    // Plugins
    canConfigurePlugins: r === 'ADMIN' || r === 'ANALYST',
  };
}

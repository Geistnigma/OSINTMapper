import React, { useState } from 'react';

/**
 * Plugin Panel component.
 *
 * This component is rendered in TWO possible contexts:
 *
 * 1. FULLSCREEN (toolbar-button + fullscreen-panel hooks)
 *    → No `entity` prop. Receives all entities/links.
 *    → Use for dashboards, importers, tools.
 *
 * 2. ENTITY TAB (entity-tab hook)
 *    → `entity` prop is the selected entity.
 *    → Use for entity-specific tools (enrichment, tagging, etc.)
 *
 * Check `props.entity` to know which mode you're in.
 */
export default function Panel({
  // ═══ DATA ═══
  entity,              // Current entity (entity-tab mode only, null in fullscreen)
  entities,            // All entities array
  links,               // All links array

  // ═══ MUTATIONS ═══
  addEntity,           // (subItemId, x, y) → create entity
  updateEntity,        // (id, { field: value }) → update entity
  deleteEntity,        // (id) → delete entity
  addLink,             // (fromId, toId) → create link
  updateLink,          // (id, { field: value }) → update link
  deleteLink,          // (id) → delete link

  // ═══ SELECTION ═══
  selectedId,          // Currently selected entity ID
  setSelectedId,       // (id) → select entity

  // ═══ THEME ═══
  theme: t,            // { bg, text, surface, surfaceAlt, border, accent, textMuted, textSecondary, ... }

  // ═══ PLUGIN ═══
  settings,            // Plugin settings values (from manifest.settings)
  updateSettings,      // (key, value) → update a setting (fullscreen only)
  onClose,             // () → close the panel (fullscreen only)
  isViewer,            // true if user is VIEWER role (entity-tab only)

  // ═══ CONTEXT ═══
  caseId,              // Current case ID
  userName,            // Current user name
}) {

  // ═══ ENTITY TAB MODE ═══
  if (entity) {
    return (
      <div style={{ padding: 10 }}>
        <p style={{ fontSize: 12, color: t.textSecondary }}>
          Entité sélectionnée : <strong>{entity.label}</strong>
        </p>
        <p style={{ fontSize: 11, color: t.textMuted }}>
          Type: {entity.type} / {entity.subtype}
        </p>
        {/* Your entity-specific UI here */}
      </div>
    );
  }

  // ═══ FULLSCREEN MODE ═══
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: t.bg, color: t.text, padding: 20,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Mon Plugin</h2>
      <p style={{ fontSize: 12, color: t.textSecondary }}>
        {entities?.length || 0} entités, {links?.length || 0} liens dans le graphe.
      </p>
      {/* Your fullscreen UI here */}
    </div>
  );
}

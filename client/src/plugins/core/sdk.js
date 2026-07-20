/**
 * OSINTMapper Plugin SDK — Type definitions & documentation.
 * 
 * A plugin is a folder in /plugins/ with:
 *   - manifest.js   → metadata, hooks, settings
 *   - Panel.jsx     → fullscreen panel component (optional)
 *   - Sidebar.jsx   → entity sidebar section (optional)
 *   - Toolbar.jsx   → custom toolbar widget (optional)
 * 
 * ═══════════════════════════════════════════════════════
 * PROPS PASSED TO ALL PLUGIN COMPONENTS
 * ═══════════════════════════════════════════════════════
 * 
 * @typedef {Object} PluginProps
 * 
 * DATA (read-only snapshots):
 * @property {Array} entities      - All entities [{id, type, subtype, label, x, y, color, metadata, comments, description, notes}]
 * @property {Array} links         - All links [{id, from, to, type, label, color, strength, confidence, date}]
 * @property {Array} stickers      - All stickers [{id, emoji, label, x, y}]
 * @property {Array} postits       - All post-its [{id, text, color, x, y, w, h}]
 * 
 * MUTATIONS (call to modify data — synced via Yjs to all collaborators):
 * @property {Function} addEntity(subItemId, x, y)         - Add entity by subtype ID
 * @property {Function} updateEntity(id, updates)          - Update entity fields
 * @property {Function} deleteEntity(id)                   - Delete entity
 * @property {Function} addLink(fromId, toId)              - Add link between two entities
 * @property {Function} updateLink(id, updates)            - Update link fields
 * @property {Function} deleteLink(id)                     - Delete link
 * 
 * SELECTION:
 * @property {string|null} selectedId                      - Currently selected entity ID
 * @property {Function} setSelectedId(id)                  - Select an entity
 * 
 * THEME:
 * @property {Object} theme       - Theme colors {bg, text, surface, border, accent, ...}
 * 
 * PLUGIN LIFECYCLE:
 * @property {Function} onClose   - Close the plugin panel
 * @property {Object} settings    - Plugin settings values (from manifest.settings)
 * @property {Function} updateSettings(key, value)         - Update a setting
 * 
 * CONTEXT:
 * @property {string} caseId      - Current case ID
 * @property {string} userName    - Current user name
 * @property {Object} collab      - Collaboration state {connected, collaborators, ...}
 */

export const SDK_VERSION = '1.0.0';

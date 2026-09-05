# Themes

Three extra palettes for the interface and the canvas.

## Using them

Enable the plugin, then open the toolbar's **⚙️** menu: the new themes appear in
the **Theme** section, after Dark and Light. Your choice is kept from one session
to the next.

| Theme | Look | Good for |
|---|---|---|
| ☕ **Café crème** | warm beiges and browns, terracotta accent | long reading sessions - pure white tires the eyes |
| 🖥️ **Terminal** | deep black, phosphor green | CRT feel, maximum contrast |
| 🧊 **Nord** | cool desaturated blue-greys | dark but gentle, less contrasted than the built-in theme |

## If you disable the plugin

The interface falls back to the **Dark** theme. Your chosen identifier stays
remembered: re-enable the plugin and your theme comes back.

## How it works

This plugin contains **no code** - only a manifest. Themes are declarative:

```js
export default {
  id: 'themes',
  themes: [
    { id: 'cafe', name: 'Café crème', icon: '☕', colors: { bg: '#f4ece1', /* … */ } },
  ],
};
```

The host collects the themes of every enabled plugin (`engine.getThemes()`) and
offers them in the menu. Identifiers are prefixed with the plugin's own
(`themes:cafe`), so two plugins can each offer a "dark" without colliding or
overwriting the built-in themes.

### Adding your own theme

Create a plugin with a `themes` array. All **21 colours are required**:

```
bg, surface, surfaceAlt, border, borderHover,
text, textSecondary, textMuted, accent, accentHover,
canvasBg, canvasGrid, shadow, danger, success,
catHover, itemBg, itemHover, itemBorder, tooltip, tooltipBorder
```

The manifest is **refused at registration** if one is missing, with the list of
absent keys in the console. This is deliberate: an undefined colour does not
break one corner of the screen, it spreads everywhere the key is read.

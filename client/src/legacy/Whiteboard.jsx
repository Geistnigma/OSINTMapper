import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const TOOLS = [
  { id: "pen", label: "✏️ Crayon", cursor: "crosshair" },
  { id: "eraser", label: "🧹 Gomme", cursor: "cell" },
  { id: "rect", label: "▭ Rectangle", cursor: "crosshair" },
  { id: "circle", label: "○ Cercle", cursor: "crosshair" },
  { id: "arrow", label: "→ Flèche", cursor: "crosshair" },
  { id: "line", label: "╱ Ligne", cursor: "crosshair" },
  { id: "text", label: "T Texte", cursor: "text" },
  { id: "sticker", label: "😀 Sticker", cursor: "pointer" },
  { id: "select", label: "☝ Sélection", cursor: "default" },
];

const COLORS = ["#ffffff","#ef4444","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899","#06b6d4","#f97316","#64748b"];
const SIZES = [2, 4, 8, 14, 24];
const STICKER_SETS = [
  ["⚠️","❓","❗","✅","❌","🔍","📌","💡","🎯","🔒"],
  ["👤","👥","🏢","📱","📧","💻","🌐","📍","💰","🔗"],
  ["🟢","🟡","🔴","🔵","⚪","⬛","🟠","🟣","🟤","⭐"],
];

export default function Whiteboard({ show, onClose, theme, collab }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#ffffff");
  const [size, setSize] = useState(4);
  const [elements, setElements] = useState([]); // All drawn elements
  const [drawing, setDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [shapeStart, setShapeStart] = useState(null);
  const [shapePreview, setShapePreview] = useState(null);
  const [textInput, setTextInput] = useState(null); // {x, y} for text placement
  const [textValue, setTextValue] = useState("");
  const [selectedEl, setSelectedEl] = useState(null);
  const [stickerPicker, setStickerPicker] = useState(null); // {x, y} for sticker placement
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const t = theme;

  // Canvas coordinate conversion
  const screenToCanvas = useCallback((sx, sy) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: sx, y: sy };
    return {
      x: (sx - rect.left - pan.x) / zoom,
      y: (sy - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // === RENDER ALL ELEMENTS ===
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctxRef.current = ctx;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    
    // Background
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Grid
    if (showGrid) {
      ctx.strokeStyle = t.canvasGrid || "#ffffff10";
      ctx.lineWidth = 0.5;
      const gridSize = 30;
      const startX = Math.floor(-pan.x / zoom / gridSize) * gridSize - gridSize;
      const startY = Math.floor(-pan.y / zoom / gridSize) * gridSize - gridSize;
      const endX = startX + W / zoom + gridSize * 2;
      const endY = startY + H / zoom + gridSize * 2;
      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
      }
    }

    // Draw elements
    elements.forEach((el, idx) => {
      const isSelected = selectedEl === idx;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (el.type === "path") {
        if (el.points.length < 2) return;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        ctx.globalAlpha = el.eraser ? 1 : 1;
        ctx.globalCompositeOperation = el.eraser ? "destination-out" : "source-over";
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          const p0 = el.points[i - 1], p1 = el.points[i];
          const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }

      if (el.type === "rect") {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
        const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
        if (el.fill) { ctx.fillStyle = el.color + "30"; ctx.fillRect(x, y, w, h); }
        ctx.strokeRect(x, y, w, h);
        if (isSelected) { ctx.setLineDash([6, 3]); ctx.strokeStyle = "#58a6ff"; ctx.strokeRect(x - 3, y - 3, w + 6, h + 6); ctx.setLineDash([]); }
      }

      if (el.type === "circle") {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
        const rx = Math.abs(el.x2 - el.x1) / 2, ry = Math.abs(el.y2 - el.y1) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        if (isSelected) { ctx.setLineDash([6, 3]); ctx.strokeStyle = "#58a6ff"; ctx.beginPath(); ctx.ellipse(cx, cy, rx + 4, ry + 4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      }

      if (el.type === "line" || el.type === "arrow") {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke();
        if (el.type === "arrow") {
          const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
          const headLen = 12 + el.size * 2;
          ctx.beginPath();
          ctx.moveTo(el.x2, el.y2);
          ctx.lineTo(el.x2 - headLen * Math.cos(angle - 0.4), el.y2 - headLen * Math.sin(angle - 0.4));
          ctx.moveTo(el.x2, el.y2);
          ctx.lineTo(el.x2 - headLen * Math.cos(angle + 0.4), el.y2 - headLen * Math.sin(angle + 0.4));
          ctx.stroke();
        }
      }

      if (el.type === "text") {
        ctx.font = `${el.size * 4}px -apple-system, sans-serif`;
        ctx.fillStyle = el.color;
        ctx.fillText(el.text, el.x, el.y);
        if (isSelected) {
          const m = ctx.measureText(el.text);
          ctx.setLineDash([4, 3]); ctx.strokeStyle = "#58a6ff"; ctx.lineWidth = 1;
          ctx.strokeRect(el.x - 2, el.y - el.size * 4, m.width + 4, el.size * 5);
          ctx.setLineDash([]);
        }
      }

      if (el.type === "sticker") {
        ctx.font = `${el.size * 6}px serif`;
        ctx.fillText(el.emoji, el.x, el.y);
      }
    });

    // Shape preview while drawing
    if (shapePreview) {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.setLineDash([6, 4]);
      const sp = shapePreview;
      if (sp.type === "rect") {
        const x = Math.min(sp.x1, sp.x2), y = Math.min(sp.y1, sp.y2);
        ctx.strokeRect(x, y, Math.abs(sp.x2 - sp.x1), Math.abs(sp.y2 - sp.y1));
      } else if (sp.type === "circle") {
        const cx = (sp.x1 + sp.x2) / 2, cy = (sp.y1 + sp.y2) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(sp.x2 - sp.x1) / 2, Math.abs(sp.y2 - sp.y1) / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (sp.type === "line" || sp.type === "arrow") {
        ctx.beginPath(); ctx.moveTo(sp.x1, sp.y1); ctx.lineTo(sp.x2, sp.y2); ctx.stroke();
        if (sp.type === "arrow") {
          const angle = Math.atan2(sp.y2 - sp.y1, sp.x2 - sp.x1);
          const headLen = 12 + size * 2;
          ctx.beginPath();
          ctx.moveTo(sp.x2, sp.y2);
          ctx.lineTo(sp.x2 - headLen * Math.cos(angle - 0.4), sp.y2 - headLen * Math.sin(angle - 0.4));
          ctx.moveTo(sp.x2, sp.y2);
          ctx.lineTo(sp.x2 - headLen * Math.cos(angle + 0.4), sp.y2 - headLen * Math.sin(angle + 0.4));
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Current path (pen/eraser live)
    if (currentPath.length > 1) {
      ctx.strokeStyle = tool === "eraser" ? "#ff000050" : color;
      ctx.lineWidth = size;
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      for (let i = 1; i < currentPath.length; i++) {
        const p0 = currentPath[i - 1], p1 = currentPath[i];
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      }
      ctx.stroke();
    }

    // Collaboration: remote cursors
    if (collab?.collaborators) {
      Object.entries(collab.collaborators).forEach(([id, c]) => {
        if (c.wbCursor) {
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(c.wbCursor.x, c.wbCursor.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "11px -apple-system, sans-serif";
          ctx.fillText(c.name, c.wbCursor.x + 8, c.wbCursor.y - 4);
        }
      });
    }

    ctx.restore();
  }, [elements, pan, zoom, t, showGrid, currentPath, shapePreview, color, size, tool, selectedEl, collab]);

  // Re-render on any change
  useEffect(() => { if (show) renderCanvas(); }, [show, renderCanvas]);

  // Resize canvas
  useEffect(() => {
    if (!show || !canvasRef.current) return;
    const resize = () => {
      const c = canvasRef.current;
      const parent = c.parentElement;
      c.width = parent.clientWidth;
      c.height = parent.clientHeight;
      renderCanvas();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [show, renderCanvas]);

  // === PUSH TO UNDO ===
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-50), JSON.stringify(elements)]);
    setRedoStack([]);
  }, [elements]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(prev => [...prev, JSON.stringify(elements)]);
    const last = undoStack[undoStack.length - 1];
    setElements(JSON.parse(last));
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, elements]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(prev => [...prev, JSON.stringify(elements)]);
    const last = redoStack[redoStack.length - 1];
    setElements(JSON.parse(last));
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, elements]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!show) return;
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
      if (e.key === "Delete" && selectedEl !== null) {
        pushUndo();
        setElements(prev => prev.filter((_, i) => i !== selectedEl));
        setSelectedEl(null);
      }
      if (e.key === "Escape") {
        setTextInput(null); setStickerPicker(null); setSelectedEl(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [show, undo, redo, selectedEl, pushUndo]);

  // === MOUSE HANDLERS ===
  const handleDown = useCallback(e => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    if (e.button !== 0) return;
    const pos = screenToCanvas(e.clientX, e.clientY);

    if (tool === "pen" || tool === "eraser") {
      setDrawing(true);
      setCurrentPath([pos]);
    } else if (["rect", "circle", "arrow", "line"].includes(tool)) {
      setShapeStart(pos);
    } else if (tool === "text") {
      setTextInput(pos);
      setTextValue("");
    } else if (tool === "sticker") {
      setStickerPicker(pos);
    } else if (tool === "select") {
      // Simple hit-test
      let found = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === "text" && Math.abs(pos.x - el.x) < 100 && Math.abs(pos.y - el.y) < el.size * 5) { found = i; break; }
        if (el.type === "sticker" && Math.abs(pos.x - el.x) < 30 && Math.abs(pos.y - el.y) < 30) { found = i; break; }
        if (el.type === "rect") {
          const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
          const w = Math.abs(el.x2 - el.x1), h = Math.abs(el.y2 - el.y1);
          if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) { found = i; break; }
        }
        if (el.type === "circle") {
          const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
          const rx = Math.abs(el.x2 - el.x1) / 2, ry = Math.abs(el.y2 - el.y1) / 2;
          if (rx > 0 && ry > 0 && ((pos.x - cx) ** 2 / rx ** 2 + (pos.y - cy) ** 2 / ry ** 2 <= 1)) { found = i; break; }
        }
      }
      setSelectedEl(found);
    }
  }, [tool, pan, zoom, screenToCanvas, elements]);

  const handleMove = useCallback(e => {
    if (isPanning) {
      setPan({ x: panStart.current.px + e.clientX - panStart.current.x, y: panStart.current.py + e.clientY - panStart.current.y });
      return;
    }
    const pos = screenToCanvas(e.clientX, e.clientY);

    if (drawing && (tool === "pen" || tool === "eraser")) {
      setCurrentPath(prev => [...prev, pos]);
    }
    if (shapeStart && ["rect", "circle", "arrow", "line"].includes(tool)) {
      setShapePreview({ type: tool, x1: shapeStart.x, y1: shapeStart.y, x2: pos.x, y2: pos.y });
    }

    // Broadcast cursor to collab
    if (collab?.connected) {
      collab.send?.({ type: "wb:cursor", cursor: pos });
    }
  }, [isPanning, drawing, tool, shapeStart, screenToCanvas, collab]);

  const handleUp = useCallback(e => {
    if (isPanning) { setIsPanning(false); return; }

    if (drawing && (tool === "pen" || tool === "eraser")) {
      if (currentPath.length > 1) {
        pushUndo();
        const newEl = { type: "path", points: currentPath, color, size, eraser: tool === "eraser" };
        setElements(prev => [...prev, newEl]);
        if (collab?.connected) collab.send?.({ type: "wb:element:add", element: newEl });
      }
      setDrawing(false);
      setCurrentPath([]);
    }

    if (shapeStart && ["rect", "circle", "arrow", "line"].includes(tool)) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const dx = Math.abs(pos.x - shapeStart.x), dy = Math.abs(pos.y - shapeStart.y);
      if (dx > 3 || dy > 3) {
        pushUndo();
        const newEl = { type: tool, x1: shapeStart.x, y1: shapeStart.y, x2: pos.x, y2: pos.y, color, size };
        setElements(prev => [...prev, newEl]);
        if (collab?.connected) collab.send?.({ type: "wb:element:add", element: newEl });
      }
      setShapeStart(null);
      setShapePreview(null);
    }
  }, [isPanning, drawing, tool, currentPath, shapeStart, color, size, pushUndo, screenToCanvas, collab]);

  // Wheel zoom
  const handleWheel = useCallback(e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * delta)));
  }, []);

  // Add text
  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) { setTextInput(null); return; }
    pushUndo();
    const newEl = { type: "text", x: textInput.x, y: textInput.y, text: textValue, color, size };
    setElements(prev => [...prev, newEl]);
    if (collab?.connected) collab.send?.({ type: "wb:element:add", element: newEl });
    setTextInput(null);
    setTextValue("");
  }, [textInput, textValue, color, size, pushUndo, collab]);

  // Add sticker
  const commitSticker = useCallback((emoji) => {
    if (!stickerPicker) return;
    pushUndo();
    const newEl = { type: "sticker", x: stickerPicker.x, y: stickerPicker.y, emoji, size };
    setElements(prev => [...prev, newEl]);
    if (collab?.connected) collab.send?.({ type: "wb:element:add", element: newEl });
    setStickerPicker(null);
  }, [stickerPicker, size, pushUndo, collab]);

  // Collab: listen for remote elements
  useEffect(() => {
    if (!collab?.onRemote) return;
    const unsub = collab.onRemote({
      onWbElementAdd: (el) => setElements(prev => [...prev, el]),
      onWbClear: () => setElements([]),
    });
    return unsub;
  }, [collab]);

  // Clear all
  const clearAll = useCallback(() => {
    if (!confirm("Effacer tout le tableau ?")) return;
    pushUndo();
    setElements([]);
    if (collab?.connected) collab.send?.({ type: "wb:clear" });
  }, [pushUndo, collab]);

  // Export as PNG
  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  if (!show) return null;

  const tb = { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, color: t.text, padding: "6px 10px", fontFamily: "inherit" };
  const tbActive = { ...tb, background: t.accent + "30", border: `1px solid ${t.accent}`, color: t.accent };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.bg, zIndex: 150, display: "flex", flexDirection: "column" }}>
      {/* TOP BAR */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: t.surface, borderBottom: `1px solid ${t.border}`, gap: 12, flexWrap: "wrap" }}>
        {/* Left: Tools */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {TOOLS.map(tl => (
            <button key={tl.id} onClick={() => { setTool(tl.id); setSelectedEl(null); }} style={tool === tl.id ? tbActive : tb} title={tl.label}>
              {tl.label}
            </button>
          ))}
        </div>

        {/* Center: Color + Size */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 3 }}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)} style={{ width: 20, height: 20, borderRadius: 10, background: c, border: color === c ? `2px solid ${t.accent}` : `2px solid ${t.border}`, cursor: "pointer" }} />
            ))}
          </div>
          <div style={{ width: 1, height: 24, background: t.border }} />
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {SIZES.map(s => (
              <div key={s} onClick={() => setSize(s)} style={{ width: 28, height: 28, borderRadius: 6, background: size === s ? t.accent + "30" : t.surfaceAlt, border: size === s ? `1px solid ${t.accent}` : `1px solid ${t.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: Math.min(s + 2, 18), height: Math.min(s + 2, 18), borderRadius: "50%", background: color }} />
              </div>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={undo} style={tb} disabled={undoStack.length === 0} title="Annuler (Ctrl+Z)">↩</button>
          <button onClick={redo} style={tb} disabled={redoStack.length === 0} title="Rétablir (Ctrl+Y)">↪</button>
          <button onClick={() => setShowGrid(!showGrid)} style={showGrid ? tbActive : tb}>▦</button>
          <button onClick={exportPNG} style={tb}>📥 PNG</button>
          <button onClick={clearAll} style={{ ...tb, color: "#ef4444" }}>🗑️ Tout effacer</button>
          <button onClick={onClose} style={{ ...tb, fontWeight: 600 }}>✕ Fermer</button>
        </div>
      </div>

      {/* CANVAS */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", cursor: TOOLS.find(tl => tl.id === tool)?.cursor || "default" }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleDown}
          onMouseMove={handleMove}
          onMouseUp={handleUp}
          onMouseLeave={handleUp}
          onWheel={handleWheel}
          style={{ display: "block", width: "100%", height: "100%" }}
        />

        {/* Text input overlay */}
        {textInput && (
          <div style={{ position: "absolute", left: textInput.x * zoom + pan.x, top: textInput.y * zoom + pan.y - 20, zIndex: 10 }}>
            <input
              autoFocus
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextInput(null); }}
              onBlur={commitText}
              placeholder="Tapez votre texte..."
              style={{ background: t.surfaceAlt, border: `2px solid ${t.accent}`, borderRadius: 6, color: t.text, fontSize: 16, padding: "6px 12px", outline: "none", minWidth: 200, fontFamily: "inherit" }}
            />
          </div>
        )}

        {/* Sticker picker overlay */}
        {stickerPicker && (
          <div style={{ position: "absolute", left: Math.min(stickerPicker.x * zoom + pan.x, window.innerWidth - 340), top: stickerPicker.y * zoom + pan.y, zIndex: 10, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 10, boxShadow: `0 8px 24px ${t.shadow}` }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 6, textTransform: "uppercase" }}>Choisir un sticker</div>
            {STICKER_SETS.map((set, si) => (
              <div key={si} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {set.map(emoji => (
                  <button key={emoji} onClick={() => commitSticker(emoji)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 4, borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.background = t.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                    {emoji}
                  </button>
                ))}
              </div>
            ))}
            <button onClick={() => setStickerPicker(null)} style={{ width: "100%", padding: "4px", background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 6, color: t.textMuted, fontSize: 11, cursor: "pointer", marginTop: 4 }}>Annuler</button>
          </div>
        )}

        {/* Element count */}
        <div style={{ position: "absolute", bottom: 12, left: 12, background: t.surface + "cc", border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 11, color: t.textMuted }}>
          {elements.length} élément{elements.length !== 1 ? "s" : ""} · Zoom {Math.round(zoom * 100)}%
          {collab?.connected && <span style={{ color: "#10b981" }}> · 🟢 Collab</span>}
        </div>
      </div>
    </div>
  );
}

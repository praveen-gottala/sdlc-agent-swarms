/**
 * @module highlight-styles
 * CSS for delta highlight overlays — matches R10 visual delta mockup.
 * Colors sampled from docs/research/briefs/R10-visual-delta-mockup.html.
 */

export const DELTA_HIGHLIGHT_CSS = `
/* ─── R10 Delta Highlight Styles ─────────────────────── */

.delta-highlight {
  position: relative;
  border-radius: var(--border-radius-md, 8px);
}

/* Added: green solid outline + subtle green tint */
.delta-added {
  border: 2px solid #639922;
  background: rgba(99, 153, 34, 0.06);
}

/* Modified: amber solid outline + subtle amber tint */
.delta-modified {
  border: 2px solid #BA7517;
  background: rgba(186, 117, 23, 0.06);
}

/* Removed: red dashed outline + reduced opacity + strikethrough */
.delta-removed {
  border: 2px dashed #E24B4A;
  background: rgba(226, 75, 74, 0.04);
  opacity: 0.55;
}
.delta-removed * {
  text-decoration: line-through;
}

/* Reordered: same as modified + arrow indicator */
.delta-reordered {
  border: 2px solid #BA7517;
  background: rgba(186, 117, 23, 0.06);
}

/* ─── Badges ─────────────────────────────────────────── */

.delta-badge {
  position: absolute;
  top: -10px;
  right: 10px;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 1;
}

.delta-badge-added {
  background: #C0DD97;
  color: #173404;
  border: 0.5px solid #639922;
}

.delta-badge-modified {
  background: #FAC775;
  color: #412402;
  border: 0.5px solid #BA7517;
}

.delta-badge-removed {
  background: #F7C1C1;
  color: #501313;
  border: 0.5px solid #E24B4A;
  opacity: 1;
}

.delta-badge-reordered {
  background: #FAC775;
  color: #412402;
  border: 0.5px solid #BA7517;
}

/* ─── Hover toolbar (approve/reject on hover) ──────── */

.delta-hover-toolbar {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 4px 8px;
  gap: 6px;
  align-items: center;
  z-index: 10;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: auto;
}

.delta-highlight:hover > .delta-hover-toolbar {
  display: flex;
}

.delta-toolbar-label {
  font-size: 11px;
  color: #cbd5e1;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.delta-hover-toolbar .delta-approve-btn,
.delta-hover-toolbar .delta-reject-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.delta-hover-toolbar .delta-approve-btn {
  border: 1px solid #639922;
  background: #C0DD97;
  color: #173404;
}
.delta-hover-toolbar .delta-approve-btn:hover {
  background: #a8cf72;
}

.delta-hover-toolbar .delta-reject-btn {
  border: 1px solid #E24B4A;
  background: #F7C1C1;
  color: #501313;
}
.delta-hover-toolbar .delta-reject-btn:hover {
  background: #f0a0a0;
}

/* ─── Field diff badge (inline, for modified fields) ── */

.delta-field-badge {
  display: inline-block;
  background: #FAC775;
  color: #412402;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 8px;
  margin-left: 4px;
  vertical-align: middle;
}
`;

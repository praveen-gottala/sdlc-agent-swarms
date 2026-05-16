/**
 * @module highlight-styles
 * CSS for delta highlight overlays — matches R10 visual delta mockup.
 * Colors sampled from docs/research/briefs/R10-visual-delta-mockup.html.
 */

export const DELTA_HIGHLIGHT_CSS = `
/* ─── R10 Delta Highlight Styles ─────────────────────── */

.r10-highlight {
  position: relative;
  border-radius: var(--border-radius-md, 8px);
}

/* Added: green solid outline + subtle green tint */
.r10-added {
  border: 2px solid #639922;
  background: rgba(99, 153, 34, 0.06);
}

/* Modified: amber solid outline + subtle amber tint */
.r10-modified {
  border: 2px solid #BA7517;
  background: rgba(186, 117, 23, 0.06);
}

/* Removed: red dashed outline + reduced opacity + strikethrough */
.r10-removed {
  border: 2px dashed #E24B4A;
  background: rgba(226, 75, 74, 0.04);
  opacity: 0.55;
}
.r10-removed * {
  text-decoration: line-through;
}

/* Reordered: same as modified + arrow indicator */
.r10-reordered {
  border: 2px solid #BA7517;
  background: rgba(186, 117, 23, 0.06);
}

/* ─── Badges ─────────────────────────────────────────── */

.r10-badge {
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

.r10-badge-added {
  background: #C0DD97;
  color: #173404;
  border: 0.5px solid #639922;
}

.r10-badge-modified {
  background: #FAC775;
  color: #412402;
  border: 0.5px solid #BA7517;
}

.r10-badge-removed {
  background: #F7C1C1;
  color: #501313;
  border: 0.5px solid #E24B4A;
  opacity: 1;
}

.r10-badge-reordered {
  background: #FAC775;
  color: #412402;
  border: 0.5px solid #BA7517;
}

/* ─── Field diff badge (inline, for modified fields) ── */

.r10-field-badge {
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

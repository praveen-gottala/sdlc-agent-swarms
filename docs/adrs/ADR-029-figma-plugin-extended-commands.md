# ADR-029: Extended Figma Plugin Commands via Patch

## Status
Accepted

## Context
After aligning with the upstream cursor-talk-to-figma-mcp plugin (ADR-028), the UX agents
still lacked critical design capabilities that the Figma Plugin API supports but the upstream
plugin doesn't expose. These gaps made it impossible to create production-quality designs
programmatically:

- **Charts**: No way to draw lines, vectors, or data points (issue #21)
- **Effects**: No drop shadows, blur — cards look flat and unprofessional
- **Gradients**: No linear/radial gradient fills for backgrounds or charts
- **Typography**: No font family, size, line height control — only text content
- **Images**: No image fills
- **Shapes**: No ellipses, polygons, stars — limited to rectangles
- **Grouping**: No boolean operations, grouping, or flattening
- **Opacity/naming**: `set_opacity` and `set_name` didn't exist in upstream

Without these, UX agents cannot produce designs equivalent to what a human does manually
in Figma, making the entire UX agent pipeline non-viable.

## Decision
Add a second Docker patch (`patch-plugin-commands.js`) that injects 16 new command handlers
into the Figma plugin's `code.js` at build time. These use the Figma Plugin API directly.

### New Commands (16)

| Command | Figma API | Purpose |
|---------|-----------|---------|
| `create_ellipse` | `figma.createEllipse()` | Circles, data points on charts |
| `create_line` | `figma.createLine()` | Chart axes, separators, grid lines |
| `create_vector` | `figma.createVector()` | SVG path data for chart trend lines |
| `create_polygon` | `figma.createPolygon()` | Triangles, hexagons, icons |
| `create_star` | `figma.createStar()` | Star ratings, decorations |
| `create_component` | `figma.createComponent()` | Reusable design components |
| `create_boolean_operation` | `figma.createBooleanOperation()` | UNION/SUBTRACT/INTERSECT/EXCLUDE |
| `set_effects` | `node.effects = [...]` | Drop shadow, inner shadow, blur |
| `set_gradient_fill` | `node.fills = [{type: "GRADIENT_*"}]` | Linear, radial, angular gradients |
| `set_image_fill` | `figma.createImage()` + `node.fills` | Image backgrounds from base64 |
| `set_font_properties` | `node.fontName`, `fontSize`, etc. | Font family, size, line height |
| `set_opacity` | `node.opacity` | Transparency control |
| `set_name` | `node.name` | Node naming |
| `set_constraints` | `node.constraints` | Responsive constraints |
| `group_nodes` | `figma.group()` | Node grouping |
| `ungroup` | `node.parent.appendChild()` | Ungroup a group |
| `flatten_node` | `figma.flatten()` | Flatten to vector |
| `set_rotation` | `node.rotation` | Rotate any node |
| `set_visibility` | `node.visible` | Show/hide nodes |
| `set_locked` | `node.locked` | Lock/unlock nodes |
| `set_blend_mode` | `node.blendMode` | Blend modes (MULTIPLY, SCREEN, etc.) |
| `set_mask` | `node.isMask` | Clipping masks |
| `set_clip_content` | `node.clipsContent` | Clip content in frames |
| `set_layout_align` | `node.layoutAlign` | STRETCH/INHERIT in auto-layout parent |
| `set_layout_grow` | `node.layoutGrow` | Flex grow factor |
| `set_size_constraints` | `node.min/maxWidth/Height` | Min/max size constraints |
| `set_text_properties` | `node.textAutoResize`, etc. | Text auto-resize, case, paragraph spacing |
| `set_overflow` | `node.overflowDirection` | Scroll/overflow direction |
| `set_layout_grid` | `node.layoutGrids` | Column/row/grid guides on frames |
| `set_export_settings` | `node.exportSettings` | Export format, scale, suffix |
| `set_strokes` | `node.strokes` | Multiple strokes, dash pattern, align |
| `set_reactions` | `node.reactions` | Prototype interactions |
| `create_page` | `figma.createPage()` | Multi-page documents |
| `set_current_page` | `figma.currentPage = ...` | Switch active page |
| `get_pages` | `figma.root.children` | List all pages |
| `create_paint_style` | `figma.createPaintStyle()` | Reusable color/gradient styles |
| `create_text_style` | `figma.createTextStyle()` | Reusable text styles |
| `create_effect_style` | `figma.createEffectStyle()` | Reusable shadow/blur styles |
| `apply_style` | `node.fillStyleId = ...` | Apply shared styles to nodes |
| `import_svg` | `figma.createNodeFromSvg()` | Import SVG string as node |
| `swap_component_instance` | `instance.swapComponent()` | Swap instance to different component |
| `detach_instance` | `instance.detachInstance()` | Detach instance to plain frame |
| `create_table` | Frame-based table builder | Table with rows, cols, borders |

### Architecture
```
Docker build:
  1. Clone upstream repo
  2. patch-channels-endpoint.js → adds /channels + /tools to bridge
  3. patch-plugin-commands.js → adds 37 commands to plugin code.js
  4. bun install
```

The patch injects new `case` blocks into the `handleCommand()` switch statement in
`code.js`, before the `default:` case. Each handler follows the same pattern as upstream
handlers (get node, validate, modify, return result).

## Consequences
- **Charts are now possible**: `create_vector` with SVG path data draws trend lines,
  `create_line` draws axes, `create_ellipse` draws data points
- **Professional styling**: `set_effects` adds drop shadows, `set_gradient_fill` adds
  gradient backgrounds, `set_font_properties` controls typography
- **Design system parity**: `create_component` + `set_constraints` enable proper
  component-based design
- Total tool count: 82 (39 upstream + 37 patched + 6 upstream read-only)
- Patch is applied at Docker build time — no runtime overhead
- If upstream adds these commands later, the patch's idempotency check
  (`source.includes('create_ellipse')`) will skip re-patching

## Remaining Limitations
After this patch, the only Figma operations NOT supported programmatically are:
- FigJam-specific: sticky notes, shape-with-text, slides
- Video/GIF insertion (requires external hosting)
- Figma Variables API (design tokens — requires paid plan)
- Real-time collaboration features (comments, cursors)
- Plugin-to-plugin communication

## Risks
- Figma Plugin API changes could break patched commands (mitigated: API is stable)
- Patch may fail if upstream restructures `handleCommand()` (mitigated: idempotency check
  + CI will catch Docker build failures)

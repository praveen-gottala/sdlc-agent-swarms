/**
 * Post-clone patch: adds custom command handlers to the Figma plugin's code.js.
 * These extend the upstream plugin with capabilities the Figma Plugin API supports
 * but the upstream doesn't expose (vectors, ellipses, effects, gradients, fonts, etc.).
 *
 * See ADR-029 for rationale and the full list of added commands.
 */

const fs = require('fs');
const path = require('path');

const codePath = path.join(__dirname, 'src', 'cursor_mcp_plugin', 'code.js');
let source = fs.readFileSync(codePath, 'utf-8');

// Find the default case in the handleCommand switch statement
const defaultMarker = 'default:';
const unknownCommandMarker = 'Unknown command';

if (source.includes('create_ellipse')) {
  console.log('[patch-plugin] Custom commands already present, skipping');
  process.exit(0);
}

// We inject new cases before the `default:` case in handleCommand's switch
// Find the last case before default
const defaultIdx = source.lastIndexOf(defaultMarker);
if (defaultIdx === -1) {
  console.error('[patch-plugin] Could not find default case in handleCommand');
  process.exit(1);
}

const newCases = `
    // --- AgentForge patch: extended Figma Plugin API commands ---

    case "create_ellipse": {
      const { x = 0, y = 0, width = 100, height = 100, name = "Ellipse", parentId } = params || {};
      const ellipse = figma.createEllipse();
      ellipse.x = x;
      ellipse.y = y;
      ellipse.resize(width, height);
      ellipse.name = name;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(ellipse);
      } else {
        figma.currentPage.appendChild(ellipse);
      }
      return { id: ellipse.id, name: ellipse.name, x: ellipse.x, y: ellipse.y, width: ellipse.width, height: ellipse.height };
    }

    case "create_line": {
      const { x = 0, y = 0, length = 100, rotation = 0, name = "Line", strokeColor, strokeWeight = 1, parentId } = params || {};
      const line = figma.createLine();
      line.x = x;
      line.y = y;
      line.resize(length, 0);
      line.rotation = rotation;
      line.name = name;
      line.strokes = [{ type: "SOLID", color: strokeColor ? { r: strokeColor.r || 0, g: strokeColor.g || 0, b: strokeColor.b || 0 } : { r: 0, g: 0, b: 0 } }];
      line.strokeWeight = strokeWeight;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(line);
      } else {
        figma.currentPage.appendChild(line);
      }
      return { id: line.id, name: line.name, x: line.x, y: line.y, length: line.width };
    }

    case "create_vector": {
      const { x = 0, y = 0, name = "Vector", vectorPaths, width, height, fillColor, strokeColor, strokeWeight = 1, parentId } = params || {};
      const vector = figma.createVector();
      vector.x = x;
      vector.y = y;
      vector.name = name;
      if (width && height) vector.resize(width, height);
      if (vectorPaths && Array.isArray(vectorPaths)) {
        try {
          // Normalize SVG path data: ensure spaces after path commands (M0,0 → M 0,0)
          var normalized = vectorPaths.map(function(p) {
            var d = (p.data || "").replace(/([MLHVCSQTAZmlhvcsqtaz])([0-9.\-])/g, function(m, a, b) { return a + " " + b; });
            return { windingRule: p.windingRule || "EVENODD", data: d };
          });
          vector.vectorPaths = normalized;
        } catch (e) {
          // vectorPaths failed — keep the vector as a simple sized shape
          console.log("[AgentForge] vectorPaths failed for " + name + ": " + e.message);
        }
      }
      if (fillColor) {
        vector.fills = [{ type: "SOLID", color: { r: fillColor.r || 0, g: fillColor.g || 0, b: fillColor.b || 0 }, opacity: fillColor.a !== undefined ? fillColor.a : 1 }];
      }
      if (strokeColor) {
        vector.strokes = [{ type: "SOLID", color: { r: strokeColor.r || 0, g: strokeColor.g || 0, b: strokeColor.b || 0 }, opacity: strokeColor.a !== undefined ? strokeColor.a : 1 }];
        vector.strokeWeight = strokeWeight;
      }
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(vector);
      } else {
        figma.currentPage.appendChild(vector);
      }
      return { id: vector.id, name: vector.name, x: vector.x, y: vector.y, width: vector.width, height: vector.height };
    }

    case "create_polygon": {
      const { x = 0, y = 0, width = 100, height = 100, pointCount = 3, name = "Polygon", parentId } = params || {};
      const polygon = figma.createPolygon();
      polygon.x = x;
      polygon.y = y;
      polygon.resize(width, height);
      polygon.pointCount = pointCount;
      polygon.name = name;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(polygon);
      } else {
        figma.currentPage.appendChild(polygon);
      }
      return { id: polygon.id, name: polygon.name, x: polygon.x, y: polygon.y, width: polygon.width, height: polygon.height };
    }

    case "create_star": {
      const { x = 0, y = 0, width = 100, height = 100, pointCount = 5, innerRadius = 0.382, name = "Star", parentId } = params || {};
      const star = figma.createStar();
      star.x = x;
      star.y = y;
      star.resize(width, height);
      star.pointCount = pointCount;
      star.innerRadius = innerRadius;
      star.name = name;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(star);
      } else {
        figma.currentPage.appendChild(star);
      }
      return { id: star.id, name: star.name, x: star.x, y: star.y, width: star.width, height: star.height };
    }

    case "set_effects": {
      const { nodeId, effects } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("effects" in node)) throw new Error("Node does not support effects");
      const mappedEffects = (effects || []).map(e => {
        const effect = { type: e.type, visible: e.visible !== false };
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          effect.blendMode = e.blendMode || "NORMAL";
          effect.offset = { x: e.offsetX || 0, y: e.offsetY || 0 };
          effect.radius = e.radius || 4;
          effect.spread = e.spread || 0;
          effect.color = { r: (e.color && e.color.r) || 0, g: (e.color && e.color.g) || 0, b: (e.color && e.color.b) || 0, a: (e.color && e.color.a !== undefined) ? e.color.a : 0.25 };
        } else if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
          effect.radius = e.radius || 4;
        }
        return effect;
      });
      node.effects = mappedEffects;
      return { id: node.id, name: node.name, effectCount: mappedEffects.length };
    }

    case "set_gradient_fill": {
      const { nodeId, gradientType = "GRADIENT_LINEAR", gradientStops, gradientTransform } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("fills" in node)) throw new Error("Node does not support fills");
      const stops = (gradientStops || []).map(s => ({
        position: s.position || 0,
        color: { r: (s.color && s.color.r) || 0, g: (s.color && s.color.g) || 0, b: (s.color && s.color.b) || 0, a: (s.color && s.color.a !== undefined) ? s.color.a : 1 }
      }));
      const paint = {
        type: gradientType,
        gradientStops: stops,
        gradientTransform: gradientTransform || [[1, 0, 0], [0, 1, 0]]
      };
      node.fills = [paint];
      return { id: node.id, name: node.name, gradientType };
    }

    case "set_image_fill": {
      const { nodeId, imageBytes, scaleMode = "FILL" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      if (!imageBytes) throw new Error("Missing imageBytes parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("fills" in node)) throw new Error("Node does not support fills");
      const bytes = typeof imageBytes === "string" ? Uint8Array.from(atob(imageBytes), c => c.charCodeAt(0)) : new Uint8Array(imageBytes);
      const image = figma.createImage(bytes);
      node.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode }];
      return { id: node.id, name: node.name, imageHash: image.hash };
    }

    case "set_font_properties": {
      const { nodeId, fontFamily, fontStyle = "Regular", fontSize, lineHeight, letterSpacing, textAlignHorizontal, textAlignVertical, textDecoration } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (node.type !== "TEXT") throw new Error("Node is not a TEXT node");
      if (fontFamily) {
        await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
        node.fontName = { family: fontFamily, style: fontStyle };
      }
      if (fontSize !== undefined) node.fontSize = fontSize;
      if (lineHeight !== undefined) {
        node.lineHeight = typeof lineHeight === "number"
          ? { value: lineHeight, unit: "PIXELS" }
          : lineHeight;
      }
      if (letterSpacing !== undefined) {
        node.letterSpacing = typeof letterSpacing === "number"
          ? { value: letterSpacing, unit: "PIXELS" }
          : letterSpacing;
      }
      if (textAlignHorizontal) node.textAlignHorizontal = textAlignHorizontal;
      if (textAlignVertical) node.textAlignVertical = textAlignVertical;
      if (textDecoration) node.textDecoration = textDecoration;
      return { id: node.id, name: node.name, fontFamily: node.fontName.family, fontSize: node.fontSize };
    }

    case "set_opacity": {
      const { nodeId, opacity = 1 } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("opacity" in node)) throw new Error("Node does not support opacity");
      node.opacity = Math.max(0, Math.min(1, opacity));
      return { id: node.id, name: node.name, opacity: node.opacity };
    }

    case "set_name": {
      const { nodeId, name } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      if (!name) throw new Error("Missing name parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      node.name = name;
      return { id: node.id, name: node.name };
    }

    case "set_constraints": {
      const { nodeId, horizontal = "MIN", vertical = "MIN" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("constraints" in node)) throw new Error("Node does not support constraints");
      node.constraints = { horizontal, vertical };
      return { id: node.id, name: node.name, constraints: node.constraints };
    }

    case "create_boolean_operation": {
      const { operation = "UNION", nodeIds, name = "BooleanOperation" } = params || {};
      if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) throw new Error("Need at least 2 nodeIds");
      const nodes = [];
      for (const nid of nodeIds) {
        const n = await figma.getNodeByIdAsync(nid);
        if (!n) throw new Error("Node not found: " + nid);
        nodes.push(n);
      }
      const boolOp = figma.createBooleanOperation();
      boolOp.booleanOperation = operation;
      for (const n of nodes) boolOp.appendChild(n);
      boolOp.name = name;
      figma.currentPage.appendChild(boolOp);
      return { id: boolOp.id, name: boolOp.name, operation };
    }

    case "group_nodes": {
      const { nodeIds, name = "Group" } = params || {};
      if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 1) throw new Error("Need at least 1 nodeId");
      const nodes = [];
      for (const nid of nodeIds) {
        const n = await figma.getNodeByIdAsync(nid);
        if (!n) throw new Error("Node not found: " + nid);
        nodes.push(n);
      }
      const group = figma.group(nodes, figma.currentPage);
      group.name = name;
      return { id: group.id, name: group.name, childCount: group.children.length };
    }

    case "flatten_node": {
      const { nodeId } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      const flat = figma.flatten([node]);
      return { id: flat.id, name: flat.name };
    }

    case "create_component": {
      const { x = 0, y = 0, width = 100, height = 100, name = "Component", parentId } = params || {};
      const comp = figma.createComponent();
      comp.x = x;
      comp.y = y;
      comp.resize(width, height);
      comp.name = name;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(comp);
      } else {
        figma.currentPage.appendChild(comp);
      }
      return { id: comp.id, name: comp.name, key: comp.key, x: comp.x, y: comp.y, width: comp.width, height: comp.height };
    }

    // --- AgentForge patch: Phase 2 — full Figma API coverage ---

    case "set_rotation": {
      const { nodeId, rotation = 0 } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("rotation" in node)) throw new Error("Node does not support rotation");
      node.rotation = rotation;
      return { id: node.id, name: node.name, rotation: node.rotation };
    }

    case "set_visibility": {
      const { nodeId, visible = true } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      node.visible = visible;
      return { id: node.id, name: node.name, visible: node.visible };
    }

    case "set_locked": {
      const { nodeId, locked = false } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      node.locked = locked;
      return { id: node.id, name: node.name, locked: node.locked };
    }

    case "set_blend_mode": {
      const { nodeId, blendMode = "NORMAL" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("blendMode" in node)) throw new Error("Node does not support blendMode");
      node.blendMode = blendMode;
      return { id: node.id, name: node.name, blendMode: node.blendMode };
    }

    case "set_mask": {
      const { nodeId, isMask = true } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("isMask" in node)) throw new Error("Node does not support masking");
      node.isMask = isMask;
      return { id: node.id, name: node.name, isMask: node.isMask };
    }

    case "set_clip_content": {
      const { nodeId, clipsContent = true } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("clipsContent" in node)) throw new Error("Node does not support clipsContent");
      node.clipsContent = clipsContent;
      return { id: node.id, name: node.name, clipsContent: node.clipsContent };
    }

    case "set_layout_align": {
      const { nodeId, layoutAlign = "INHERIT" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("layoutAlign" in node)) throw new Error("Node does not support layoutAlign");
      node.layoutAlign = layoutAlign;
      return { id: node.id, name: node.name, layoutAlign: node.layoutAlign };
    }

    case "set_layout_grow": {
      const { nodeId, layoutGrow = 0 } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("layoutGrow" in node)) throw new Error("Node does not support layoutGrow");
      node.layoutGrow = layoutGrow;
      return { id: node.id, name: node.name, layoutGrow: node.layoutGrow };
    }

    case "set_size_constraints": {
      const { nodeId, minWidth, maxWidth, minHeight, maxHeight } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (minWidth !== undefined && "minWidth" in node) node.minWidth = minWidth;
      if (maxWidth !== undefined && "maxWidth" in node) node.maxWidth = maxWidth;
      if (minHeight !== undefined && "minHeight" in node) node.minHeight = minHeight;
      if (maxHeight !== undefined && "maxHeight" in node) node.maxHeight = maxHeight;
      return { id: node.id, name: node.name, minWidth: node.minWidth, maxWidth: node.maxWidth, minHeight: node.minHeight, maxHeight: node.maxHeight };
    }

    case "set_text_properties": {
      const { nodeId, textAutoResize, textCase, textDecoration, paragraphSpacing, paragraphIndent, textAlignHorizontal, textAlignVertical, hyperlink } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (node.type !== "TEXT") throw new Error("Node is not a TEXT node");
      if (textAutoResize !== undefined) node.textAutoResize = textAutoResize;
      if (textCase !== undefined) node.textCase = textCase;
      if (textDecoration !== undefined) node.textDecoration = textDecoration;
      if (paragraphSpacing !== undefined) node.paragraphSpacing = paragraphSpacing;
      if (paragraphIndent !== undefined) node.paragraphIndent = paragraphIndent;
      if (textAlignHorizontal !== undefined) node.textAlignHorizontal = textAlignHorizontal;
      if (textAlignVertical !== undefined) node.textAlignVertical = textAlignVertical;
      if (hyperlink !== undefined) node.hyperlink = hyperlink;
      return { id: node.id, name: node.name };
    }

    case "set_overflow": {
      const { nodeId, overflowDirection = "NONE" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("overflowDirection" in node)) throw new Error("Node does not support overflowDirection");
      node.overflowDirection = overflowDirection;
      return { id: node.id, name: node.name, overflowDirection: node.overflowDirection };
    }

    case "set_layout_grid": {
      const { nodeId, layoutGrids } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("layoutGrids" in node)) throw new Error("Node does not support layoutGrids");
      node.layoutGrids = (layoutGrids || []).map(function(g) {
        var grid = {
          pattern: g.pattern || "COLUMNS",
          sectionSize: g.sectionSize || 1,
          visible: g.visible !== false,
          color: g.color ? { r: g.color.r || 0, g: g.color.g || 0, b: g.color.b || 0, a: g.color.a !== undefined ? g.color.a : 0.1 } : { r: 1, g: 0, b: 0, a: 0.1 }
        };
        if (g.pattern === "COLUMNS" || g.pattern === "ROWS") {
          grid.alignment = g.alignment || "STRETCH";
          grid.gutterSize = g.gutterSize || 20;
          grid.count = g.count || 12;
          grid.offset = g.offset || 0;
        }
        return grid;
      });
      return { id: node.id, name: node.name, gridCount: node.layoutGrids.length };
    }

    case "set_export_settings": {
      const { nodeId, exportSettings } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("exportSettings" in node)) throw new Error("Node does not support exportSettings");
      node.exportSettings = (exportSettings || []).map(s => ({
        format: s.format || "PNG",
        suffix: s.suffix || "",
        constraint: s.constraint || { type: "SCALE", value: 1 },
      }));
      return { id: node.id, name: node.name, exportCount: node.exportSettings.length };
    }

    case "create_page": {
      const { name = "New Page" } = params || {};
      const page = figma.createPage();
      page.name = name;
      return { id: page.id, name: page.name };
    }

    case "set_current_page": {
      const { pageId } = params || {};
      if (!pageId) throw new Error("Missing pageId parameter");
      const page = await figma.getNodeByIdAsync(pageId);
      if (!page || page.type !== "PAGE") throw new Error("Page not found: " + pageId);
      figma.currentPage = page;
      return { id: page.id, name: page.name };
    }

    case "get_pages": {
      const pages = figma.root.children.map(p => ({ id: p.id, name: p.name }));
      return { pages };
    }

    case "create_paint_style": {
      const { name, color, gradientType, gradientStops, gradientTransform } = params || {};
      if (!name) throw new Error("Missing name parameter");
      const style = figma.createPaintStyle();
      style.name = name;
      if (gradientType && gradientStops) {
        style.paints = [{
          type: gradientType,
          gradientStops: gradientStops.map(s => ({ position: s.position || 0, color: { r: s.color.r || 0, g: s.color.g || 0, b: s.color.b || 0, a: s.color.a !== undefined ? s.color.a : 1 } })),
          gradientTransform: gradientTransform || [[1, 0, 0], [0, 1, 0]]
        }];
      } else if (color) {
        style.paints = [{ type: "SOLID", color: { r: color.r || 0, g: color.g || 0, b: color.b || 0 }, opacity: color.a !== undefined ? color.a : 1 }];
      }
      return { id: style.id, name: style.name, key: style.key };
    }

    case "create_text_style": {
      const { name, fontFamily = "Inter", fontStyle = "Regular", fontSize = 16, lineHeight, letterSpacing } = params || {};
      if (!name) throw new Error("Missing name parameter");
      const style = figma.createTextStyle();
      style.name = name;
      await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
      style.fontName = { family: fontFamily, style: fontStyle };
      style.fontSize = fontSize;
      if (lineHeight !== undefined) style.lineHeight = typeof lineHeight === "number" ? { value: lineHeight, unit: "PIXELS" } : lineHeight;
      if (letterSpacing !== undefined) style.letterSpacing = typeof letterSpacing === "number" ? { value: letterSpacing, unit: "PIXELS" } : letterSpacing;
      return { id: style.id, name: style.name, key: style.key };
    }

    case "create_effect_style": {
      const { name, effects } = params || {};
      if (!name) throw new Error("Missing name parameter");
      const style = figma.createEffectStyle();
      style.name = name;
      if (effects && Array.isArray(effects)) {
        style.effects = effects.map(e => {
          const eff = { type: e.type, visible: e.visible !== false };
          if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
            eff.blendMode = e.blendMode || "NORMAL";
            eff.offset = { x: e.offsetX || 0, y: e.offsetY || 0 };
            eff.radius = e.radius || 4;
            eff.spread = e.spread || 0;
            eff.color = { r: (e.color && e.color.r) || 0, g: (e.color && e.color.g) || 0, b: (e.color && e.color.b) || 0, a: (e.color && e.color.a !== undefined) ? e.color.a : 0.25 };
          } else if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
            eff.radius = e.radius || 4;
          }
          return eff;
        });
      }
      return { id: style.id, name: style.name, key: style.key };
    }

    case "apply_style": {
      const { nodeId, styleId, styleType = "fill" } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      if (!styleId) throw new Error("Missing styleId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      const style = figma.getStyleById(styleId);
      if (!style) throw new Error("Style not found: " + styleId);
      if (styleType === "fill" && "fillStyleId" in node) node.fillStyleId = style.id;
      else if (styleType === "stroke" && "strokeStyleId" in node) node.strokeStyleId = style.id;
      else if (styleType === "effect" && "effectStyleId" in node) node.effectStyleId = style.id;
      else if (styleType === "text" && "textStyleId" in node) node.textStyleId = style.id;
      return { id: node.id, name: node.name, appliedStyle: style.name };
    }

    case "import_svg": {
      const { svgString, x = 0, y = 0, name = "SVG", parentId } = params || {};
      if (!svgString) throw new Error("Missing svgString parameter");
      const svgNode = figma.createNodeFromSvg(svgString);
      svgNode.x = x;
      svgNode.y = y;
      svgNode.name = name;
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(svgNode);
      }
      return { id: svgNode.id, name: svgNode.name, x: svgNode.x, y: svgNode.y, width: svgNode.width, height: svgNode.height };
    }

    case "ungroup": {
      const { nodeId } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (node.type !== "GROUP") throw new Error("Node is not a GROUP");
      const parent = node.parent;
      const children = node.children.slice();
      const childIds = [];
      for (const child of children) {
        parent.appendChild(child);
        childIds.push(child.id);
      }
      node.remove();
      return { ungroupedChildren: childIds };
    }

    case "swap_component_instance": {
      const { nodeId, newComponentId, newComponentKey } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (node.type !== "INSTANCE") throw new Error("Node is not an INSTANCE");
      if (newComponentKey) {
        const imported = await figma.importComponentByKeyAsync(newComponentKey);
        node.swapComponent(imported);
      } else if (newComponentId) {
        const comp = await figma.getNodeByIdAsync(newComponentId);
        if (!comp || comp.type !== "COMPONENT") throw new Error("Component not found: " + newComponentId);
        node.swapComponent(comp);
      } else {
        throw new Error("Provide newComponentId or newComponentKey");
      }
      return { id: node.id, name: node.name, mainComponent: node.mainComponent ? node.mainComponent.name : null };
    }

    case "detach_instance": {
      const { nodeId } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (node.type !== "INSTANCE") throw new Error("Node is not an INSTANCE");
      const detached = node.detachInstance();
      return { id: detached.id, name: detached.name, type: detached.type };
    }

    case "create_table": {
      const { x = 0, y = 0, rows = 3, cols = 3, cellWidth = 120, cellHeight = 40, name = "Table", parentId } = params || {};
      // Build table as nested frames since figma.createTable() is FigJam-only
      const table = figma.createFrame();
      table.x = x;
      table.y = y;
      table.name = name;
      table.layoutMode = "VERTICAL";
      table.itemSpacing = 0;
      table.resize(cols * cellWidth, rows * cellHeight);
      const cellIds = [];
      for (let r = 0; r < rows; r++) {
        const row = figma.createFrame();
        row.name = name + "_row_" + r;
        row.layoutMode = "HORIZONTAL";
        row.itemSpacing = 0;
        row.resize(cols * cellWidth, cellHeight);
        row.layoutSizingHorizontal = "FILL";
        table.appendChild(row);
        for (let c = 0; c < cols; c++) {
          const cell = figma.createFrame();
          cell.name = name + "_cell_" + r + "_" + c;
          cell.resize(cellWidth, cellHeight);
          cell.layoutSizingHorizontal = "FILL";
          cell.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
          cell.strokeWeight = 1;
          cell.layoutMode = "HORIZONTAL";
          cell.counterAxisAlignItems = "CENTER";
          cell.paddingLeft = 8;
          cell.paddingRight = 8;
          row.appendChild(cell);
          cellIds.push(cell.id);
        }
      }
      if (parentId) {
        const parent = await figma.getNodeByIdAsync(parentId);
        if (parent && "appendChild" in parent) parent.appendChild(table);
      } else {
        figma.currentPage.appendChild(table);
      }
      return { id: table.id, name: table.name, rows, cols, cellIds };
    }

    case "set_reactions": {
      const { nodeId, reactions } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("reactions" in node)) throw new Error("Node does not support reactions");
      node.reactions = (reactions || []).map(r => ({
        action: r.action || { type: "NODE", destinationId: null, navigation: "NAVIGATE", transition: null },
        trigger: r.trigger || { type: "ON_CLICK" },
      }));
      return { id: node.id, name: node.name, reactionCount: node.reactions.length };
    }

    case "set_strokes": {
      const { nodeId, strokes, strokeWeight, strokeAlign = "INSIDE", dashPattern } = params || {};
      if (!nodeId) throw new Error("Missing nodeId parameter");
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error("Node not found: " + nodeId);
      if (!("strokes" in node)) throw new Error("Node does not support strokes");
      if (strokes) {
        node.strokes = strokes.map(s => {
          if (s.type === "SOLID") return { type: "SOLID", color: { r: s.r || 0, g: s.g || 0, b: s.b || 0 }, opacity: s.a !== undefined ? s.a : 1 };
          return s;
        });
      }
      if (strokeWeight !== undefined) node.strokeWeight = strokeWeight;
      if (strokeAlign && "strokeAlign" in node) node.strokeAlign = strokeAlign;
      if (dashPattern && "dashPattern" in node) node.dashPattern = dashPattern;
      return { id: node.id, name: node.name };
    }

    // --- end AgentForge patch ---

`;

source = source.replace(
  /(\s+)(default:\s)/,
  `${newCases}\n    $2`
);

fs.writeFileSync(codePath, source);
console.log('[patch-plugin] Added 37 custom command handlers to code.js');

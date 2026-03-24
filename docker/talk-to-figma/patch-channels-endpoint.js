/**
 * Post-clone patch: adds a GET /channels endpoint to the TalkToFigma bridge.
 * Returns active channels (those with 1+ connected clients).
 *
 * This enables AgentForge's preflight to discover which channel the Figma
 * plugin is connected to, without requiring manual channel ID copying.
 */

const fs = require('fs');
const path = require('path');

const socketPath = path.join(__dirname, 'src', 'socket.ts');
let source = fs.readFileSync(socketPath, 'utf-8');

// Find the fetch handler that returns "WebSocket server running"
// and add a /channels endpoint before it
const marker = '"WebSocket server running"';

if (!source.includes('/channels')) {
  const patchCode = `
      // --- AgentForge patch: channel + tool discovery endpoints ---
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/tools") {
        // Full upstream tool list from cursor-talk-to-figma-mcp.
        // Matches server.ts exactly (excluding join_channel).
        // See ADR-028 for alignment details.
        const tools = [
          // Document & Selection
          "get_document_info", "get_selection", "read_my_design",
          "get_node_info", "get_nodes_info",
          "set_focus", "set_selections",
          // Creation
          "create_frame", "create_rectangle", "create_text",
          "create_component_instance",
          // Styling
          "set_fill_color", "set_stroke_color", "set_corner_radius",
          "set_text_content", "set_multiple_text_contents",
          // Auto-Layout
          "set_layout_mode", "set_padding", "set_item_spacing",
          "set_axis_align", "set_layout_sizing",
          // Transform & Mutation
          "move_node", "resize_node", "clone_node",
          "delete_node", "delete_multiple_nodes",
          // Scanning
          "scan_text_nodes", "scan_nodes_by_types",
          // Components & Styles
          "get_styles", "get_local_components",
          "get_instance_overrides", "set_instance_overrides",
          // Annotations
          "get_annotations", "set_annotation", "set_multiple_annotations",
          // Export
          "export_node_as_image",
          // Prototyping
          "get_reactions", "set_default_connector", "create_connections",
          // AgentForge extensions (patched into plugin)
          "create_ellipse", "create_line", "create_vector",
          "create_polygon", "create_star", "create_component",
          "create_boolean_operation",
          "set_effects", "set_gradient_fill", "set_image_fill",
          "set_font_properties", "set_opacity", "set_name",
          "set_constraints", "group_nodes", "ungroup", "flatten_node",
          // Phase 2: full API coverage
          "set_rotation", "set_visibility", "set_locked",
          "set_blend_mode", "set_mask", "set_clip_content",
          "set_layout_align", "set_layout_grow", "set_size_constraints",
          "set_text_properties", "set_overflow",
          "set_layout_grid", "set_export_settings", "set_strokes", "set_reactions",
          "create_page", "set_current_page", "get_pages",
          "create_paint_style", "create_text_style", "create_effect_style", "apply_style",
          "import_svg", "swap_component_instance", "detach_instance", "create_table",
        ];
        return new Response(JSON.stringify({ tools }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      if (url.pathname === "/channels") {
        const activeChannels: string[] = [];
        for (const [name, clients] of channels.entries()) {
          if (clients.size > 0) {
            activeChannels.push(name);
          }
        }
        return new Response(JSON.stringify({ channels: activeChannels }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      // --- end AgentForge patch (channels + tools) ---
`;

  // Insert before the "WebSocket server running" return
  source = source.replace(
    `return new Response(${marker}`,
    `${patchCode}\n      return new Response(${marker}`
  );

  fs.writeFileSync(socketPath, source);
  console.log('[patch] Added /channels + /tools endpoints to socket.ts');
} else {
  console.log('[patch] /channels endpoint already present, skipping');
}

# ADR-028: Full Alignment with cursor-talk-to-figma-mcp Plugin

## Status
Accepted

## Context
AgentForge's UX design agents used a manually maintained subset of tools from the
cursor-talk-to-figma-mcp plugin. An audit revealed:

1. **4 phantom tools** (`create_component`, `create_instance`, `set_name`, `set_opacity`)
   existed in our tool list but are **not implemented** by the upstream plugin. These calls
   silently failed or returned errors.

2. **17 real upstream tools** were missing from our list, including critical capabilities:
   - `get_node_info`, `get_nodes_info` — inspect node properties
   - `scan_text_nodes`, `scan_nodes_by_types` — find existing nodes (prevents duplicates)
   - `export_node_as_image` — screenshot without REST API token
   - `delete_multiple_nodes`, `set_multiple_text_contents` — batch operations
   - `get_styles`, `get_local_components` — design system discovery
   - `create_component_instance` — the real name for component instantiation

Without full tool coverage, UX agents cannot perform the equivalent of what a human does
manually in Figma. This gap makes programmatic design non-viable for production use.

## Decision
Align `TALK_TO_FIGMA_TOOLS` exactly with the upstream plugin's `server.ts` tool registry
(39 tools, excluding `join_channel` which is connection management).

### Removed (phantom — never worked)
- `create_component` — does not exist in plugin
- `create_instance` — does not exist; real tool is `create_component_instance`
- `set_name` — does not exist in plugin
- `set_opacity` — does not exist in plugin

### Added (21 upstream tools)
- **Document & Selection**: `read_my_design`, `get_node_info`, `get_nodes_info`,
  `set_focus`, `set_selections`
- **Batch operations**: `delete_multiple_nodes`, `set_multiple_text_contents`,
  `set_multiple_annotations`
- **Scanning**: `scan_text_nodes`, `scan_nodes_by_types`
- **Components**: `create_component_instance`, `get_instance_overrides`,
  `set_instance_overrides`, `get_styles`, `get_local_components`
- **Annotations**: `get_annotations`, `set_annotation`
- **Export**: `export_node_as_image`
- **Prototyping**: `get_reactions`, `set_default_connector`, `create_connections`

### Breaking Changes
- `create_component` → removed (phantom)
- `create_instance` → `create_component_instance` (correct upstream name)
- `set_name` → removed (phantom)
- `set_opacity` → removed (phantom)

## Consequences
- UX agents now have access to every capability the Figma plugin offers
- The design fixer can use `scan_nodes_by_types` to find existing nodes before creating
  duplicates (addresses issue #20)
- The design fixer can use `get_node_info` to inspect properties before modifying
  (addresses score plateau issue #19)
- `export_node_as_image` provides screenshot capability without requiring a Figma REST API
  token — simplifies the self-correction loop
- Batch tools (`delete_multiple_nodes`, `set_multiple_text_contents`) reduce API calls
- Agent contracts, ALLOWED_TOOLS, SUPPORTED_TOOLS, and design prompts all updated
- Bridge patch `/tools` endpoint updated to return the full upstream list

## Remaining Figma Limitations (no plugin support)
These cannot be done programmatically with any current plugin:
- Vector/pen tool, bezier curves, SVG import
- Boolean operations (union, subtract, intersect)
- Effects (shadows, blur)
- Gradients (linear, radial, angular)
- Image fills
- Font family/weight/size control (only text content changes)
- Constraints/pinning
- Masks, groups, component variants
- Creating/applying shared styles

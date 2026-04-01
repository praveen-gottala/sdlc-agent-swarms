/**
 * Maps a NodeSpec property path + value to CSS style properties
 * for live preview via the iframe bridge's `update-node-style` message.
 *
 * Source of truth: NodeSpec in designspec-renderer/src/types/design-spec-v2.ts
 * and getFlexStyles() in DesignSpecRenderer.tsx.
 */

const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  between: 'space-between',
};

const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

export function propertyToCss(
  path: string,
  value: string | number,
): Record<string, string> {
  switch (path) {
    case 'layout.dir':
      return { flexDirection: String(value) };

    case 'layout.gap':
      return { gap: `${value}px` };

    case 'layout.justify':
      return { justifyContent: JUSTIFY_MAP[String(value)] ?? String(value) };

    case 'layout.align':
      return { alignItems: ALIGN_MAP[String(value)] ?? String(value) };

    case 'layout.px':
      return { paddingLeft: `${value}px`, paddingRight: `${value}px` };

    case 'layout.py':
      return { paddingTop: `${value}px`, paddingBottom: `${value}px` };

    case 'layout.pt':
      return { paddingTop: `${value}px` };

    case 'layout.pb':
      return { paddingBottom: `${value}px` };

    case 'layout.mx':
      return { marginLeft: `${value}px`, marginRight: `${value}px` };

    case 'layout.my':
      return { marginTop: `${value}px`, marginBottom: `${value}px` };

    case 'layout.mt':
      return { marginTop: `${value}px` };

    case 'layout.mb':
      return { marginBottom: `${value}px` };

    case 'layout.ml':
      return { marginLeft: `${value}px` };

    case 'layout.mr':
      return { marginRight: `${value}px` };

    case 'width': {
      const v = String(value);
      if (v === 'fill') return { flex: '1', minWidth: '0' };
      if (v === '' || v === '0') return { width: 'auto', flex: 'none' };
      // If it already has a unit or keyword, use as-is; otherwise append px
      const hasUnit = /[a-z%]$/i.test(v);
      return { width: hasUnit ? v : `${v}px`, flex: 'none' };
    }

    case 'height':
      return { height: value === 0 || value === '' ? 'auto' : `${value}px` };

    case 'background':
      return { backgroundColor: String(value) };

    case 'radius':
      return { borderRadius: `${value}px` };

    case 'color':
      return { color: String(value) };

    case 'typography':
      return {}; // Requires token resolution — skip for live preview

    case 'weight':
      return { fontWeight: String(value) };

    case 'textAlign':
      return { textAlign: String(value) };

    case 'shadow':
      return {}; // Requires token resolution — skip for live preview

    default:
      return {};
  }
}

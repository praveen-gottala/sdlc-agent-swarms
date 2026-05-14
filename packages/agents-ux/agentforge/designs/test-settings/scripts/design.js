// Penpot design script (v2 renderer) for module: test-settings
// Generated at: 2026-05-14T04:47:40.227Z
// Chunks: 1

try {

  // Design token color map (semantic name → hex)
  // Missing tokens resolve to magenta (#FF00FF) for visual debugging
  const T = new Proxy({
    white: '#FFFFFF',
    black: '#000000',
    blue: '#2563EB',
    backgroundPrimary: '#FFFFFF',
    textPrimary: '#000000',
    ctaPrimary: '#2563EB',
  }, {
    get(t, p) { if (p in t) return t[p]; return '#FF00FF'; }
  });

  // Text creation helper — handles sizing, weight, color, and auto-height
  function makeText(content, fontSize, fontWeight, fillColor, opacity, wrapWidth) {
    // penpot.createText("") returns undefined — use a space for empty content
    const textContent = String(content) || ' ';
    const t = penpot.createText(textContent);
    t.fontSize = fontSize;
    t.fontWeight = String(fontWeight);
    t.fills = [{ fillColor: fillColor, fillOpacity: opacity !== undefined ? opacity : 1 }];
    if (wrapWidth && String(content).length > 18) {
      t.resize(wrapWidth, fontSize * 2.2);
      t.growType = 'auto-height';
    }
    return t;
  }

  // Page: root
  const root0 = penpot.createBoard();
  root0.name = 'root';
  root0.resize(1440, 2000);
  root0.fills = [{ fillColor: T.backgroundPrimary, fillOpacity: 1 }];
  root0.x = 0;
  root0.y = 0;
  root0.addFlexLayout();
  root0.flex.dir = 'column';
  root0.flex.rowGap = 0;
  root0.setPluginData('ds_id', 'root');
  root0.setPluginData('ds_type', 'page');
  root0.setPluginData('ds_token_bg', 'background-primary');

  // Header: header
  const hdr1 = penpot.createBoard();
  hdr1.name = 'header';
  hdr1.resize(1440, 64);
  hdr1.fills = [{ fillColor: T.surfacePrimary, fillOpacity: 1 }];
  hdr1.addFlexLayout();
  hdr1.flex.dir = 'row';
  hdr1.flex.alignItems = 'center';
  hdr1.flex.leftPadding = 32;
  hdr1.flex.rightPadding = 32;
  hdr1.flex.topPadding = 16;
  hdr1.flex.bottomPadding = 16;
  root0.appendChild(hdr1);
  hdr1.layoutChild.horizontalSizing = 'fill';
  hdr1.layoutChild.verticalSizing = 'fix';
  hdr1.setPluginData('ds_id', 'header');
  hdr1.setPluginData('ds_type', 'header');

  // Text: header-title
  const txt2 = makeText("Settings", 32, 700, T.textPrimary, 1, 1440);
  txt2.name = 'header-title';
  hdr1.appendChild(txt2);
  txt2.layoutChild.horizontalSizing = 'auto';
  txt2.layoutChild.verticalSizing = 'auto';
  txt2.setPluginData('ds_id', 'header-title');
  txt2.setPluginData('ds_type', 'text');
  txt2.setPluginData('ds_token_text', 'text-primary');

  // Container: content
  const ctr3 = penpot.createBoard();
  ctr3.name = 'content';
  ctr3.resize(600, 100);
  ctr3.fills = [];
  ctr3.addFlexLayout();
  ctr3.flex.dir = 'column';
  ctr3.flex.rowGap = 16;
  ctr3.flex.leftPadding = 32;
  ctr3.flex.rightPadding = 32;
  ctr3.flex.topPadding = 24;
  ctr3.flex.bottomPadding = 24;
  root0.appendChild(ctr3);
  ctr3.layoutChild.horizontalSizing = 'fix';
  ctr3.layoutChild.verticalSizing = 'auto';
  ctr3.setPluginData('ds_id', 'content');
  ctr3.setPluginData('ds_type', 'container');

  // Input: name-input
  const inp4 = penpot.createBoard();
  inp4.name = 'name-input';
  inp4.resize(600, 64);
  inp4.fills = [];
  inp4.addFlexLayout();
  inp4.flex.dir = 'column';
  inp4.flex.rowGap = 4;
  const ilbl5 = makeText("Full Name", 12, 500, T.textSecondary, 1, 600);
  ilbl5.name = 'name-input_label';
  inp4.appendChild(ilbl5);
  ilbl5.layoutChild.horizontalSizing = 'fill';
  const ibox6 = penpot.createBoard();
  ibox6.name = 'name-input_box';
  ibox6.resize(600, 44);
  ibox6.fills = [{ fillColor: T.backgroundPrimary, fillOpacity: 1 }];
  ibox6.addFlexLayout();
  ibox6.flex.dir = 'row';
  ibox6.flex.alignItems = 'center';
  ibox6.flex.columnGap = 4;
  ibox6.flex.leftPadding = 12;
  ibox6.flex.rightPadding = 12;
  ibox6.borderRadius = 8;
  ibox6.strokes = [{ strokeColor: T.borderDefault, strokeOpacity: 1, strokeWidth: 1, strokeAlignment: 'inner' }];
  const iph7 = makeText("Jane Cooper", 14, 400, T.textPrimary, 0.5, 576);
  iph7.name = 'name-input_placeholder';
  ibox6.appendChild(iph7);
  iph7.layoutChild.horizontalSizing = 'fill';
  inp4.appendChild(ibox6);
  ibox6.layoutChild.horizontalSizing = 'fill';
  ctr3.appendChild(inp4);
  inp4.layoutChild.horizontalSizing = 'fill';
  inp4.layoutChild.verticalSizing = 'auto';
  inp4.setPluginData('ds_id', 'name-input');
  inp4.setPluginData('ds_catalog', 'input-text');
  inp4.setPluginData('ds_token_bg', 'background-primary');
  inp4.setPluginData('ds_token_text', 'text-primary');
  inp4.setPluginData('ds_token_border', 'border-default');

  // Button: save-btn
  const btn8 = penpot.createBoard();
  btn8.name = 'save-btn';
  btn8.resize(200, 44);
  btn8.fills = [{ fillColor: T.ctaPrimary, fillOpacity: 1 }];
  btn8.addFlexLayout();
  btn8.flex.dir = 'row';
  btn8.flex.alignItems = 'center';
  btn8.flex.justifyContent = 'center';
  btn8.borderRadius = 8;
  const btxt9 = makeText("Save Changes", 14, 400, T.textOnCta, 1, 200);
  btxt9.name = 'save-btn_label';
  btn8.appendChild(btxt9);
  btxt9.layoutChild.horizontalSizing = 'auto';
  ctr3.appendChild(btn8);
  btn8.layoutChild.horizontalSizing = 'auto';
  btn8.layoutChild.verticalSizing = 'fix';
  btn8.setPluginData('ds_id', 'save-btn');
  btn8.setPluginData('ds_catalog', 'button-primary');
  btn8.setPluginData('ds_token_bg', 'cta-primary');
  btn8.setPluginData('ds_token_text', 'text-on-cta');


  // Auto-resize root frame to fit content (no parent = no layoutChild.verticalSizing)
  {
    const children = root0.children || [];
    let maxBottom = 0;
    for (const child of children) {
      const bottom = (child.y || 0) + (child.height || 0);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    const padding = root0.flex ? (root0.flex.bottomPadding || 0) : 0;
    const fittedHeight = maxBottom + padding + 48;
    if (fittedHeight > 100 && fittedHeight !== root0.height) {
      root0.resize(root0.width, fittedHeight);
    }
  }

  // Return node IDs for downstream reference
  return {
    rootId: root0.id,
    nodeIds: {
      'root': root0.id,
      'header': hdr1.id,
      'header-title': txt2.id,
      'content': ctr3.id,
      'name-input': inp4.id,
      'save-btn': btn8.id,
    }
  };

} catch (e) {
  return { __error: true, message: e.message || String(e), stack: e.stack };
}

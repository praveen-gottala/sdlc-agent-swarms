/**
 * @module @agentforge/cli/design/preview-html
 *
 * Self-contained HTML preview generator for design system options.
 * Generates a multi-tabbed comparison page with color palettes,
 * typography scales, component kitchen sink, and dashboard demo.
 */

import type { DesignOption } from '../commands/generate-design-options.js';
import { DEFAULT_LAYOUT_TOKENS, DEFAULT_OPACITY, DEFAULT_MOTION, DEFAULT_STATE, DEFAULT_PREVIEW, DEFAULT_TYPOGRAPHY_SCALE } from './design-tokens-defaults.js';
import { resolveColor, hexWithOpacity, isLight } from './preview-helpers.js';

/** Generate the self-contained HTML preview for 3 options. */
export function generatePreviewHtml(
  appName: string,
  options: DesignOption[],
): string {
  const fontFamilies = options
    .flatMap((o) => [o.fonts.display, o.fonts.body])
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .map((f) => f.replace(/\s+/g, '+'))
    .join('&family=');

  const themeCssVars = options.map((opt, i) => {
    const bg = resolveColor(opt.colors.semantic['background-primary'], opt.colors.primitive);
    const text = resolveColor(opt.colors.semantic['text-primary'], opt.colors.primitive);
    const cta = resolveColor(opt.colors.semantic['cta-primary'], opt.colors.primitive);
    const errorHex = resolveColor(opt.colors.semantic.error, opt.colors.primitive);
    const surface = resolveColor(opt.colors.semantic['surface-primary'] ?? opt.colors.semantic['background-primary'], opt.colors.primitive);
    const surfaceElevated = resolveColor(opt.colors.semantic['surface-elevated'] ?? opt.colors.semantic['surface-primary'] ?? bg, opt.colors.primitive);
    const surfaceSecondary = resolveColor(opt.colors.semantic['surface-secondary'] ?? surface, opt.colors.primitive);
    const textSecondary = resolveColor(opt.colors.semantic['text-secondary'] ?? text, opt.colors.primitive);
    const borderDefault = resolveColor(opt.colors.semantic['border-default'] ?? textSecondary, opt.colors.primitive);
    const successHex = resolveColor(opt.colors.semantic.success ?? '#16A34A', opt.colors.primitive);
    const warningHex = resolveColor(opt.colors.semantic.warning ?? '#CA8A04', opt.colors.primitive);
    const infoHex = resolveColor(opt.colors.semantic.info ?? cta, opt.colors.primitive);
    const borders = opt.borders ?? DEFAULT_LAYOUT_TOKENS.borders;
    const motion = opt.motion ?? DEFAULT_MOTION;
    const state = opt.state ?? DEFAULT_STATE;
    return `
    [data-theme="${i + 1}"] {
      --bg-primary: ${bg};
      --text-primary: ${text};
      --cta-primary: ${cta};
      --error: ${errorHex};
      --surface: ${surface};
      --surface-elevated: ${surfaceElevated};
      --surface-secondary: ${surfaceSecondary};
      --text-secondary: ${textSecondary};
      --border-default: ${borderDefault};
      --success: ${successHex};
      --warning: ${warningHex};
      --info: ${infoHex};
      --border-sm: ${borders.radius.small}px;
      --border-md: ${borders.radius.medium}px;
      --border-lg: ${borders.radius.large}px;
      --duration-fast: ${motion.durations.fast}ms;
      --duration-normal: ${motion.durations.normal}ms;
      --duration-slow: ${motion.durations.slow}ms;
      --opacity-disabled: ${state.disabled_opacity};
      --font-display: '${opt.fonts.display}', sans-serif;
      --font-body: '${opt.fonts.body}', sans-serif;
    }`;
  }).join('\n');

  const tabs = options.map((opt, i) => {
    const active = i === 0 ? ' active' : '';
    return `<button class="tab${active}" onclick="switchTab(${i + 1})" data-tab="${i + 1}">${opt.label}</button>`;
  }).join('\n          ');

  const panels = options.map((opt, i) => {
    const display = i === 0 ? 'block' : 'none';
    const primitiveEntries = Object.entries(opt.colors.primitive);
    const bg = resolveColor(opt.colors.semantic['background-primary'], opt.colors.primitive);
    const text = resolveColor(opt.colors.semantic['text-primary'], opt.colors.primitive);
    const cta = resolveColor(opt.colors.semantic['cta-primary'], opt.colors.primitive);
    const errorHex = resolveColor(opt.colors.semantic.error, opt.colors.primitive);
    const successHex = resolveColor(opt.colors.semantic.success ?? '#16A34A', opt.colors.primitive);
    const warningHex = resolveColor(opt.colors.semantic.warning ?? '#CA8A04', opt.colors.primitive);
    const infoHex = resolveColor(opt.colors.semantic.info ?? cta, opt.colors.primitive);
    const surfaceElevated = resolveColor(opt.colors.semantic['surface-elevated'] ?? opt.colors.semantic['surface-primary'] ?? bg, opt.colors.primitive);
    const borders = opt.borders ?? DEFAULT_LAYOUT_TOKENS.borders;
    const motion = opt.motion ?? DEFAULT_MOTION;
    const opacity = opt.opacity ?? DEFAULT_OPACITY;
    const state = opt.state ?? DEFAULT_STATE;
    const preview = opt.preview ?? DEFAULT_PREVIEW;

    // Dynamic typography scale
    const typoScale = opt.typography_scale ?? [...DEFAULT_TYPOGRAPHY_SCALE];
    const typeRows = typoScale.map(entry => {
      const fontFamily = entry.family === 'display' ? 'var(--font-display)' : 'var(--font-body)';
      const fontName = entry.family === 'display' ? opt.fonts.display : opt.fonts.body;
      const sampleText = entry.role.startsWith('heading') ? `Heading ${entry.role.split('-')[1]}`
        : entry.role === 'body' ? 'Body text — The quick brown fox jumps over the lazy dog'
          : entry.role === 'label' ? 'Label text'
            : 'Small / caption text';
      const opacityStyle = entry.role === 'small' ? ';opacity:0.7' : '';
      return `<div class="type-row"><span style="font-family:${fontFamily};font-size:${entry.size}px;font-weight:${entry.weight};color:var(--text-primary)${opacityStyle}">${sampleText}</span><span class="type-meta">${entry.size}px / ${entry.weight} / ${fontName}</span></div>`;
    }).join('\n            ');

    // Dynamic stat cards from preview
    const statCards = preview.metrics.slice(0, 3).map((m: { label: string; value: string; trend?: string }) => {
      const trendColor = m.trend?.startsWith('+') ? 'var(--success)' : 'var(--error)';
      return `
                <div class="stat-card" style="background:var(--surface-elevated);padding:20px;border-radius:var(--border-lg)">
                  <div style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:4px">${m.label}</div>
                  <div style="font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--text-primary)">${m.value}</div>
                  ${m.trend ? `<div style="font-family:var(--font-body);font-size:11px;color:${trendColor};margin-top:4px">${m.trend}</div>` : ''}
                </div>`;
    }).join('');

    // Dynamic table rows from preview
    const tableRows = (preview.table_rows ?? DEFAULT_PREVIEW.table_rows!).map((row: { name: string; status: string; amount: string; date: string }, ri: number) => {
      const statusLower = row.status.toLowerCase();
      let badgeBg: string, badgeColor: string;
      if (statusLower === 'active' || statusLower === 'completed' || statusLower === 'done') {
        badgeBg = hexWithOpacity(successHex, 0.15); badgeColor = successHex;
      } else if (statusLower === 'pending' || statusLower === 'in progress' || statusLower === 'waiting') {
        badgeBg = hexWithOpacity(warningHex, 0.15); badgeColor = warningHex;
      } else if (statusLower === 'inactive' || statusLower === 'error' || statusLower === 'failed' || statusLower === 'cancelled') {
        badgeBg = hexWithOpacity(errorHex, 0.15); badgeColor = errorHex;
      } else {
        badgeBg = hexWithOpacity(infoHex, 0.15); badgeColor = infoHex;
      }
      const altBg = ri % 2 === 1 ? `background:var(--surface-secondary);` : '';
      const borderStyle = ri < (preview.table_rows ?? DEFAULT_PREVIEW.table_rows!).length - 1 ? `border-bottom:1px solid var(--border-default);` : '';
      return `
                    <tr style="${altBg}${borderStyle}">
                      <td style="padding:12px 16px;color:var(--text-primary)">${row.name}</td>
                      <td style="padding:12px 16px"><span style="background:${badgeBg};color:${badgeColor};padding:2px 8px;border-radius:9999px;font-size:11px">${row.status}</span></td>
                      <td style="padding:12px 16px;text-align:right;color:var(--text-primary)">${row.amount}</td>
                      <td style="padding:12px 16px;text-align:right;color:var(--text-secondary)">${row.date}</td>
                    </tr>`;
    }).join('');

    // Dynamic nav items from preview
    const navItems = (preview.nav_items ?? DEFAULT_PREVIEW.nav_items!).map((item: string, ni: number) => {
      if (ni === 0) {
        return `<div class="nav-item active-nav" style="color:${bg};font-family:var(--font-body);font-size:13px;padding:8px 12px;border-radius:var(--border-sm);background:rgba(255,255,255,0.1)">${item}</div>`;
      }
      return `<div class="nav-item" style="color:${bg};opacity:0.6;font-family:var(--font-body);font-size:13px;padding:8px 12px;border-radius:var(--border-sm)">${item}</div>`;
    }).join('\n              ');

    // Border radius showcase
    const borderRadiusSection = `<div class="section">
          <h3 class="section-title">Border Radius</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">
            <div style="width:80px;height:80px;background:var(--cta-primary);border-radius:${borders.radius.small}px;display:flex;align-items:center;justify-content:center">
              <span style="font-family:var(--font-body);font-size:11px;color:${isLight(cta) ? '#111' : '#fff'}">sm: ${borders.radius.small}px</span>
            </div>
            <div style="width:80px;height:80px;background:var(--cta-primary);border-radius:${borders.radius.medium}px;display:flex;align-items:center;justify-content:center">
              <span style="font-family:var(--font-body);font-size:11px;color:${isLight(cta) ? '#111' : '#fff'}">md: ${borders.radius.medium}px</span>
            </div>
            <div style="width:80px;height:80px;background:var(--cta-primary);border-radius:${borders.radius.large}px;display:flex;align-items:center;justify-content:center">
              <span style="font-family:var(--font-body);font-size:11px;color:${isLight(cta) ? '#111' : '#fff'}">lg: ${borders.radius.large}px</span>
            </div>
            <div style="width:80px;height:80px;background:var(--cta-primary);border-radius:${borders.radius.pill}px;display:flex;align-items:center;justify-content:center">
              <span style="font-family:var(--font-body);font-size:11px;color:${isLight(cta) ? '#111' : '#fff'}">pill</span>
            </div>
          </div>
        </div>`;

    // Motion timing strip
    const motionSection = `<div class="section">
          <h3 class="section-title">Motion</h3>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-family:var(--font-body);font-size:12px;color:var(--text-secondary);width:100px">fast (${motion.durations.fast}ms)</span>
              <div style="height:8px;width:${Math.max(20, motion.durations.fast / 2)}px;background:var(--cta-primary);border-radius:4px"></div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-family:var(--font-body);font-size:12px;color:var(--text-secondary);width:100px">normal (${motion.durations.normal}ms)</span>
              <div style="height:8px;width:${Math.max(20, motion.durations.normal / 2)}px;background:var(--cta-primary);border-radius:4px"></div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-family:var(--font-body);font-size:12px;color:var(--text-secondary);width:100px">slow (${motion.durations.slow}ms)</span>
              <div style="height:8px;width:${Math.max(20, motion.durations.slow / 2)}px;background:var(--cta-primary);border-radius:4px"></div>
            </div>
            <div style="font-family:var(--font-body);font-size:11px;color:var(--text-secondary);margin-top:4px">Easing: ${motion.easings.default} · Emphasized: ${motion.easings.emphasized}</div>
          </div>
        </div>`;

    // Opacity scale showcase
    const opacitySection = `<div class="section">
          <h3 class="section-title">Opacity Scale</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${Object.entries(opacity.scale).map(([name, val]) => `
              <div style="width:80px;height:80px;background:${hexWithOpacity(text, val as number)};border-radius:var(--border-md);display:flex;align-items:center;justify-content:center">
                <span style="font-family:var(--font-body);font-size:11px;color:${isLight(bg) ? '#111' : '#fff'}">${name}<br>${val}</span>
              </div>
            `).join('')}
          </div>
        </div>`;

    return `
      <div class="panel" id="panel-${i + 1}" style="display:${display}" data-theme="${i + 1}">
        <!-- Section 1: Theme Identity -->
        <div class="section">
          <h2 style="font-family:var(--font-display);color:var(--text-primary);font-size:28px;font-weight:700;margin:0 0 8px">${opt.label}</h2>
          <p style="font-family:var(--font-body);color:var(--text-secondary);font-size:16px;margin:0 0 12px">${opt.vibe}</p>
          <span class="badge" style="background:var(--cta-primary);color:${isLight(cta) ? '#111' : '#fff'};padding:4px 12px;border-radius:9999px;font-size:12px;font-family:var(--font-body)">${opt.brand.tone}</span>
        </div>

        <!-- Section 2: Color Palette -->
        <div class="section">
          <h3 class="section-title">Color Palette</h3>
          <div class="swatch-strip">
            ${primitiveEntries.map(([, hex]) => `<div class="swatch-segment" style="background:${hex}"></div>`).join('')}
          </div>
          <div class="swatch-labels">
            ${primitiveEntries.map(([name, hex]) => `
              <div class="swatch-label-item">
                <div class="swatch-label">${name}</div>
                <div class="swatch-hex">${hex}</div>
              </div>
            `).join('')}
          </div>
          <div class="semantic-row" style="margin-top:16px">
            <div class="semantic-chip" style="background:${bg};color:${text};border:1px solid var(--border-default)">Background</div>
            <div class="semantic-chip" style="background:${text};color:${bg}">Text</div>
            <div class="semantic-chip" style="background:${cta};color:${isLight(cta) ? '#111' : '#fff'}">CTA</div>
            <div class="semantic-chip" style="background:${errorHex};color:#fff">Error</div>
            <div class="semantic-chip" style="background:${successHex};color:#fff">Success</div>
            <div class="semantic-chip" style="background:${warningHex};color:#fff">Warning</div>
            <div class="semantic-chip" style="background:${infoHex};color:${isLight(infoHex) ? '#111' : '#fff'}">Info</div>
          </div>
          <div class="semantic-row" style="margin-top:8px">
            ${opt.colors.semantic['surface-primary'] ? `<div class="semantic-chip" style="background:${resolveColor(opt.colors.semantic['surface-primary'], opt.colors.primitive)};color:${text};border:1px solid var(--border-default)">Surface</div>` : ''}
            ${opt.colors.semantic['surface-elevated'] ? `<div class="semantic-chip" style="background:${surfaceElevated};color:${text};border:1px solid var(--border-default)">Elevated</div>` : ''}
            ${opt.colors.semantic['text-on-cta'] ? `<div class="semantic-chip" style="background:${cta};color:${resolveColor(opt.colors.semantic['text-on-cta'], opt.colors.primitive)}">Text on CTA</div>` : ''}
            ${opt.colors.semantic['cta-hover'] ? `<div class="semantic-chip" style="background:${resolveColor(opt.colors.semantic['cta-hover'], opt.colors.primitive)};color:${isLight(resolveColor(opt.colors.semantic['cta-hover'], opt.colors.primitive)) ? '#111' : '#fff'}">CTA Hover</div>` : ''}
            ${opt.colors.semantic['border-focus'] ? `<div class="semantic-chip" style="border:2px solid ${resolveColor(opt.colors.semantic['border-focus'], opt.colors.primitive)};color:${text}">Focus</div>` : ''}
            ${opt.colors.semantic['overlay'] ? `<div class="semantic-chip" style="background:${opt.colors.semantic['overlay']};color:#fff">Overlay</div>` : ''}
          </div>
        </div>

        <!-- Section: Elevation -->
        ${opt.elevation ? `<div class="section">
          <h3 class="section-title">Elevation</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${opt.elevation.levels.map((l) => `
              <div style="width:140px;height:100px;background:var(--bg-primary);border-radius:var(--border-lg);display:flex;align-items:center;justify-content:center;box-shadow:${l.shadow};border:${l.shadow === 'none' ? '1px solid var(--border-default)' : 'none'}">
                <div style="text-align:center">
                  <div style="font-family:var(--font-body);font-size:12px;font-weight:600;color:var(--text-primary)">Level ${l.level}</div>
                  <div style="font-family:var(--font-body);font-size:10px;color:var(--text-secondary)">${l.description}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <!-- Section: Border Radius -->
        ${borderRadiusSection}

        <!-- Section: Motion -->
        ${motionSection}

        <!-- Section: Opacity Scale -->
        ${opacitySection}

        <!-- Section 3: Typography Scale -->
        <div class="section">
          <h3 class="section-title">Typography Scale</h3>
          <div class="type-ladder">
            ${typeRows}
          </div>
          <div class="font-pairing" style="margin-top:24px;padding:24px;background:var(--bg-primary);border-radius:var(--border-lg);border:1px solid var(--border-default)">
            <h4 style="font-family:var(--font-display);font-size:24px;font-weight:700;color:var(--text-primary);margin:0 0 8px">Font Pairing Demo</h4>
            <p style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.6;margin:0">This paragraph demonstrates how ${opt.fonts.display} (display) and ${opt.fonts.body} (body) work together. Good font pairing creates visual hierarchy while maintaining readability across all screen sizes.</p>
          </div>
        </div>

        <!-- Section 4: Component Kitchen Sink -->
        <div class="section">
          <h3 class="section-title">Components</h3>
          <div class="component-row">
            <button class="demo-btn" style="background:var(--cta-primary);color:${isLight(cta) ? '#111' : '#fff'};border:none;padding:10px 24px;border-radius:var(--border-sm);font-family:var(--font-body);font-size:14px;font-weight:500;cursor:pointer">Primary</button>
            <button class="demo-btn" style="background:transparent;color:var(--cta-primary);border:2px solid var(--cta-primary);padding:8px 22px;border-radius:var(--border-sm);font-family:var(--font-body);font-size:14px;font-weight:500;cursor:pointer">Secondary</button>
            <button class="demo-btn" style="background:var(--surface-secondary);color:var(--text-secondary);border:none;padding:10px 24px;border-radius:var(--border-sm);font-family:var(--font-body);font-size:14px;font-weight:500;cursor:not-allowed;opacity:var(--opacity-disabled)" disabled>Disabled</button>
            <button class="demo-btn" style="background:var(--cta-primary);color:${isLight(cta) ? '#111' : '#fff'};border:none;padding:10px 24px;border-radius:var(--border-sm);font-family:var(--font-body);font-size:14px;font-weight:500;outline:${state.focus_ring.width}px solid var(--cta-primary);outline-offset:${state.focus_ring.offset}px">Focus</button>
          </div>
          <div class="form-group" style="margin-top:20px;max-width:360px">
            <label style="font-family:var(--font-body);font-size:12px;font-weight:500;color:var(--text-primary);display:block;margin-bottom:4px">Email Address</label>
            <input type="text" value="user@example.com" style="width:100%;padding:10px 12px;border:1px solid var(--border-default);border-radius:var(--border-sm);font-family:var(--font-body);font-size:14px;color:var(--text-primary);box-sizing:border-box" readonly>
            <span style="font-family:var(--font-body);font-size:11px;color:var(--text-secondary);margin-top:4px;display:block">We'll never share your email</span>
          </div>
          <div class="alerts-row" style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="alert-badge" style="background:${hexWithOpacity(successHex, 0.15)};color:${successHex};padding:4px 12px;border-radius:var(--border-sm);font-size:12px;font-family:var(--font-body)">Success</span>
            <span class="alert-badge" style="background:${hexWithOpacity(warningHex, 0.15)};color:${warningHex};padding:4px 12px;border-radius:var(--border-sm);font-size:12px;font-family:var(--font-body)">Warning</span>
            <span class="alert-badge" style="background:${hexWithOpacity(errorHex, 0.15)};color:${errorHex};padding:4px 12px;border-radius:var(--border-sm);font-size:12px;font-family:var(--font-body)">Error</span>
            <span class="alert-badge" style="background:${hexWithOpacity(infoHex, 0.15)};color:${infoHex};padding:4px 12px;border-radius:var(--border-sm);font-size:12px;font-family:var(--font-body)">Info</span>
          </div>
        </div>

        <!-- Section 5: Mini Dashboard Demo -->
        <div class="section">
          <h3 class="section-title">Dashboard Preview</h3>
          <div class="dashboard-demo" style="border:1px solid var(--border-default);border-radius:var(--border-lg);overflow:hidden;display:grid;grid-template-columns:200px 1fr;min-height:400px">
            <!-- Sidebar -->
            <div class="dash-sidebar" style="background:var(--text-primary);padding:24px 16px;display:flex;flex-direction:column;gap:4px">
              <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${bg};margin-bottom:16px">${appName || 'App'}</div>
              ${navItems}
            </div>
            <!-- Main content -->
            <div class="dash-main" style="background:var(--bg-primary);padding:24px">
              <!-- Stat cards -->
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
                ${statCards}
              </div>
              <!-- Data table -->
              <div style="background:var(--surface-elevated);border-radius:var(--border-lg);overflow:hidden">
                <table style="width:100%;border-collapse:collapse;font-family:var(--font-body);font-size:13px">
                  <thead>
                    <tr style="border-bottom:1px solid var(--border-default)">
                      <th style="text-align:left;padding:12px 16px;color:var(--text-secondary);font-weight:500;font-size:11px">Name</th>
                      <th style="text-align:left;padding:12px 16px;color:var(--text-secondary);font-weight:500;font-size:11px">Status</th>
                      <th style="text-align:right;padding:12px 16px;color:var(--text-secondary);font-weight:500;font-size:11px">Amount</th>
                      <th style="text-align:right;padding:12px 16px;color:var(--text-secondary);font-weight:500;font-size:11px">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('\n');

  const compareStrip = options.map((opt, i) => {
    const dots = Object.values(opt.colors.primitive)
      .map((hex) => `<span class="dot" style="background:${hex}"></span>`)
      .join('');
    return `
          <div class="compare-item" onclick="switchTab(${i + 1})" style="cursor:pointer">
            <div class="compare-label">${opt.label}</div>
            <div class="compare-dots">${dots}</div>
            <div class="compare-fonts">${opt.fonts.display} / ${opt.fonts.body}</div>
            <div class="compare-tone">${opt.brand.tone}</div>
          </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Design System Preview — ${appName || 'Your App'}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${fontFamilies}&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fa; color: #333; min-width: 1024px; }
    .header { text-align: center; padding: 40px 24px 24px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .header p { font-size: 16px; color: #666; }
    .tabs { display: flex; gap: 8px; justify-content: center; padding: 0 24px 24px; }
    .tab { padding: 10px 28px; border-radius: 9999px; border: 2px solid #ddd; background: #fff; font-size: 14px; font-weight: 500; cursor: pointer; transition: all .2s; }
    .tab.active { background: #111; color: #fff; border-color: #111; }
    .tab:hover:not(.active) { border-color: #999; }
    .content { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .section { margin-bottom: 32px; padding: 24px; background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #555; }
    .swatch-strip { display: flex; border-radius: 10px; overflow: hidden; height: 56px; }
    .swatch-segment { flex: 1; }
    .swatch-labels { display: flex; margin-top: 8px; }
    .swatch-label-item { flex: 1; text-align: center; }
    .swatch-label { font-size: 11px; font-weight: 500; color: #555; }
    .swatch-hex { font-size: 10px; color: #999; font-family: monospace; }
    .semantic-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .semantic-chip { padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 500; }
    .type-ladder { display: flex; flex-direction: column; gap: 12px; }
    .type-row { display: flex; align-items: baseline; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .type-meta { font-size: 11px; color: #999; font-family: monospace; white-space: nowrap; margin-left: 16px; }
    .component-row { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    .compare-strip { max-width: 1200px; margin: 24px auto; padding: 20px 24px; background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); display: grid; grid-template-columns: repeat(${options.length}, 1fr); gap: 24px; }
    .compare-item { text-align: center; padding: 16px; border-radius: 12px; transition: background .2s; }
    .compare-item:hover { background: #f5f5f5; }
    .compare-label { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .compare-dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 8px; }
    .dot { width: 20px; height: 20px; border-radius: 50%; border: 1px solid #ddd; display: inline-block; }
    .compare-fonts { font-size: 11px; color: #888; margin-bottom: 4px; }
    .compare-tone { font-size: 11px; color: #aaa; font-style: italic; }
    .footer { text-align: center; padding: 32px; color: #888; font-size: 14px; }
    .footer strong { color: #333; }
${themeCssVars}
  </style>
</head>
<body>
  <div class="header">
    <h1>Design System Preview — ${appName || 'Your App'}</h1>
    <p>Choose the design direction for your app</p>
  </div>

  <div class="tabs">
    ${tabs}
  </div>

  <div class="content">
    ${panels}
  </div>

  <div class="compare-strip">
    ${compareStrip}
  </div>

  <div class="footer">
    Return to your terminal and type ${options.map((_, i) => `<strong>${i + 1}</strong>`).join(', ')}
  </div>

  <script>
    function switchTab(n) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab == n));
      document.querySelectorAll('.panel').forEach(p => p.style.display = p.id === 'panel-' + n ? 'block' : 'none');
    }
  </script>
</body>
</html>`;
}

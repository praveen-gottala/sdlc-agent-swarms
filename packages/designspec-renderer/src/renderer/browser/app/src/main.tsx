import './globals.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { generateCssVariables } from './generate-css-variables';
import { DesignSpecRenderer } from './DesignSpecRenderer';

async function main() {
  const [tokens, spec, catalog] = await Promise.all([
    fetch('./data/tokens.json').then(r => r.json()),
    fetch('./data/spec.json').then(r => r.json()),
    fetch('./data/catalog.json').then(r => r.json()),
  ]);

  // Inject CSS vars BEFORE React renders
  const cssVars = generateCssVariables(tokens);
  const style = document.createElement('style');
  style.textContent = cssVars;
  document.head.appendChild(style);

  // Render React — dataset.ready is set inside DesignSpecRenderer via useEffect
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<DesignSpecRenderer spec={spec} tokens={tokens} catalog={catalog} />);
}

main();

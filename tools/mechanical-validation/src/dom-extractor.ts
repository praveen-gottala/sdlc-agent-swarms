import { chromium, Browser, Page } from "playwright";
import { writeFile } from "fs/promises";
import { DOMNodeData } from "./types.js";

let browser: Browser | null = null;

export async function launchBrowser(): Promise<void> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export interface ExtractionResult {
  domData: DOMNodeData[];
  screenshotPath: string;
}

export async function extractDOM(
  htmlPath: string,
  screenshotPath: string,
  viewportWidth: number = 1440
): Promise<ExtractionResult> {
  if (!browser) throw new Error("Browser not launched — call launchBrowser() first");

  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await page.goto(`file://${htmlPath}`, { waitUntil: "domcontentloaded" });

    // Wait for the ready signal (max 5s)
    await page.waitForFunction(
      () => (window as unknown as Record<string, boolean>).__DESIGNSPEC_READY__ === true,
      { timeout: 5000 }
    ).catch(() => {
      // If signal never fires, proceed anyway — layout is still computed
    });

    // Give fonts a moment to load
    await page.waitForTimeout(500);

    // Extract computed layout for every [data-node] element
    const domData: DOMNodeData[] = await page.evaluate(() => {
      const elements = document.querySelectorAll("[data-node]");
      const results: DOMNodeData[] = [];

      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        const computed = window.getComputedStyle(htmlEl);

        // Find parent data-node
        let parentNodeId: string | null = null;
        let ancestor = htmlEl.parentElement;
        while (ancestor) {
          if (ancestor.hasAttribute("data-node")) {
            parentNodeId = ancestor.getAttribute("data-node");
            break;
          }
          ancestor = ancestor.parentElement;
        }

        results.push({
          nodeId: htmlEl.getAttribute("data-node") ?? "",
          tagName: htmlEl.tagName.toLowerCase(),
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
          },
          scrollWidth: htmlEl.scrollWidth,
          scrollHeight: htmlEl.scrollHeight,
          clientWidth: htmlEl.clientWidth,
          clientHeight: htmlEl.clientHeight,
          computedStyles: {
            display: computed.display,
            flexDirection: computed.flexDirection,
            overflow: computed.overflow,
            visibility: computed.visibility,
          },
          textContent: htmlEl.textContent?.trim().slice(0, 200) ?? "",
          childCount: htmlEl.querySelectorAll(":scope > [data-node]").length,
          parentNodeId,
          dataCatalog: htmlEl.getAttribute("data-catalog"),
        });
      }

      return results;
    });

    // Take full-page screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return { domData, screenshotPath };
  } finally {
    await page.close();
  }
}

/** Run on a normal development machine after npm run build and playwright install chromium. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";

const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const target = resolve(
    root,
    "." + (pathname === "/" ? "/index.html" : pathname),
  );
  if (!target.startsWith(root + "/")) {
    response.writeHead(403).end();
    return;
  }
  try {
    const contents = await readFile(target);
    response
      .writeHead(200, {
        "Content-Type": types[extname(target)] || "application/octet-stream",
      })
      .end(contents);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(4175, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch();
  await mkdir("test-results", { recursive: true });
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
    { width: 320, height: 667 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 700,
      hasTouch: viewport.width < 700,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4175");
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page
      .getByRole("button", { name: /Аудитория, корпус или место/ })
      .click();
    await page.getByRole("dialog").getByRole("textbox").fill("A421");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /А421/ })
      .click();
    await page
      .getByRole("button", { name: "Маршрут сюда", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Построить маршрут", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Начать путь", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Следующий шаг", exact: true })
      .click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "Page must not scroll horizontally");
    await page.screenshot({ path: `test-results/route-${viewport.width}.png` });
    // Exercise the actual WebGL renderer or its visible fallback, rather than a DOM mock.
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page
      .locator(".map3d-host canvas, .map-fallback button")
      .first()
      .waitFor();
    await page.screenshot({ path: `test-results/3d-${viewport.width}.png` });
    const navigation = page.locator(
      viewport.width < 700 ? ".mobile-nav" : ".desktop-nav",
    );
    await navigation
      .getByRole("button", { name: "Настройки", exact: true })
      .click();
    await page.getByRole("button", { name: "English", exact: true }).click();
    await page
      .locator(".theme-picker")
      .getByRole("button", { name: "Dark", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/settings-${viewport.width}.png`,
    });
    assert.deepEqual(errors, [], "No uncaught browser errors");
    await context.close();
  }
  console.log(
    "Browser flows passed; review images in test-results on the development machine.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

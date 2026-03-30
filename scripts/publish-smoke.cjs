const { chromium } = require("playwright-core");

async function main() {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();

  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  const bagLinkText = await page
    .getByRole("link", { name: /Bag \(/ })
    .textContent();
  const expandVisible = await page.getByRole("button", { name: "Expand" }).count();
  const debugVisible = await page.getByText("Session internals").count();

  await page.goto("http://127.0.0.1:3000/search?q=white%20tshirt", {
    waitUntil: "networkidle",
  });
  const searchPreview = await page.locator("main h3").evaluateAll((nodes) =>
    nodes.slice(0, 3).map((node) => node.textContent?.trim() ?? ""),
  );
  await page.getByRole("button", { name: /^Open / }).first().click();
  await page.waitForTimeout(800);
  const productUrl = page.url();
  const sizeCount = await page
    .locator(
      "button:has-text('XS'), button:has-text('S'), button:has-text('M'), button:has-text('L'), button:has-text('XL')",
    )
    .count();

  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByRole("link", { name: /Bag \(/ }).click();
  await page.waitForURL(/\/bag/);
  const bagHeadings = await page.locator("main h2").evaluateAll((nodes) =>
    nodes.slice(0, 5).map((node) => node.textContent?.trim() ?? ""),
  );

  await page.goto(productUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Buy now" }).click();
  await page.waitForURL(/\/checkout\?/);
  const checkoutUrl = page.url();
  const checkoutHeading = await page.locator("main h1").first().textContent();

  console.log(
    JSON.stringify(
      {
        bagLinkText,
        expandVisible,
        debugVisible,
        searchPreview,
        productUrl,
        sizeCount,
        bagHeadings,
        checkoutUrl,
        checkoutHeading,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

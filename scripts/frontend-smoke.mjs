import process from "node:process";
import { chromium } from "playwright-core";

const BASE_URL = process.env.FRONTEND_SMOKE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HEADLESS = process.env.FRONTEND_SMOKE_HEADLESS !== "false";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getStatusClassName(page) {
  return page.locator("header button", { hasText: "Start session" }).locator("xpath=../span").evaluate((node) =>
    node instanceof HTMLElement ? node.className : "",
  );
}

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: HEADLESS,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
  ],
});

const context = await browser.newContext({
  permissions: ["microphone"],
});

const page = await context.newPage();
const consoleMessages = [];
const pageErrors = [];
const requestLog = [];
const websocketLog = [];

await context.addInitScript(() => {
  const mediaDevices = navigator.mediaDevices ?? {};
  const originalGetUserMedia = mediaDevices.getUserMedia?.bind(mediaDevices);

  navigator.mediaDevices = mediaDevices;
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!constraints?.audio && originalGetUserMedia) {
      return originalGetUserMedia(constraints);
    }

    const AudioContextCtor =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextCtor) {
      throw new Error("AudioContext is unavailable in this browser.");
    }

    const audioContext = new AudioContextCtor();
    await audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    oscillator.type = "sine";
    oscillator.frequency.value = 220;
    gain.gain.value = 0.0001;

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start();

    window.__smokeMicResources = window.__smokeMicResources ?? [];
    window.__smokeMicResources.push({
      audioContext,
      oscillator,
      gain,
      destination,
    });

    return destination.stream;
  };
});

page.on("console", (message) => {
  const text = message.text();

  if (
    text.includes("Ephemeral token support is experimental") ||
    text.includes("Download the React DevTools")
  ) {
    return;
  }

  consoleMessages.push({
    type: message.type(),
    text,
  });
});

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

page.on("requestfinished", async (request) => {
  if (!request.url().includes("/api/live-token")) {
    return;
  }

  const response = await request.response();
  requestLog.push({
    url: request.url(),
    method: request.method(),
    status: response?.status() ?? null,
  });
});

page.on("websocket", (websocket) => {
  const entry = {
    url: websocket.url(),
    events: ["created"],
    framesSent: 0,
    framesReceived: 0,
    setupCompleteSeen: false,
    firstTextFrames: [],
  };

  websocket.on("close", () => {
    entry.events.push("close");
  });

  websocket.on("socketerror", (error) => {
    entry.events.push(`socketerror:${error}`);
  });

  websocket.on("framesent", (event) => {
    entry.framesSent += 1;

    if (
      typeof event.payload === "string" &&
      entry.firstTextFrames.length < 3
    ) {
      entry.firstTextFrames.push({
        direction: "sent",
        payload: event.payload.slice(0, 240),
      });
    }
  });

  websocket.on("framereceived", (event) => {
    entry.framesReceived += 1;

    if (
      typeof event.payload === "string" &&
      entry.firstTextFrames.length < 3
    ) {
      entry.firstTextFrames.push({
        direction: "received",
        payload: event.payload.slice(0, 240),
      });
    }

    if (
      typeof event.payload === "string" &&
      event.payload.includes("setupComplete")
    ) {
      entry.setupCompleteSeen = true;
    }
  });

  websocketLog.push(entry);
});

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  const mediaPreflight = await page.evaluate(async () => {
    const hasMediaDevices = Boolean(navigator.mediaDevices);
    const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);

    if (!hasGetUserMedia) {
      return {
        hasMediaDevices,
        hasGetUserMedia,
        getUserMediaResult: "missing",
      };
    }

    const result = await Promise.race([
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          return "resolved";
        })
        .catch((error) => `rejected:${error?.name ?? "unknown"}`),
      new Promise((resolve) =>
        window.setTimeout(() => resolve("timeout"), 3000),
      ),
    ]);

    return {
      hasMediaDevices,
      hasGetUserMedia,
      getUserMediaResult: result,
    };
  });

  await page.waitForSelector("text=Maison Aural");
  await page.waitForSelector("text=Featured");
  await page.screenshot({ path: "/tmp/audio-ecommerce-home.png", fullPage: true });

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Search", exact: true })
    .click();
  await page.waitForURL(`${BASE_URL}/search`);
  await page.waitForSelector("h1:text('Search')");

  const searchInput = page.getByPlaceholder("White t-shirts, laptops, speakers...");
  await searchInput.fill("shirt");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/\/search\?q=shirt/);
  await page.waitForFunction(() => {
    const headings = Array.from(document.querySelectorAll('main a[href^="/product/"] h3'));
    return headings.some((heading) => /shirt/i.test(heading.textContent ?? ""));
  });

  const productCards = page.locator('main a[href^="/product/"]');
  const productCardCount = await productCards.count();
  assert(productCardCount > 0, "Search page returned no product cards.");

  const firstProductLink = productCards.first();
  const firstProductName = (await firstProductLink.textContent())?.trim() ?? "";
  assert(firstProductName.length > 0, "First product card did not render a link.");
  const searchUrl = page.url();
  const searchResultsPreview = await page
    .locator('main a[href^="/product/"] h3')
    .evaluateAll((headings) =>
      headings.slice(0, 3).map((heading) => heading.textContent?.trim() ?? ""),
    );

  await firstProductLink.click();
  await page.waitForURL(/\/product\//);
  await page.waitForSelector("text=Add to bag");
  await page.screenshot({ path: "/tmp/audio-ecommerce-product.png", fullPage: true });

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await page.waitForURL(BASE_URL);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Start session" }).click();
  const statusSnapshots = [];

  for (let index = 0; index < 10; index += 1) {
    await page.waitForTimeout(1000);
    statusSnapshots.push({
      second: index + 1,
      statusClassName: await getStatusClassName(page),
    });
  }

  const statusClassName = await getStatusClassName(page);
  const errorLine = page.locator("header p").filter({ hasText: /.+/ }).last();
  const errorText =
    (await errorLine.isVisible().catch(() => false))
      ? ((await errorLine.textContent())?.trim() ?? "")
      : "";

  const hasClosedSocketWarning = consoleMessages.some((message) =>
    message.text.includes("WebSocket is already in CLOSING or CLOSED state"),
  );
  const hasConnectionError = pageErrors.length > 0;

  console.log(
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        headless: HEADLESS,
        mediaPreflight,
        searchUrl,
        searchResultsPreview,
        firstProductName,
        statusClassName,
        errorText,
        requestLog,
        websocketLog,
        statusSnapshots,
        consoleMessages,
        pageErrors,
      },
      null,
      2,
    ),
  );

  assert(
    !hasClosedSocketWarning,
    "Browser console still reported a closed WebSocket send.",
  );
  assert(!hasConnectionError, "The page raised an uncaught browser error.");
  assert(
    !statusClassName.includes("statuserror"),
    "Voice session fell into the error state during the smoke test.",
  );
  assert(
    !statusClassName.includes("statusconnecting"),
    "Voice session stayed stuck in connecting during the smoke test.",
  );

  await page.getByRole("button", { name: "Stop" }).click();
  await page.waitForTimeout(500);
} finally {
  await context.close();
  await browser.close();
}

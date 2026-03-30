# Audio Commerce Live

Voice-first ecommerce demo built with Next.js and Gemini Live. The homepage shows a start/stop session bar, featured recommendations, a searchable 50-product catalog across fashion and electronics, a live transcript, and a product detail panel that can be driven by either clicks or voice commands.

## What it does

- Starts and stops a Gemini Live audio session from the sticky top bar.
- Streams microphone audio to `gemini-3.1-flash-live-preview`.
- Shows live user and assistant captions plus a running transcript.
- Uses Gemini Live synchronous function tools to:
  - search the catalog
  - refine the current result set
  - open a product by result index
  - explain a product attribute or shopping term
  - stop the session
- Keeps manual filters and voice actions synchronized.
- Seeds the catalog with 50 live sample products from DummyJSON with a local generated fallback if the sample feed is unavailable.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Put the Gemini API key in `.env.local`:

```bash
GEMINI_API_KEY="your-key-here"
```

3. Start the app:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## Gemini Live notes

- Model: `gemini-3.1-flash-live-preview`
- Auth path: server-minted ephemeral token from `src/app/api/live-token/route.ts`
- API version for token minting and browser connect: `v1alpha`
- Input audio is converted to raw 16-bit PCM at 16kHz before sending.
- Output audio is decoded from raw 16-bit PCM at 24kHz for browser playback.
- Session resumption and context-window compression are enabled in the client connect config.

## Project structure

- `src/components/audio-commerce-app.tsx`: main storefront UI and Gemini Live client loop
- `src/app/api/live-token/route.ts`: ephemeral token minting route
- `src/lib/catalog.ts`: 50-product sample catalog loader and fallback generator
- `src/lib/search.ts`: search and filter ranking utilities
- `src/lib/live-tools.ts`: Gemini Live model config and tool declarations
- `src/lib/audio-utils.ts`: PCM encode/decode helpers
- `mockups/`: static HTML/CSS snapshot from the design phase

## Commands

```bash
npm run dev
npm run lint
npm run build
```

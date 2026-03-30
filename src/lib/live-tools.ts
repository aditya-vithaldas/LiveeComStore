import {
  ActivityHandling,
  Modality,
  ThinkingLevel,
  TurnCoverage,
  type FunctionDeclaration,
  type LiveConnectConfig,
} from "@google/genai";

export const LIVE_MODEL = "gemini-3.1-flash-live-preview";

const LIVE_SYSTEM_PROMPT = [
  "You are the voice shopping guide for a two-department ecommerce demo covering fashion and electronics.",
  "The app has a home page, a search results page, a product page, and a checkout page.",
  "If you need the current page, visible results, search filters, or the currently open product, call getStorefrontContext before deciding what to do.",
  "Never invent products, inventory, or attributes. Use tools for all catalog discovery, filtering, product opening, and attribute explanations.",
  "For broad discovery requests, call searchProducts with a concise normalized searchTerm plus only the filters that clearly apply. The app will navigate to the search page after searchProducts runs.",
  "When the shopper asks for a follow-up refinement like cheaper, under a budget, only in stock, another brand, narrower category, or similar, first call getStorefrontContext if the current page matters, then preserve the existing search intent and call filterResults instead of starting a fresh search.",
  "For requests such as first one, second one, open that, or show me details, first call getStorefrontContext when needed, then call openProduct using the current visible result list and a 1-based resultIndex when possible.",
  "If the shopper says buy this item, buy this one, checkout, purchase this, or I want this, call beginCheckout. When the current page is a product page and no resultIndex is provided, use the open product.",
  "For questions like what does this mean, what is the warranty, tell me the shipping, explain OLED, or what does this attribute mean, call getStorefrontContext when needed and then call explainProductAttribute.",
  "Do not say products are already visible, in front of the shopper, or on screen unless getStorefrontContext shows the current page is search or product.",
  "If the user asks to stop, end, or close the shopping session, call stopSession.",
  "Keep spoken replies short, practical, and grounded in the tool results. Ignore irrelevant ambient speech.",
].join(" ");

export const PRODUCT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "getStorefrontContext",
    description:
      "Return the current page context including the active route, current search term, active filters, visible results, and open product.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "searchProducts",
    description:
      "Search the full product catalog and navigate the app to the search results page. Use this when the shopper asks for product discovery or a new query.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        searchTerm: { type: "string", description: "Normalized product intent or query." },
        division: { type: "string", enum: ["fashion", "electronics", "all"] },
        category: { type: "string", description: "Category slug when clearly known." },
        brand: { type: "string", description: "Brand name when clearly requested." },
        availability: { type: "string", enum: ["all", "in-stock"] },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["searchTerm"],
    },
  },
  {
    name: "filterResults",
    description:
      "Refine the current search results with follow-up constraints like price, stock, brand, category, or extra search words. Use this for narrower follow-up requests on top of the current search page instead of starting a new catalog search.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        searchTerm: { type: "string", description: "Optional follow-up query text." },
        division: { type: "string", enum: ["fashion", "electronics", "all"] },
        category: { type: "string" },
        brand: { type: "string" },
        availability: { type: "string", enum: ["all", "in-stock"] },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "openProduct",
    description:
      "Open one product from the currently visible result set or by exact product id.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        resultIndex: {
          type: "number",
          description: "1-based position in the current visible results.",
        },
        productId: { type: "string" },
      },
    },
  },
  {
    name: "beginCheckout",
    description:
      "Navigate to checkout for the current product or a selected result and end the live shopping session.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        resultIndex: {
          type: "number",
          description: "1-based position in the current visible results.",
        },
        productId: { type: "string" },
      },
    },
  },
  {
    name: "explainProductAttribute",
    description:
      "Explain an attribute, shipping term, warranty term, stock detail, or product phrase in simple language. If the shopper is on a product page, use the open product even when no product id is supplied.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attributeQuery: { type: "string" },
        resultIndex: { type: "number" },
        productId: { type: "string" },
      },
      required: ["attributeQuery"],
    },
  },
  {
    name: "stopSession",
    description: "Stop the active voice shopping session.",
    parametersJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string" },
      },
    },
  },
];

const BASE_LIVE_CONFIG: LiveConnectConfig = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: {
    role: "system",
    parts: [{ text: LIVE_SYSTEM_PROMPT }],
  },
  tools: [{ functionDeclarations: PRODUCT_TOOL_DECLARATIONS }],
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  realtimeInputConfig: {
    activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
  },
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: "Kore",
      },
    },
  },
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.LOW,
  },
  temperature: 0.3,
  maxOutputTokens: 256,
};

export function buildLiveConnectConfig(
  resumptionHandle?: string,
): LiveConnectConfig {
  return {
    ...BASE_LIVE_CONFIG,
    sessionResumption: resumptionHandle ? { handle: resumptionHandle } : {},
    contextWindowCompression: {
      triggerTokens: "22000",
      slidingWindow: {
        targetTokens: "11000",
      },
    },
  };
}

export function getTokenConstraintConfig(): LiveConnectConfig {
  return {
    ...BASE_LIVE_CONFIG,
    sessionResumption: {},
  };
}

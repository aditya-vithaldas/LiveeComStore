"use client";

import {
  GoogleGenAI,
  type FunctionCall,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  decodePcmBase64,
  encodeFloat32ToPcmBase64,
} from "@/lib/audio-utils";
import { createMicCaptureNode } from "@/lib/audio-worklet";
import { explainProductAttribute } from "@/lib/attribute-explanations";
import { buildSearchHref, parseSearchRouteState } from "@/lib/catalog-route";
import {
  formatLiveSessionCloseReason,
  getLiveSessionSocketStateLabel,
  isLiveSessionSocketOpen,
} from "@/lib/live-session";
import { LIVE_MODEL, buildLiveConnectConfig } from "@/lib/live-tools";
import { defaultFilters, searchProducts } from "@/lib/search";
import type {
  ProductFilters,
  ProductSearchResult,
  StoreProduct,
} from "@/types/catalog";

type SessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type AttributeExplanation = {
  title: string;
  body: string;
  productId: string | null;
} | null;

type DebugEvent = {
  id: number;
  at: string;
  type: string;
  detail: string;
};

type BagItem = {
  id: string;
  productId: string;
  quantity: number;
  sizeLabel: string | null;
};

type LiveDebugState = {
  pathname: string;
  status: SessionStatus;
  socketState: string;
  sessionWritable: boolean;
  sessionReady: boolean;
  tokenStatus: string;
  mediaStatus: string;
  connectStatus: string;
  searchTerm: string;
  searchResultCount: number;
  activeProductId: string | null;
  routeContextSendCount: number;
  lastRouteContext: string;
  micChunkCount: number;
  micChunkSendCount: number;
  lastMicLevel: number;
  inputTranscriptCount: number;
  outputTranscriptCount: number;
  toolCallCount: number;
  toolResponseCount: number;
  lastServerEvent: string;
  lastCloseReason: string | null;
  resumptionHandleAvailable: boolean;
  error: string | null;
};

type PendingNavigation = {
  href: string;
  source: string;
} | null;

type PersistedLiveSession = {
  active: boolean;
  handle?: string;
  updatedAt: number;
};

type TokenResponse = {
  token?: string;
  model?: string;
  error?: string;
};

const PERSISTED_SESSION_KEY = "maison-aural.live-session";
const PERSISTED_SESSION_TTL_MS = 15 * 60 * 1000;

type StorefrontContextValue = {
  products: StoreProduct[];
  status: SessionStatus;
  liveUserCaption: string;
  error: string | null;
  debugState: LiveDebugState;
  debugEvents: DebugEvent[];
  searchTerm: string;
  filters: ProductFilters;
  searchState: ProductSearchResult;
  activeProduct: StoreProduct | null;
  attributeExplanation: AttributeExplanation;
  bagItems: BagItem[];
  startSession: () => Promise<void>;
  stopSession: (reason?: string) => Promise<void>;
  updateSearchRoute: (
    searchTerm: string,
    filters: ProductFilters,
    scope?: "catalog" | "current-results",
  ) => void;
  clearFilters: () => void;
  openProduct: (productId: string) => void;
  beginCheckout: (productId?: string) => void;
  selectedSizes: Record<string, string>;
  selectProductSize: (productId: string, sizeLabel: string) => void;
  addToBag: (productId?: string) => void;
  removeFromBag: (itemId: string) => void;
  clearAttributeExplanation: () => void;
  clearDebugEvents: () => void;
};

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

function parseString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function mergeFilters(
  base: ProductFilters,
  args: Record<string, unknown>,
): ProductFilters {
  const division = parseString(args.division);
  const availability = parseString(args.availability);

  return {
    division:
      division === "fashion" ||
      division === "electronics" ||
      division === "all"
        ? division
        : base.division,
    category: parseString(args.category) ?? base.category,
    brand: parseString(args.brand) ?? base.brand,
    availability:
      availability === "all" || availability === "in-stock"
        ? availability
        : base.availability,
    minPrice: parseNumber(args.minPrice) ?? base.minPrice,
    maxPrice: parseNumber(args.maxPrice) ?? base.maxPrice,
    tags: parseStringArray(args.tags) ?? base.tags,
  };
}

function buildProductPath(productId: string) {
  return `/product/${encodeURIComponent(productId)}`;
}

function buildCheckoutHref(productId: string, sizeLabel?: string | null) {
  const params = new URLSearchParams({ productId });

  if (sizeLabel) {
    params.set("size", sizeLabel);
  }

  return `/checkout?${params.toString()}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function summarizeFilters(filters: ProductFilters) {
  const parts: string[] = [];

  if (filters.division !== "all") {
    parts.push(`department ${filters.division}`);
  }

  if (filters.category !== "all") {
    parts.push(`category ${filters.category}`);
  }

  if (filters.brand !== "all") {
    parts.push(`brand ${filters.brand}`);
  }

  if (filters.availability === "in-stock") {
    parts.push("in stock only");
  }

  if (filters.minPrice !== null) {
    parts.push(`min price ${formatCurrency(filters.minPrice)}`);
  }

  if (filters.maxPrice !== null) {
    parts.push(`max price ${formatCurrency(filters.maxPrice)}`);
  }

  if (filters.tags.length > 0) {
    parts.push(`tags ${filters.tags.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "none";
}

function buildRouteContext(
  pathname: string,
  searchTerm: string,
  filters: ProductFilters,
  searchState: ProductSearchResult,
  activeProduct: StoreProduct | null,
  selectedSize: string | null,
) {
  if (pathname.startsWith("/product/") && activeProduct) {
    const keyAttributes = activeProduct.attributes
      .slice(0, 4)
      .map((attribute) => `${attribute.label}: ${attribute.value}`)
      .join("; ");
    const sizes =
      activeProduct.sizes.length > 0
        ? activeProduct.sizes
            .filter((size) => size.available)
            .map((size) => size.label)
            .join(", ")
        : null;

    return [
      "Context update only. Do not speak unless the shopper makes a request.",
      `Current page: product.`,
      `Open product: ${activeProduct.name} by ${activeProduct.brand}.`,
      `Category: ${activeProduct.category}.`,
      `Price: ${formatCurrency(activeProduct.price)}.`,
      `Inventory: ${activeProduct.inventory}.`,
      `Shipping: ${activeProduct.shipping}.`,
      `Warranty: ${activeProduct.warranty}.`,
      sizes ? `Available sizes: ${sizes}.` : "",
      selectedSize ? `Selected size: ${selectedSize}.` : "",
      keyAttributes ? `Key attributes: ${keyAttributes}.` : "",
      "If the shopper says this product, this page, it, or that item, use this product as the target.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (pathname.startsWith("/checkout") && activeProduct) {
    return [
      "Context update only. Do not speak unless the shopper makes a request.",
      "Current page: checkout.",
      `Checkout item: ${activeProduct.name} by ${activeProduct.brand}.`,
      `Price: ${formatCurrency(activeProduct.price)}.`,
      selectedSize ? `Selected size: ${selectedSize}.` : "",
      "If the shopper asks about the item in checkout, use this product as the target.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (pathname.startsWith("/search")) {
    return [
      "Context update only. Do not speak unless the shopper makes a request.",
      "Current page: search results.",
      `Search intent: ${searchTerm ? `"${searchTerm}"` : "catalog browsing"}.`,
      `Visible results: ${searchState.results.length}.`,
      `Active filters: ${summarizeFilters(filters)}.`,
      "If the shopper narrows or filters the results, refine the current search instead of starting over.",
    ].join(" ");
  }

  return [
    "Context update only. Do not speak unless the shopper makes a request.",
    "Current page: home.",
    "Use searchProducts for fresh product discovery requests.",
  ].join(" ");
}

function getActiveProductFromPath(pathname: string, products: StoreProduct[]) {
  if (pathname.startsWith("/product/")) {
    const encodedId = pathname.slice("/product/".length);
    const productId = decodeURIComponent(encodedId);

    return products.find((product) => product.id === productId) ?? null;
  }

  return null;
}

function getRouteProduct(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  products: StoreProduct[],
) {
  if (pathname.startsWith("/product/")) {
    return getActiveProductFromPath(pathname, products);
  }

  if (pathname.startsWith("/checkout")) {
    const productId = searchParams.get("productId");

    if (!productId) {
      return null;
    }

    return products.find((product) => product.id === productId) ?? null;
  }

  return null;
}

function getDefaultSize(product: StoreProduct | null) {
  if (!product) {
    return null;
  }

  return product.sizes.find((size) => size.available)?.label ?? null;
}

function resolveSelectedSize(
  product: StoreProduct | null,
  selectedSizes: Record<string, string>,
) {
  if (!product || product.sizes.length === 0) {
    return null;
  }

  const selectedSize = selectedSizes[product.id];

  if (
    selectedSize &&
    product.sizes.some((size) => size.label === selectedSize && size.available)
  ) {
    return selectedSize;
  }

  return getDefaultSize(product);
}

function buildSampleBag(products: StoreProduct[]): BagItem[] {
  const featuredFashion = products.find(
    (product) => product.division === "fashion" && product.sizes.length > 0,
  );
  const featuredElectronics = products.find(
    (product) => product.division === "electronics",
  );

  return [
    ...(featuredFashion
      ? [
          {
            id: `bag-${featuredFashion.id}`,
            productId: featuredFashion.id,
            quantity: 1,
            sizeLabel: getDefaultSize(featuredFashion),
          },
        ]
      : []),
    ...(featuredElectronics
      ? [
          {
            id: `bag-${featuredElectronics.id}`,
            productId: featuredElectronics.id,
            quantity: 1,
            sizeLabel: null,
          },
        ]
      : []),
  ];
}

function formatDebugDetail(detail: unknown) {
  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function measureChunkLevel(chunk: Float32Array) {
  let peak = 0;

  for (let index = 0; index < chunk.length; index += 1) {
    const value = Math.abs(chunk[index]);
    if (value > peak) {
      peak = value;
    }
  }

  return Number(peak.toFixed(4));
}

function readPersistedSession(): PersistedLiveSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(PERSISTED_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedLiveSession;

    if (!parsed.active || !parsed.updatedAt) {
      return null;
    }

    if (Date.now() - parsed.updatedAt > PERSISTED_SESSION_TTL_MS) {
      window.sessionStorage.removeItem(PERSISTED_SESSION_KEY);
      return null;
    }

    return parsed;
  } catch {
    window.sessionStorage.removeItem(PERSISTED_SESSION_KEY);
    return null;
  }
}

function persistSessionState(handle?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: PersistedLiveSession = {
    active: true,
    updatedAt: Date.now(),
  };

  if (handle) {
    payload.handle = handle;
  }

  window.sessionStorage.setItem(PERSISTED_SESSION_KEY, JSON.stringify(payload));
}

function clearPersistedSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PERSISTED_SESSION_KEY);
}

export function StorefrontProvider({
  products,
  children,
}: {
  products: StoreProduct[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const routeState = parseSearchRouteState(searchParams);
  const searchState = searchProducts(products, {
    searchTerm: routeState.searchTerm,
    filters: routeState.filters,
  });
  const activeProduct = getRouteProduct(pathname, searchParams, products);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveUserCaption, setLiveUserCaption] = useState("");
  const [attributeExplanation, setAttributeExplanation] =
    useState<AttributeExplanation>(null);
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [bagItems, setBagItems] = useState<BagItem[]>(() => buildSampleBag(products));
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation>(null);
  const [debugState, setDebugState] = useState<LiveDebugState>({
    pathname,
    status: "idle",
    socketState: "NOT_CREATED",
    sessionWritable: false,
    sessionReady: false,
    tokenStatus: "idle",
    mediaStatus: "idle",
    connectStatus: "idle",
    searchTerm: routeState.searchTerm,
    searchResultCount: searchState.results.length,
    activeProductId: activeProduct?.id ?? null,
    routeContextSendCount: 0,
    lastRouteContext: "",
    micChunkCount: 0,
    micChunkSendCount: 0,
    lastMicLevel: 0,
    inputTranscriptCount: 0,
    outputTranscriptCount: 0,
    toolCallCount: 0,
    toolResponseCount: 0,
    lastServerEvent: "idle",
    lastCloseReason: null,
    resumptionHandleAvailable: false,
    error: null,
  });
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  const sessionRef = useRef<Session | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playbackCursorRef = useRef(0);
  const playbackSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const resumptionHandleRef = useRef<string | undefined>(undefined);
  const sessionWritableRef = useRef(false);
  const sessionReadyRef = useRef(false);
  const setupTimeoutRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const debugEventIdRef = useRef(0);
  const micStatsRef = useRef({
    captured: 0,
    sent: 0,
    lastLevel: 0,
  });
  const lastMicDebugFlushRef = useRef(0);
  const lastMicSkipReasonRef = useRef<string | null>(null);
  const lastRouteSkipReasonRef = useRef<string | null>(null);
  const lastNavigationRef = useRef("");
  const statusRef = useRef<SessionStatus>("idle");
  const searchTermRef = useRef(routeState.searchTerm);
  const filtersRef = useRef(routeState.filters);
  const searchStateRef = useRef(searchState);
  const activeProductRef = useRef<StoreProduct | null>(activeProduct);
  const selectedSizesRef = useRef<Record<string, string>>(selectedSizes);
  const pathnameRef = useRef(pathname);
  const lastRouteContextRef = useRef("");
  const stopSessionRef = useRef<
    ((reason?: string, closeSocket?: boolean, nextStatus?: SessionStatus) => Promise<void>) | null
  >(null);
  const hasAutoResumedRef = useRef(false);
  const checkoutStopRequestedRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    selectedSizesRef.current = selectedSizes;
  }, [selectedSizes]);

  useEffect(() => {
    searchTermRef.current = routeState.searchTerm;
    filtersRef.current = routeState.filters;
    searchStateRef.current = searchState;
    activeProductRef.current = activeProduct;
    pathnameRef.current = pathname;
  }, [
    activeProduct,
    pathname,
    routeState.filters,
    routeState.searchTerm,
    searchState,
  ]);

  useEffect(() => {
    if (!activeProduct) {
      return;
    }

    const checkoutSize = pathname.startsWith("/checkout") ? searchParams.get("size") : null;
    const preferredSize =
      checkoutSize ??
      resolveSelectedSize(activeProduct, selectedSizesRef.current) ??
      getDefaultSize(activeProduct);

    if (!preferredSize) {
      return;
    }

    setSelectedSizes((current) =>
      current[activeProduct.id] === preferredSize
        ? current
        : { ...current, [activeProduct.id]: preferredSize },
    );
  }, [activeProduct, pathname, searchParams]);

  useEffect(() => {
    const signature = `${pathname}|${routeState.searchTerm}|${searchState.results.length}|${activeProduct?.id ?? ""}`;

    if (lastNavigationRef.current === signature) {
      return;
    }

    lastNavigationRef.current = signature;
    appendDebugEvent("navigation.committed", {
      pathname,
      searchTerm: routeState.searchTerm,
      resultCount: searchState.results.length,
      activeProductId: activeProduct?.id ?? null,
    });
    syncDebugState({
      lastServerEvent: "navigation-committed",
      lastRouteContext: buildRouteContext(
        pathname,
        routeState.searchTerm,
        routeState.filters,
        searchState,
        activeProduct,
        resolveSelectedSize(activeProduct, selectedSizesRef.current),
      ),
    });
    // syncDebugState intentionally snapshots ref-backed live state without joining the effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct, pathname, routeState.filters, routeState.searchTerm, searchState]);

  useEffect(() => {
    if (!pendingNavigation) {
      return;
    }

    appendDebugEvent("navigation.dispatched", pendingNavigation);
    syncDebugState({
      lastServerEvent: "navigation-dispatched",
    });
    const expectedHref = pendingNavigation.href;
    router.push(expectedHref, { scroll: false });
    window.setTimeout(() => {
      const currentHref = `${window.location.pathname}${window.location.search}`;

      if (currentHref === expectedHref) {
        return;
      }

      appendDebugEvent("navigation.fallback", {
        from: currentHref,
        to: expectedHref,
      });
      syncDebugState({
        lastServerEvent: "navigation-fallback",
      });
      persistSessionState(resumptionHandleRef.current);
      window.location.assign(expectedHref);
    }, 900);
    setPendingNavigation(null);
    // syncDebugState intentionally snapshots ref-backed live state without joining the effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNavigation, router]);

  const clearAttributeExplanation = () => {
    setAttributeExplanation(null);
  };

  const requestNavigation = (href: string, source: string) => {
    appendDebugEvent("navigation.requested", {
      to: href,
      source,
    });
    syncDebugState({
      lastServerEvent: "navigation-requested",
    });
    setPendingNavigation({ href, source });
  };

  const syncDebugState = (patch: Partial<LiveDebugState> = {}) => {
    setDebugState((current) => ({
      ...current,
      pathname: pathnameRef.current,
      status: statusRef.current,
      socketState: getLiveSessionSocketStateLabel(sessionRef.current),
      sessionWritable: sessionWritableRef.current,
      sessionReady: sessionReadyRef.current,
      searchTerm: searchTermRef.current,
      searchResultCount: searchStateRef.current.results.length,
      activeProductId: activeProductRef.current?.id ?? null,
      micChunkCount: micStatsRef.current.captured,
      micChunkSendCount: micStatsRef.current.sent,
      lastMicLevel: micStatsRef.current.lastLevel,
      resumptionHandleAvailable: Boolean(resumptionHandleRef.current),
      error,
      ...patch,
    }));
  };

  const appendDebugEvent = (type: string, detail: unknown) => {
    const entry: DebugEvent = {
      id: debugEventIdRef.current,
      at: new Date().toISOString(),
      type,
      detail: formatDebugDetail(detail),
    };

    debugEventIdRef.current += 1;
    setDebugEvents((current) => [...current.slice(-199), entry]);
  };

  const clearDebugEvents = () => {
    setDebugEvents([]);
    appendDebugEvent("debug.cleared", "Debug log cleared.");
  };

  const getSessionBlockReason = (requireReady = true) => {
    if (!sessionRef.current) {
      return "session-missing";
    }

    if (!sessionWritableRef.current) {
      return "session-not-writable";
    }

    if (!isLiveSessionSocketOpen(sessionRef.current)) {
      sessionWritableRef.current = false;
      return "socket-not-open";
    }

    if (requireReady && !sessionReadyRef.current) {
      return "session-not-ready";
    }

    return null;
  };

  const clearSetupTimeout = () => {
    if (setupTimeoutRef.current !== null) {
      window.clearTimeout(setupTimeoutRef.current);
      setupTimeoutRef.current = null;
    }
  };

  const canSendSessionMessage = (requireReady = true) => {
    return getSessionBlockReason(requireReady) === null;
  };

  const getSelectedSizeForProduct = (product: StoreProduct | null) =>
    resolveSelectedSize(product, selectedSizesRef.current);

  const getStorefrontContextPayload = () => {
    const currentPath = pathnameRef.current;
    const currentSearchTerm = searchTermRef.current;
    const currentFilters = filtersRef.current;
    const currentResults = searchStateRef.current.results.slice(0, 8).map((product, index) => ({
      resultIndex: index + 1,
      productId: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: product.price,
      inventory: product.inventory,
    }));
    const currentProduct = activeProductRef.current;
    const currentContext = buildRouteContext(
      currentPath,
      currentSearchTerm,
      currentFilters,
      searchStateRef.current,
      currentProduct,
      getSelectedSizeForProduct(currentProduct),
    );

    lastRouteContextRef.current = currentContext;

    return {
      page:
        currentPath.startsWith("/product/")
          ? "product"
          : currentPath.startsWith("/checkout")
            ? "checkout"
          : currentPath.startsWith("/search")
            ? "search"
            : "home",
      pathname: currentPath,
      searchTerm: currentSearchTerm,
      filters: currentFilters,
      visibleResults: currentResults,
      activeProduct: currentProduct
        ? {
            productId: currentProduct.id,
            name: currentProduct.name,
            brand: currentProduct.brand,
            category: currentProduct.category,
            price: currentProduct.price,
            inventory: currentProduct.inventory,
            shipping: currentProduct.shipping,
            warranty: currentProduct.warranty,
            selectedSize: getSelectedSizeForProduct(currentProduct),
            sizes: currentProduct.sizes,
            attributes: currentProduct.attributes.slice(0, 8),
          }
        : null,
      narrative: currentContext,
    };
  };

  const stopPlayback = () => {
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop();
      } catch {}
    }

    playbackSourcesRef.current.clear();
    playbackCursorRef.current = 0;
  };

  const releaseAudioResources = async () => {
    stopPlayback();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.port.onmessage = null;
      processorRef.current.port.close();
      processorRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;

    silentGainRef.current?.disconnect();
    silentGainRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (inputAudioContextRef.current) {
      await inputAudioContextRef.current.close().catch(() => undefined);
      inputAudioContextRef.current = null;
    }

    if (outputAudioContextRef.current) {
      await outputAudioContextRef.current.close().catch(() => undefined);
      outputAudioContextRef.current = null;
    }
  };

  const stopSession = async (
    reason?: string,
    closeSocket = true,
    nextStatus: SessionStatus = "idle",
  ) => {
    if (isStoppingRef.current) {
      return;
    }

    isStoppingRef.current = true;
    sessionWritableRef.current = false;
    sessionReadyRef.current = false;
    clearSetupTimeout();
    appendDebugEvent("session.stop", {
      reason: reason ?? null,
      closeSocket,
      nextStatus,
    });
    syncDebugState({
      connectStatus: closeSocket ? "closing" : "closed",
      lastCloseReason: reason ?? debugState.lastCloseReason,
    });

    const activeSession = sessionRef.current;
    sessionRef.current = null;

    if (closeSocket && activeSession) {
      try {
        activeSession.close();
      } catch {}
    }

    if (nextStatus === "idle" || nextStatus === "error") {
      clearPersistedSessionState();
    } else {
      persistSessionState(resumptionHandleRef.current);
    }

    lastRouteContextRef.current = "";
    await releaseAudioResources();
    setLiveUserCaption("");
    setStatus(nextStatus);

    if (nextStatus === "error" && reason) {
      setError(reason);
    } else if (nextStatus !== "error") {
      setError(null);
    }

    window.setTimeout(() => {
      isStoppingRef.current = false;
    }, 200);
  };

  stopSessionRef.current = stopSession;

  const playAudioChunk = (base64: string) => {
    const context = outputAudioContextRef.current;

    if (!context) {
      return;
    }

    const samples = decodePcmBase64(base64);
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(playbackCursorRef.current, context.currentTime + 0.03);
    source.start(startAt);

    playbackCursorRef.current = startAt + buffer.duration;
    playbackSourcesRef.current.add(source);

    source.onended = () => {
      playbackSourcesRef.current.delete(source);
    };
  };

  const updateSearchRoute = (
    nextSearchTerm: string,
    nextFilters: ProductFilters,
    scope: "catalog" | "current-results" = "catalog",
  ) => {
    setAttributeExplanation(null);

    if (scope === "current-results") {
      const additiveResult = searchProducts(
        products,
        { searchTerm: nextSearchTerm, filters: nextFilters },
        searchStateRef.current.results,
      );

      searchStateRef.current = additiveResult;
    }

    const nextHref = buildSearchHref(nextSearchTerm, nextFilters);
    requestNavigation(
      nextHref,
      scope === "current-results" ? "filterResults" : "searchProducts",
    );
  };

  const clearFilters = () => {
    setAttributeExplanation(null);
    requestNavigation("/search", "clearFilters");
  };

  const selectProductSize = (productId: string, sizeLabel: string) => {
    setSelectedSizes((current) => ({
      ...current,
      [productId]: sizeLabel,
    }));
  };

  const openProduct = (productId: string) => {
    setAttributeExplanation(null);
    const nextHref = buildProductPath(productId);
    requestNavigation(nextHref, "openProduct");
  };

  const addToBag = (productId?: string) => {
    const product =
      (productId ? products.find((entry) => entry.id === productId) : undefined) ??
      activeProductRef.current;

    if (!product) {
      return;
    }

    const selectedSize = getSelectedSizeForProduct(product);

    setBagItems((current) => {
      const existing = current.find(
        (item) =>
          item.productId === product.id && item.sizeLabel === (selectedSize ?? null),
      );

      if (!existing) {
        return [
          ...current,
          {
            id: `bag-${product.id}-${selectedSize ?? "default"}-${Date.now()}`,
            productId: product.id,
            quantity: 1,
            sizeLabel: selectedSize ?? null,
          },
        ];
      }

      return current.map((item) =>
        item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  };

  const removeFromBag = (itemId: string) => {
    setBagItems((current) => current.filter((item) => item.id !== itemId));
  };

  const beginCheckout = (productId?: string, viaTool = false) => {
    const product =
      (productId ? products.find((entry) => entry.id === productId) : undefined) ??
      activeProductRef.current;

    if (!product) {
      return;
    }

    const selectedSize = getSelectedSizeForProduct(product);

    setAttributeExplanation(null);
    clearPersistedSessionState();
    checkoutStopRequestedRef.current = viaTool;
    requestNavigation(buildCheckoutHref(product.id, selectedSize), "beginCheckout");

    if (
      !viaTool &&
      statusRef.current !== "idle" &&
      statusRef.current !== "error"
    ) {
      void stopSession("Checkout started.", true, "idle");
    }
  };

  const handleToolCall = (call: FunctionCall) => {
    const args = (call.args ?? {}) as Record<string, unknown>;

    switch (call.name) {
      case "getStorefrontContext": {
        const payload = getStorefrontContextPayload();
        appendDebugEvent("context.requested", {
          page: payload.page,
          pathname: payload.pathname,
        });
        syncDebugState({
          lastRouteContext: payload.narrative,
          lastServerEvent: "context-requested",
        });

        return {
          output: payload,
        };
      }

      case "searchProducts": {
        const nextFilters = mergeFilters(defaultFilters, args);
        const nextSearchTerm = parseString(args.searchTerm) ?? "";
        const result = searchProducts(products, {
          searchTerm: nextSearchTerm,
          filters: nextFilters,
        });

        searchStateRef.current = result;
        updateSearchRoute(nextSearchTerm, nextFilters);

        return {
          output: {
            summary: result.summary,
            matches: result.results.slice(0, 6).map((product, index) => ({
              resultIndex: index + 1,
              productId: product.id,
              name: product.name,
              price: product.price,
            })),
          },
        };
      }

      case "filterResults": {
        const nextFilters = mergeFilters(filtersRef.current, args);
        const followUpTerm = parseString(args.searchTerm);
        const nextSearchTerm = followUpTerm
          ? `${searchTermRef.current} ${followUpTerm}`.trim()
          : searchTermRef.current;
        const result = searchProducts(
          products,
          { searchTerm: nextSearchTerm, filters: nextFilters },
          searchStateRef.current.results,
        );

        searchStateRef.current = result;
        updateSearchRoute(nextSearchTerm, nextFilters, "current-results");

        return {
          output: {
            summary: result.summary,
            matches: result.results.slice(0, 6).map((product, index) => ({
              resultIndex: index + 1,
              productId: product.id,
              name: product.name,
              price: product.price,
            })),
          },
        };
      }

      case "openProduct": {
        const resultIndex = parseNumber(args.resultIndex);
        const productId = parseString(args.productId);
        const product =
          (productId
            ? searchStateRef.current.results.find((entry) => entry.id === productId)
            : undefined) ??
          (resultIndex
            ? searchStateRef.current.results[Math.max(0, resultIndex - 1)]
            : undefined);

        if (!product) {
          return {
            error: {
              message: "I could not find that product in the current results.",
            },
          };
        }

        openProduct(product.id);

        return {
          output: {
            productId: product.id,
            name: product.name,
            price: product.price,
          },
        };
      }

      case "beginCheckout": {
        const resultIndex = parseNumber(args.resultIndex);
        const productId = parseString(args.productId);
        const product =
          (productId
            ? products.find((entry) => entry.id === productId)
            : undefined) ??
          (resultIndex
            ? searchStateRef.current.results[Math.max(0, resultIndex - 1)]
            : undefined) ??
          activeProductRef.current;

        if (!product) {
          return {
            error: {
              message: "I could not find that item to take into checkout.",
            },
          };
        }

        beginCheckout(product.id, true);

        return {
          output: {
            productId: product.id,
            name: product.name,
            price: product.price,
            checkoutStatus: "started",
          },
        };
      }

      case "explainProductAttribute": {
        const resultIndex = parseNumber(args.resultIndex);
        const productId = parseString(args.productId);
        const attributeQuery = parseString(args.attributeQuery) ?? "this";
        const product =
          (productId ? products.find((entry) => entry.id === productId) : undefined) ??
          (resultIndex
            ? searchStateRef.current.results[Math.max(0, resultIndex - 1)]
            : undefined) ??
          activeProductRef.current;

        const explanation = explainProductAttribute(product ?? undefined, attributeQuery);

        setAttributeExplanation({
          title: product
            ? `${attributeQuery} on ${product.name}`
            : `About ${attributeQuery}`,
          body: explanation,
          productId: product?.id ?? null,
        });

        if (product && !pathnameRef.current.startsWith("/product/")) {
          openProduct(product.id);
        }

        return {
          output: {
            explanation,
            productId: product?.id ?? null,
          },
        };
      }

      case "stopSession": {
        const reason = parseString(args.reason) ?? null;
        window.setTimeout(() => {
          void stopSession(reason ?? undefined);
        }, 100);

        return {
          output: {
            status: "stopping",
          },
        };
      }

      default:
        return {
          error: {
            message: `Unknown function call: ${call.name}`,
          },
        };
    }
  };

  const handleLiveMessage = (message: LiveServerMessage) => {
    if (message.sessionResumptionUpdate?.newHandle) {
      resumptionHandleRef.current = message.sessionResumptionUpdate.newHandle;
      persistSessionState(resumptionHandleRef.current);
      appendDebugEvent("session.resumption.update", {
        hasHandle: true,
      });
      syncDebugState({
        resumptionHandleAvailable: true,
        lastServerEvent: "session-resumption-update",
      });
    }

    if (message.setupComplete) {
      clearSetupTimeout();
      sessionReadyRef.current = true;
      setStatus("listening");
      appendDebugEvent("session.setup.complete", {
        socketState: getLiveSessionSocketStateLabel(sessionRef.current),
      });
      syncDebugState({
        connectStatus: "ready",
        lastServerEvent: "setupComplete",
        lastRouteContext: buildRouteContext(
          pathnameRef.current,
          searchTermRef.current,
          filtersRef.current,
          searchStateRef.current,
          activeProductRef.current,
          getSelectedSizeForProduct(activeProductRef.current),
        ),
      });
    }

    if (message.toolCall?.functionCalls?.length) {
      setStatus("thinking");
      appendDebugEvent(
        "tool.call",
        message.toolCall.functionCalls.map((call) => call.name),
      );
      syncDebugState({
        toolCallCount: debugState.toolCallCount + message.toolCall.functionCalls.length,
        lastServerEvent: "tool-call",
      });

      const functionResponses = message.toolCall.functionCalls.map((call) => ({
        id: call.id,
        name: call.name,
        response: handleToolCall(call),
      }));

      if (canSendSessionMessage()) {
        try {
          const session = sessionRef.current;

          if (!session) {
            return;
          }

          session.sendToolResponse({ functionResponses });
          appendDebugEvent("tool.response.sent", {
            count: functionResponses.length,
          });
          syncDebugState({
            toolResponseCount:
              debugState.toolResponseCount + functionResponses.length,
          });

          if (checkoutStopRequestedRef.current) {
            checkoutStopRequestedRef.current = false;
            void stopSession("Checkout started.", true, "idle");
          }
        } catch {}
      }
    }

    const serverContent = message.serverContent;

    if (!serverContent) {
      return;
    }

    if (serverContent.inputTranscription?.text) {
      setLiveUserCaption(serverContent.inputTranscription.text);
      setStatus("listening");
      appendDebugEvent("transcription.input", serverContent.inputTranscription.text);
      syncDebugState({
        inputTranscriptCount: debugState.inputTranscriptCount + 1,
        lastServerEvent: "input-transcription",
      });
    }

    if (serverContent.outputTranscription?.text) {
      setStatus("speaking");
      appendDebugEvent("transcription.output", serverContent.outputTranscription.text);
      syncDebugState({
        outputTranscriptCount: debugState.outputTranscriptCount + 1,
        lastServerEvent: "output-transcription",
      });
    }

    if (serverContent.interrupted) {
      stopPlayback();
      setStatus("listening");
    }

    if (serverContent.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          playAudioChunk(part.inlineData.data);
        }
      }
    }

    if (serverContent.waitingForInput || serverContent.turnComplete) {
      playbackCursorRef.current = Math.max(
        playbackCursorRef.current,
        outputAudioContextRef.current?.currentTime ?? 0,
      );

      if (statusRef.current !== "error") {
        setStatus("listening");
      }
    }
  };

  const startSession = async () => {
    if (sessionRef.current || statusRef.current === "connecting") {
      return;
    }

    persistSessionState(resumptionHandleRef.current);
    setError(null);
    setStatus("connecting");
    sessionWritableRef.current = false;
    sessionReadyRef.current = false;
    clearSetupTimeout();
    micStatsRef.current = { captured: 0, sent: 0, lastLevel: 0 };
    lastMicSkipReasonRef.current = null;
    lastRouteSkipReasonRef.current = null;
    appendDebugEvent("session.start.requested", {
      pathname: pathnameRef.current,
    });
    syncDebugState({
      tokenStatus: "loading",
      mediaStatus: "idle",
      connectStatus: "starting",
      routeContextSendCount: 0,
      lastRouteContext: "",
      micChunkCount: 0,
      micChunkSendCount: 0,
      lastMicLevel: 0,
      inputTranscriptCount: 0,
      outputTranscriptCount: 0,
      toolCallCount: 0,
      toolResponseCount: 0,
      lastServerEvent: "session-start-requested",
      lastCloseReason: null,
      error: null,
    });

    try {
      const tokenResponse = await fetch("/api/live-token");
      const tokenPayload = (await tokenResponse.json()) as TokenResponse;

      if (!tokenResponse.ok || !tokenPayload.token) {
        throw new Error(tokenPayload.error ?? "Unable to mint an ephemeral token.");
      }

      appendDebugEvent("token.fetch.success", {
        model: tokenPayload.model ?? LIVE_MODEL,
      });
      syncDebugState({
        tokenStatus: "loaded",
        lastServerEvent: "token-fetched",
      });

      const mediaDevices =
        typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

      if (!mediaDevices?.getUserMedia) {
        const secureContext =
          typeof window !== "undefined" ? window.isSecureContext : false;

        throw new Error(
          secureContext
            ? "Microphone access is not available in this browser."
            : "Microphone access requires a secure context. Open the app on localhost or https.",
        );
      }

      appendDebugEvent("media.getUserMedia.requested", {
        secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
      });
      syncDebugState({
        mediaStatus: "requesting",
      });

      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      appendDebugEvent("media.getUserMedia.granted", {
        trackLabel: stream.getAudioTracks()[0]?.label ?? "unknown",
      });
      syncDebugState({
        mediaStatus: "granted",
      });

      outputAudioContextRef.current = new AudioContext();
      await outputAudioContextRef.current.resume();
      appendDebugEvent("audio.output-context.ready", {
        state: outputAudioContextRef.current.state,
      });

      const inputAudioContext = new AudioContext();
      inputAudioContextRef.current = inputAudioContext;
      await inputAudioContext.resume();
      appendDebugEvent("audio.input-context.ready", {
        state: inputAudioContext.state,
        sampleRate: inputAudioContext.sampleRate,
      });

      const ai = new GoogleGenAI({
        apiKey: tokenPayload.token,
        httpOptions: { apiVersion: "v1alpha" },
      });
      appendDebugEvent("session.connect.requested", {
        model: tokenPayload.model ?? LIVE_MODEL,
      });
      syncDebugState({
        connectStatus: "connecting",
      });

      const session = await ai.live.connect({
        model: tokenPayload.model ?? LIVE_MODEL,
        config: buildLiveConnectConfig(resumptionHandleRef.current),
        callbacks: {
          onopen: () => {
            sessionWritableRef.current = true;
            appendDebugEvent("session.socket.open", {
              socketState: getLiveSessionSocketStateLabel(sessionRef.current),
            });
            syncDebugState({
              connectStatus: "socket-open",
            });
          },
          onmessage: handleLiveMessage,
          onerror: (event) => {
            sessionWritableRef.current = false;
            sessionReadyRef.current = false;
            const message =
              "message" in event && typeof event.message === "string"
                ? event.message
                : "Realtime session error.";

            setError(message);
            appendDebugEvent("session.error", message);
            syncDebugState({
              connectStatus: "error",
              lastCloseReason: message,
              error: message,
            });
            void stopSession(undefined, false, "error");
          },
          onclose: (event) => {
            sessionWritableRef.current = false;
            sessionReadyRef.current = false;
            if (isStoppingRef.current) {
              return;
            }

            const closeReason = formatLiveSessionCloseReason(event);
            appendDebugEvent("session.close", closeReason);
            syncDebugState({
              connectStatus: "closed",
              lastCloseReason: closeReason,
              error: closeReason,
            });
            void stopSession(closeReason, false, "error");
          },
        },
      });

      sessionRef.current = session;
      sessionWritableRef.current = isLiveSessionSocketOpen(session);
      appendDebugEvent("session.connect.resolved", {
        socketState: getLiveSessionSocketStateLabel(session),
      });
      syncDebugState({
        connectStatus: "socket-open",
      });
      setupTimeoutRef.current = window.setTimeout(() => {
        if (sessionReadyRef.current || isStoppingRef.current) {
          return;
        }

        appendDebugEvent("session.setup.timeout", "Realtime session setup timed out.");
        void stopSession("Realtime session setup timed out.", true, "error");
      }, 10000);

      const { source, processor, silentGain } = await createMicCaptureNode(
        inputAudioContext,
        stream,
        (inputChannel) => {
          micStatsRef.current.captured += 1;
          micStatsRef.current.lastLevel = measureChunkLevel(inputChannel);

          const now = performance.now();
          if (
            micStatsRef.current.captured === 1 ||
            now - lastMicDebugFlushRef.current > 500
          ) {
            lastMicDebugFlushRef.current = now;
            syncDebugState();
          }

          const blockReason = getSessionBlockReason();
          if (blockReason) {
            if (lastMicSkipReasonRef.current !== blockReason) {
              lastMicSkipReasonRef.current = blockReason;
              appendDebugEvent("audio.mic.send.skipped", {
                reason: blockReason,
                socketState: getLiveSessionSocketStateLabel(sessionRef.current),
              });
              syncDebugState({
                lastServerEvent: `mic-send-skipped:${blockReason}`,
              });
            }
            return;
          }

          try {
            const audioData = encodeFloat32ToPcmBase64(
              inputChannel,
              inputAudioContext.sampleRate || INPUT_SAMPLE_RATE,
            );

            const session = sessionRef.current;

            if (!session) {
              return;
            }

            session.sendRealtimeInput({
              audio: {
                data: audioData,
                mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
              },
            });
            micStatsRef.current.sent += 1;
            if (micStatsRef.current.sent === 1) {
              appendDebugEvent("audio.mic.send.started", {
                sampleRate: inputAudioContext.sampleRate || INPUT_SAMPLE_RATE,
              });
            }
            lastMicSkipReasonRef.current = null;
            if (
              micStatsRef.current.sent === 1 ||
              micStatsRef.current.sent % 20 === 0
            ) {
              syncDebugState({
                lastServerEvent: "mic-audio-sent",
              });
            }
          } catch {}
        },
      );

      if (
        !sessionRef.current ||
        !sessionWritableRef.current ||
        !isLiveSessionSocketOpen(sessionRef.current)
      ) {
        processor.disconnect();
        processor.port.onmessage = null;
        processor.port.close();
        source.disconnect();
        silentGain.disconnect();
        return;
      }

      sourceNodeRef.current = source;
      processorRef.current = processor;
      silentGainRef.current = silentGain;

      syncDebugState({
        lastRouteContext: buildRouteContext(
          pathnameRef.current,
          searchTermRef.current,
          filtersRef.current,
          searchStateRef.current,
          activeProductRef.current,
          getSelectedSizeForProduct(activeProductRef.current),
        ),
      });
    } catch (sessionError) {
      sessionWritableRef.current = false;
      const message =
        sessionError instanceof Error
          ? sessionError.message
          : "Unable to start the session.";

      setError(message);
      appendDebugEvent("session.start.failed", message);
      syncDebugState({
        tokenStatus: "error",
        mediaStatus: "error",
        connectStatus: "error",
        lastCloseReason: message,
        error: message,
      });
      await stopSession(undefined, false, "error");
    }
  };

  useEffect(() => {
    const persistedSession = readPersistedSession();

    if (
      hasAutoResumedRef.current ||
      sessionRef.current ||
      statusRef.current !== "idle" ||
      !persistedSession?.active ||
      !persistedSession.handle
    ) {
      return;
    }

    hasAutoResumedRef.current = true;
    resumptionHandleRef.current = persistedSession.handle;
    appendDebugEvent("session.resume.requested", {
      hasHandle: true,
      pathname: pathnameRef.current,
    });
    syncDebugState({
      resumptionHandleAvailable: true,
      lastServerEvent: "session-resume-requested",
    });

    window.setTimeout(() => {
      void startSession();
    }, 120);
    // syncDebugState intentionally snapshots ref-backed live state without joining the effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (
        statusRef.current !== "idle" &&
        statusRef.current !== "error" &&
        (sessionRef.current || resumptionHandleRef.current)
      ) {
        persistSessionState(resumptionHandleRef.current);
        return;
      }

      void stopSessionRef.current?.(undefined, true, "idle");
    };
  }, []);

  useEffect(() => {
    syncDebugState();
    // syncDebugState intentionally snapshots ref-backed live state without joining the effect deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct, error, pathname, routeState.searchTerm, searchState, status]);

  return (
    <StorefrontContext.Provider
      value={{
        products,
        status,
        liveUserCaption,
        error,
        debugState,
        debugEvents,
        searchTerm: routeState.searchTerm,
        filters: routeState.filters,
        searchState,
        activeProduct,
        attributeExplanation,
        bagItems,
        startSession,
        stopSession: async (reason?: string) => stopSession(reason),
        updateSearchRoute,
        clearFilters,
        openProduct,
        beginCheckout: (productId?: string) => beginCheckout(productId),
        selectedSizes,
        selectProductSize,
        addToBag,
        removeFromBag,
        clearAttributeExplanation,
        clearDebugEvents,
      }}
    >
      {children}
    </StorefrontContext.Provider>
  );
}

export function useStorefront() {
  const context = useContext(StorefrontContext);

  if (!context) {
    throw new Error("useStorefront must be used inside StorefrontProvider.");
  }

  return context;
}

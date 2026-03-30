/* eslint-disable @next/next/no-img-element */
"use client";

import {
  GoogleGenAI,
  type FunctionCall,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
  decodePcmBase64,
  encodeFloat32ToPcmBase64,
} from "@/lib/audio-utils";
import { createMicCaptureNode } from "@/lib/audio-worklet";
import { explainProductAttribute } from "@/lib/attribute-explanations";
import {
  formatLiveSessionCloseReason,
  isLiveSessionSocketOpen,
} from "@/lib/live-session";
import { LIVE_MODEL, buildLiveConnectConfig } from "@/lib/live-tools";
import { buildSelectOptions, defaultFilters, searchProducts } from "@/lib/search";
import type {
  ProductFilters,
  ProductSearchResult,
  StoreProduct,
  VoiceSearchInsight,
} from "@/types/catalog";

import styles from "./audio-commerce-app.module.css";

type SessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type TranscriptRole = "user" | "assistant" | "system" | "tool";

type TranscriptEntry = {
  id: number;
  role: TranscriptRole;
  text: string;
  live?: boolean;
};

type AttributeExplanationState = {
  title: string;
  body: string;
};

type TokenResponse = {
  token?: string;
  model?: string;
  error?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function toSearchLabel(value: string) {
  return value === "all" ? "All" : value;
}

function summarizeFilters(filters: ProductFilters) {
  const segments: string[] = [];

  if (filters.division !== "all") {
    segments.push(filters.division);
  }

  if (filters.category !== "all") {
    segments.push(filters.category);
  }

  if (filters.brand !== "all") {
    segments.push(filters.brand);
  }

  if (filters.availability !== "all") {
    segments.push("in stock");
  }

  if (filters.minPrice !== null) {
    segments.push(`from ${formatCurrency(filters.minPrice)}`);
  }

  if (filters.maxPrice !== null) {
    segments.push(`up to ${formatCurrency(filters.maxPrice)}`);
  }

  if (filters.tags.length > 0) {
    segments.push(...filters.tags);
  }

  return segments.length > 0 ? segments.join(" • ") : "No filters";
}

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

function SessionPill({ status }: { status: SessionStatus }) {
  return (
    <span className={`${styles.statusPill} ${styles[`status${status}`]}`}>
      {status}
    </span>
  );
}

function ProductCard({
  product,
  index,
  active,
  onSelect,
}: {
  product: StoreProduct;
  index: number;
  active: boolean;
  onSelect: (productId: string) => void;
}) {
  return (
    <article
      className={`${styles.productCard} ${active ? styles.productCardActive : ""}`}
    >
      <div className={styles.productImageWrap}>
        <span className={styles.productIndex}>{index + 1}</span>
        <img
          className={styles.productImage}
          src={product.image}
          alt={product.name}
        />
      </div>
      <div className={styles.productMeta}>
        <div className={styles.productMetaTop}>
          <div>
            <p className={styles.productBrand}>{product.brand}</p>
            <h3>{product.name}</h3>
          </div>
          <p className={styles.productPrice}>{formatCurrency(product.price)}</p>
        </div>
        <p className={styles.productDescription}>{product.description}</p>
        <div className={styles.chipRow}>
          <span className={styles.chip}>{product.category}</span>
          <span className={styles.chip}>{product.inventory} in stock</span>
          <span className={styles.chip}>{product.rating.toFixed(1)} stars</span>
        </div>
        <div className={styles.productActions}>
          <button type="button" className={styles.ghostButton} onClick={() => onSelect(product.id)}>
            View details
          </button>
          <button type="button" className={styles.textButton} onClick={() => onSelect(product.id)}>
            Ask about this one
          </button>
        </div>
      </div>
    </article>
  );
}

export function AudioCommerceApp({ products }: { products: StoreProduct[] }) {
  const options = buildSelectOptions(products);
  const featuredProducts = [
    ...products.filter((product) => product.featured),
    ...products,
  ].slice(0, 3);

  const initialResults = searchProducts(products, {
    searchTerm: "",
    filters: defaultFilters,
  });

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const deferredSearchDraft = useDeferredValue(searchDraft);
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters);
  const [searchState, setSearchState] =
    useState<ProductSearchResult>(initialResults);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialResults.results[0]?.id ?? null,
  );
  const [voiceInsight, setVoiceInsight] = useState<VoiceSearchInsight | null>(
    null,
  );
  const [attributeExplanation, setAttributeExplanation] =
    useState<AttributeExplanationState | null>(null);
  const [liveUserCaption, setLiveUserCaption] = useState("");
  const [liveAssistantCaption, setLiveAssistantCaption] = useState("");
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([
    {
      id: 0,
      role: "system",
      text: "Press start session, then ask for products, filters, or say 'open the second one.'",
    },
  ]);

  const sessionRef = useRef<Session | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playbackCursorRef = useRef(0);
  const playbackSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const transcriptIdRef = useRef(1);
  const searchStateRef = useRef<ProductSearchResult>(initialResults);
  const filtersRef = useRef<ProductFilters>(defaultFilters);
  const searchDraftRef = useRef("");
  const selectedProductIdRef = useRef<string | null>(selectedProductId);
  const statusRef = useRef<SessionStatus>("idle");
  const resumptionHandleRef = useRef<string | undefined>(undefined);
  const sessionWritableRef = useRef(false);
  const sessionReadyRef = useRef(false);
  const setupTimeoutRef = useRef<number | null>(null);
  const isStoppingRef = useRef(false);
  const stopSessionRef = useRef<
    | ((
        reason?: string,
        closeSocket?: boolean,
        nextStatus?: SessionStatus,
      ) => Promise<void>)
    | null
  >(null);

  useEffect(() => {
    searchStateRef.current = searchState;
  }, [searchState]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    searchDraftRef.current = searchDraft;
  }, [searchDraft]);

  useEffect(() => {
    selectedProductIdRef.current = selectedProductId;
  }, [selectedProductId]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    startTransition(() => {
      const nextState = searchProducts(products, {
        searchTerm: deferredSearchDraft,
        filters,
      });

      setSearchState(nextState);
    });
  }, [deferredSearchDraft, filters, products]);

  useEffect(() => {
    if (
      searchState.results.length > 0 &&
      !searchState.results.some((product) => product.id === selectedProductId)
    ) {
      setSelectedProductId(searchState.results[0].id);
    }
  }, [searchState.results, selectedProductId]);

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ??
    searchState.results[0] ??
    null;

  const appendTranscript = (role: TranscriptRole, text: string, live = false) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    setTranscriptEntries((current) => {
      const nextEntries = [...current];
      const lastEntry = nextEntries[nextEntries.length - 1];

      if (live && lastEntry?.role === role && lastEntry.live) {
        nextEntries[nextEntries.length - 1] = {
          ...lastEntry,
          text: trimmed,
        };

        return nextEntries.slice(-18);
      }

      nextEntries.push({
        id: transcriptIdRef.current,
        role,
        text: trimmed,
        live,
      });
      transcriptIdRef.current += 1;

      return nextEntries.slice(-18);
    });
  };

  const finalizeLiveEntries = () => {
    setTranscriptEntries((current) =>
      current.map((entry) => (entry.live ? { ...entry, live: false } : entry)),
    );
  };

  const clearSetupTimeout = () => {
    if (setupTimeoutRef.current !== null) {
      window.clearTimeout(setupTimeoutRef.current);
      setupTimeoutRef.current = null;
    }
  };

  const canSendSessionMessage = (requireReady = true) => {
    if (!sessionRef.current || !sessionWritableRef.current) {
      return false;
    }

    if (!isLiveSessionSocketOpen(sessionRef.current)) {
      sessionWritableRef.current = false;
      return false;
    }

    if (requireReady && !sessionReadyRef.current) {
      return false;
    }

    return true;
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

    const activeSession = sessionRef.current;
    sessionRef.current = null;

    if (closeSocket && activeSession) {
      try {
        activeSession.close();
      } catch {}
    }

    await releaseAudioResources();

    setLiveUserCaption("");
    setLiveAssistantCaption("");
    setStatus(nextStatus);

    if (reason) {
      appendTranscript("system", reason);
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

  const applySearchState = (
    nextSearchTerm: string,
    nextFilters: ProductFilters,
    scope: "catalog" | "current-results",
    baseResults?: StoreProduct[],
  ) => {
    const nextState = searchProducts(
      products,
      { searchTerm: nextSearchTerm, filters: nextFilters },
      baseResults,
    );

    startTransition(() => {
      setSearchDraft(nextSearchTerm);
      setFilters(nextFilters);
      setSearchState(nextState);
      setSelectedProductId(nextState.results[0]?.id ?? null);
      setAttributeExplanation(null);
      setVoiceInsight({
        query: nextState.normalizedSearchTerm,
        filters: nextFilters,
        scope,
        resultCount: nextState.results.length,
      });
    });

    return nextState;
  };

  const handleToolCall = (call: FunctionCall) => {
    const args = (call.args ?? {}) as Record<string, unknown>;

    switch (call.name) {
      case "searchProducts": {
        const nextFilters = mergeFilters(defaultFilters, args);
        const nextSearchTerm =
          parseString(args.searchTerm) ?? searchDraftRef.current;
        const result = applySearchState(nextSearchTerm, nextFilters, "catalog");

        appendTranscript(
          "tool",
          `searchProducts -> "${result.normalizedSearchTerm || "catalog"}" • ${result.results.length} results`,
        );

        return {
          output: {
            summary: result.summary,
            normalizedSearchTerm: result.normalizedSearchTerm,
            filters: result.filters,
            matches: result.results.slice(0, 5).map((product, index) => ({
              resultIndex: index + 1,
              productId: product.id,
              name: product.name,
              price: product.price,
              inventory: product.inventory,
            })),
          },
        };
      }
      case "filterResults": {
        const nextFilters = mergeFilters(filtersRef.current, args);
        const nextSearchTerm =
          parseString(args.searchTerm) ?? searchDraftRef.current;
        const result = applySearchState(
          nextSearchTerm,
          nextFilters,
          "current-results",
          searchStateRef.current.results,
        );

        appendTranscript(
          "tool",
          `filterResults -> ${result.results.length} remaining`,
        );

        return {
          output: {
            summary: result.summary,
            normalizedSearchTerm: result.normalizedSearchTerm,
            filters: result.filters,
            matches: result.results.slice(0, 5).map((product, index) => ({
              resultIndex: index + 1,
              productId: product.id,
              name: product.name,
              price: product.price,
              inventory: product.inventory,
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
              message: "I could not find that result in the current list.",
            },
          };
        }

        startTransition(() => {
          setSelectedProductId(product.id);
          setAttributeExplanation(null);
        });

        appendTranscript("tool", `openProduct -> ${product.name}`);

        return {
          output: {
            productId: product.id,
            name: product.name,
            price: product.price,
            inventory: product.inventory,
            category: product.category,
            brand: product.brand,
          },
        };
      }
      case "explainProductAttribute": {
        const resultIndex = parseNumber(args.resultIndex);
        const productId = parseString(args.productId);
        const attributeQuery = parseString(args.attributeQuery) ?? "this product";
        const product =
          (productId ? products.find((entry) => entry.id === productId) : undefined) ??
          (resultIndex
            ? searchStateRef.current.results[Math.max(0, resultIndex - 1)]
            : undefined) ??
          products.find((entry) => entry.id === selectedProductIdRef.current);

        const explanation = explainProductAttribute(product, attributeQuery);

        startTransition(() => {
          setAttributeExplanation({
            title: product
              ? `${attributeQuery} on ${product.name}`
              : `About ${attributeQuery}`,
            body: explanation,
          });
        });

        appendTranscript("tool", `explainProductAttribute -> ${attributeQuery}`);

        return {
          output: {
            explanation,
            productId: product?.id ?? null,
            productName: product?.name ?? null,
          },
        };
      }
      case "stopSession": {
        const reason = parseString(args.reason) ?? "Voice session ended.";
        window.setTimeout(() => {
          void stopSession(reason, true, "idle");
        }, 180);

        appendTranscript("tool", "stopSession -> closing voice loop");

        return {
          output: {
            status: "stopping",
            reason,
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
    }

    if (message.setupComplete) {
      clearSetupTimeout();
      sessionReadyRef.current = true;
      setStatus("listening");
    }

    if (message.toolCall?.functionCalls?.length) {
      setStatus("thinking");

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
        } catch {}
      }
    }

    if (!message.serverContent) {
      return;
    }

    const { serverContent } = message;

    if (serverContent.inputTranscription?.text) {
      setLiveUserCaption(serverContent.inputTranscription.text);
      appendTranscript("user", serverContent.inputTranscription.text, true);
      setStatus("listening");
    }

    if (serverContent.outputTranscription?.text) {
      setLiveAssistantCaption(serverContent.outputTranscription.text);
      appendTranscript("assistant", serverContent.outputTranscription.text, true);
      setStatus("speaking");
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

    if (serverContent.waitingForInput) {
      setStatus("listening");
    }

    if (serverContent.turnComplete) {
      finalizeLiveEntries();
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
    if (sessionRef.current || status === "connecting") {
      return;
    }

    setError(null);
    setStatus("connecting");
    appendTranscript("system", "Starting Gemini Live shopping session...");
    sessionWritableRef.current = false;
    sessionReadyRef.current = false;
    clearSetupTimeout();

    try {
      const tokenResponse = await fetch("/api/live-token");
      const tokenPayload = (await tokenResponse.json()) as TokenResponse;

      if (!tokenResponse.ok || !tokenPayload.token) {
        throw new Error(tokenPayload.error ?? "Unable to mint an ephemeral token.");
      }

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

      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      outputAudioContextRef.current = new AudioContext();
      await outputAudioContextRef.current.resume();

      const inputAudioContext = new AudioContext();
      inputAudioContextRef.current = inputAudioContext;
      await inputAudioContext.resume();

      const ai = new GoogleGenAI({
        apiKey: tokenPayload.token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model: tokenPayload.model ?? LIVE_MODEL,
        config: buildLiveConnectConfig(resumptionHandleRef.current),
        callbacks: {
          onopen: () => {
            sessionWritableRef.current = true;
            appendTranscript("system", "Session live. Ask for products or say stop session.");
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
            void stopSession(`Connection error: ${message}`, false, "error");
          },
          onclose: (event) => {
            sessionWritableRef.current = false;
            sessionReadyRef.current = false;
            if (isStoppingRef.current) {
              return;
            }

            void stopSession(
              formatLiveSessionCloseReason(event),
              false,
              "error",
            );
          },
        },
      });

      sessionRef.current = session;
      sessionWritableRef.current = isLiveSessionSocketOpen(session);
      setupTimeoutRef.current = window.setTimeout(() => {
        if (sessionReadyRef.current || isStoppingRef.current) {
          return;
        }

        void stopSession("Realtime session setup timed out.", true, "error");
      }, 10000);

      const { source, processor, silentGain } = await createMicCaptureNode(
        inputAudioContext,
        stream,
        (inputChannel) => {
          if (!canSendSessionMessage()) {
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
    } catch (sessionError) {
      sessionWritableRef.current = false;
      const message =
        sessionError instanceof Error
          ? sessionError.message
          : "Unable to start the session.";

      setError(message);
      await stopSession(`Start failed: ${message}`, false, "error");
    }
  };

  useEffect(() => {
    return () => {
      void stopSessionRef.current?.(undefined, true, "idle");
    };
  }, []);

  const inStockCount = products.filter((product) => product.inventory > 0).length;
  const fashionCount = products.filter((product) => product.division === "fashion").length;
  const electronicsCount = products.filter((product) => product.division === "electronics").length;

  return (
    <div className={styles.page}>
      <header className={styles.sessionBar}>
        <div className={styles.sessionIntro}>
          <div>
            <p className={styles.eyebrow}>Audio interactive ecommerce</p>
            <h1>Voice-led shopping with Gemini Live</h1>
          </div>
          <div className={styles.sessionControls}>
            <SessionPill status={status} />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void startSession()}
              disabled={status === "connecting"}
            >
              Start session
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void stopSession("Voice session ended.", true, "idle")}
              disabled={!sessionRef.current && status === "idle"}
            >
              Stop session
            </button>
          </div>
        </div>

        <div className={styles.captionGrid}>
          <div className={styles.captionCard}>
            <span className={styles.captionLabel}>You said</span>
            <p>{liveUserCaption || "Press start session and begin speaking."}</p>
          </div>
          <div className={styles.captionCard}>
            <span className={styles.captionLabel}>Assistant</span>
            <p>{liveAssistantCaption || "The assistant stays quiet until you interact."}</p>
          </div>
          <div className={styles.captionCard}>
            <span className={styles.captionLabel}>Voice search term</span>
            <p>{voiceInsight?.query || "No voice query yet."}</p>
          </div>
          <div className={styles.captionCard}>
            <span className={styles.captionLabel}>Applied filters</span>
            <p>{voiceInsight ? summarizeFilters(voiceInsight.filters) : "No filters applied yet."}</p>
          </div>
        </div>

        {error ? <p className={styles.errorBanner}>{error}</p> : null}
      </header>

      <main className={styles.contentGrid}>
        <section className={styles.heroPanel}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Home</p>
            <h2>Start with voice, refine with clicks, and keep the transcript in view.</h2>
            <p className={styles.heroText}>
              This storefront is seeded with {products.length} sample products across fashion and
              electronics. Ask for t-shirts, open the second result, tighten the price range, or ask
              what a product attribute means.
            </p>
            <div className={styles.metricRow}>
              <div className={styles.metricCard}>
                <span>{products.length}</span>
                <p>Total products</p>
              </div>
              <div className={styles.metricCard}>
                <span>{fashionCount}</span>
                <p>Fashion items</p>
              </div>
              <div className={styles.metricCard}>
                <span>{electronicsCount}</span>
                <p>Electronics items</p>
              </div>
              <div className={styles.metricCard}>
                <span>{inStockCount}</span>
                <p>In stock now</p>
              </div>
            </div>
          </div>

          <div className={styles.recommendationRail}>
            {featuredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className={styles.recommendationCard}
                onClick={() => {
                  setSelectedProductId(product.id);
                  setAttributeExplanation(null);
                }}
              >
                <img src={product.image} alt={product.name} />
                <div>
                  <p className={styles.recommendationEyebrow}>{product.category}</p>
                  <h3>{product.name}</h3>
                  <p>{formatCurrency(product.price)}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Transcript</p>
                <h2>Session log</h2>
              </div>
              <span className={styles.smallTag}>{transcriptEntries.length} entries</span>
            </div>
            <div className={styles.transcriptList}>
              {transcriptEntries.map((entry) => (
                <div key={entry.id} className={styles.transcriptEntry}>
                  <span className={`${styles.transcriptRole} ${styles[`role${entry.role}`]}`}>
                    {entry.role}
                  </span>
                  <p>{entry.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Product detail</p>
                <h2>{selectedProduct?.name ?? "Select a product"}</h2>
              </div>
              {selectedProduct ? (
                <span className={styles.smallTag}>{selectedProduct.category}</span>
              ) : null}
            </div>

            {selectedProduct ? (
              <div className={styles.detailBody}>
                <img
                  className={styles.detailImage}
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                />
                <div className={styles.detailMeta}>
                  <div className={styles.detailPriceRow}>
                    <strong>{formatCurrency(selectedProduct.price)}</strong>
                    <span>{selectedProduct.inventory} in stock</span>
                  </div>
                  <p className={styles.detailDescription}>{selectedProduct.description}</p>
                  <div className={styles.attributeList}>
                    {selectedProduct.attributes.map((attribute) => (
                      <div key={`${selectedProduct.id}-${attribute.label}`} className={styles.attributeRow}>
                        <span>{attribute.label}</span>
                        <strong>{attribute.value}</strong>
                      </div>
                    ))}
                  </div>
                  {attributeExplanation ? (
                    <div className={styles.explanationCard}>
                      <p className={styles.eyebrow}>Attribute help</p>
                      <h3>{attributeExplanation.title}</h3>
                      <p>{attributeExplanation.body}</p>
                    </div>
                  ) : (
                    <p className={styles.detailHint}>
                      Ask &ldquo;what does OLED mean?&rdquo; or &ldquo;what is the return policy on this one?&rdquo;
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className={styles.emptyState}>Search or select a product to inspect it here.</p>
            )}
          </section>
        </aside>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Search controls</p>
              <h2>Manual filters stay in sync with voice actions</h2>
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setSearchDraft("");
                setFilters(defaultFilters);
                setVoiceInsight(null);
                setAttributeExplanation(null);
              }}
            >
              Reset filters
            </button>
          </div>

          <div className={styles.filtersGrid}>
            <label className={styles.field}>
              <span>Search</span>
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Try oversized tee, laptop, wireless earphones..."
              />
            </label>

            <label className={styles.field}>
              <span>Division</span>
              <select
                value={filters.division}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    division: event.target.value as ProductFilters["division"],
                  }))
                }
              >
                <option value="all">All departments</option>
                <option value="fashion">Fashion</option>
                <option value="electronics">Electronics</option>
              </select>
            </label>

            <label className={styles.field}>
              <span>Category</span>
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                <option value="all">All categories</option>
                {options.categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Brand</span>
              <select
                value={filters.brand}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    brand: event.target.value,
                  }))
                }
              >
                <option value="all">All brands</option>
                {options.brands.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Min price</span>
              <input
                type="number"
                min="0"
                value={filters.minPrice ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minPrice: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                placeholder="0"
              />
            </label>

            <label className={styles.field}>
              <span>Max price</span>
              <input
                type="number"
                min="0"
                value={filters.maxPrice ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    maxPrice: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                placeholder="250"
              />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={filters.availability === "in-stock"}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    availability: event.target.checked ? "in-stock" : "all",
                  }))
                }
              />
              <span>Only show in-stock items</span>
            </label>
          </div>

          <div className={styles.tagCloud}>
            {options.tags.map((tag) => {
              const active = filters.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`${styles.tagButton} ${active ? styles.tagButtonActive : ""}`}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      tags: active
                        ? current.tags.filter((entry) => entry !== tag)
                        : [...current.tags, tag],
                    }))
                  }
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.eyebrow}>Results</p>
              <h2>{searchState.summary}</h2>
            </div>
            <div className={styles.resultsMeta}>
              <span className={styles.smallTag}>
                Search: {searchState.normalizedSearchTerm || "catalog"}
              </span>
              <span className={styles.smallTag}>
                Filters: {toSearchLabel(summarizeFilters(searchState.filters))}
              </span>
            </div>
          </div>

          <div className={styles.resultsGrid}>
            {searchState.results.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                active={product.id === selectedProductId}
                onSelect={(productId) => {
                  setSelectedProductId(productId);
                  setAttributeExplanation(null);
                }}
              />
            ))}
          </div>

          {searchState.results.length === 0 ? (
            <p className={styles.emptyState}>
              No results matched the current query. Try broadening the search or clearing filters.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

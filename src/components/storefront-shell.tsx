"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useStorefront } from "@/components/storefront-provider";

import styles from "./storefront-shell.module.css";

function StatusDot({ status }: { status: ReturnType<typeof useStorefront>["status"] }) {
  return <span className={`${styles.statusDot} ${styles[`status${status}`]}`} />;
}

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const {
    status,
    liveUserCaption,
    error,
    debugState,
    debugEvents,
    bagItems,
    startSession,
    stopSession,
    clearDebugEvents,
  } = useStorefront();
  const [debugOpen, setDebugOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bagCount = bagItems.reduce((total, item) => total + item.quantity, 0);
  const debugReport = useMemo(
    () =>
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          debugState,
          debugEvents,
        },
        null,
        2,
      ),
    [debugEvents, debugState],
  );

  const copyDebugReport = async () => {
    try {
      await navigator.clipboard.writeText(debugReport);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.brandBlock}>
            <Link href="/" className={styles.brand}>
              Maison Aural
            </Link>
            <nav className={styles.nav}>
              <Link href="/">Home</Link>
              <Link href="/search">Search</Link>
              <Link href="/bag">Bag ({bagCount})</Link>
            </nav>
          </div>

          <div className={styles.controls}>
            <StatusDot status={status} />
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
              onClick={() => void stopSession()}
            >
              Stop
            </button>
          </div>
        </div>

        <p className={styles.liveLine}>{liveUserCaption || "\u00A0"}</p>
        {error ? <p className={styles.errorLine}>{error}</p> : null}
      </header>

      <main className={styles.main}>{children}</main>

      <section className={styles.debugPanel}>
        <div className={styles.debugHeader}>
          <div>
            <p className={styles.debugEyebrow}>Live Debug</p>
            <h2>Session internals</h2>
          </div>
          <div className={styles.debugActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void copyDebugReport()}
            >
              {copied ? "Copied" : "Copy debug"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={clearDebugEvents}
            >
              Clear log
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDebugOpen((current) => !current)}
            >
              {debugOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {debugOpen ? (
          <>
            <dl className={styles.debugGrid}>
              <div>
                <dt>Status</dt>
                <dd>{debugState.status}</dd>
              </div>
              <div>
                <dt>Socket</dt>
                <dd>{debugState.socketState}</dd>
              </div>
              <div>
                <dt>Writable / Ready</dt>
                <dd>
                  {String(debugState.sessionWritable)} / {String(debugState.sessionReady)}
                </dd>
              </div>
              <div>
                <dt>Token / Media / Connect</dt>
                <dd>
                  {debugState.tokenStatus} / {debugState.mediaStatus} /{" "}
                  {debugState.connectStatus}
                </dd>
              </div>
              <div>
                <dt>Path</dt>
                <dd>{debugState.pathname}</dd>
              </div>
              <div>
                <dt>Search</dt>
                <dd>
                  {debugState.searchTerm || "(empty)"} / {debugState.searchResultCount} results
                </dd>
              </div>
              <div>
                <dt>Active product</dt>
                <dd>{debugState.activeProductId ?? "(none)"}</dd>
              </div>
              <div>
                <dt>Route context sends</dt>
                <dd>{debugState.routeContextSendCount}</dd>
              </div>
              <div>
                <dt>Mic chunks</dt>
                <dd>
                  {debugState.micChunkCount} captured / {debugState.micChunkSendCount} sent
                </dd>
              </div>
              <div>
                <dt>Last mic level</dt>
                <dd>{debugState.lastMicLevel}</dd>
              </div>
              <div>
                <dt>Transcripts</dt>
                <dd>
                  {debugState.inputTranscriptCount} in / {debugState.outputTranscriptCount} out
                </dd>
              </div>
              <div>
                <dt>Tool calls / responses</dt>
                <dd>
                  {debugState.toolCallCount} / {debugState.toolResponseCount}
                </dd>
              </div>
              <div className={styles.debugWide}>
                <dt>Last server event</dt>
                <dd>{debugState.lastServerEvent}</dd>
              </div>
              <div className={styles.debugWide}>
                <dt>Last route context</dt>
                <dd>{debugState.lastRouteContext || "(none yet)"}</dd>
              </div>
              <div className={styles.debugWide}>
                <dt>Last close reason</dt>
                <dd>{debugState.lastCloseReason ?? "(none)"}</dd>
              </div>
              <div className={styles.debugWide}>
                <dt>Current error</dt>
                <dd>{debugState.error ?? "(none)"}</dd>
              </div>
            </dl>

            <div className={styles.debugLog}>
              {debugEvents.map((entry) => (
                <article key={entry.id} className={styles.debugEvent}>
                  <div className={styles.debugEventMeta}>
                    <strong>{entry.type}</strong>
                    <span>{entry.at}</span>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export function StorefrontLoadingShell() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.brandBlock}>
            <span className={styles.brand}>Maison Aural</span>
          </div>
        </div>
        <p className={styles.liveLine}>&nbsp;</p>
      </header>

      <main className={styles.main} />
    </div>
  );
}

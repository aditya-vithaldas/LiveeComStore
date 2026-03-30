import type { Session } from "@google/genai";

type SessionSocketShape = Session & {
  conn?: {
    ws?: {
      readyState?: number;
    };
  };
};

const SOCKET_OPEN_STATE = 1;
const SOCKET_STATE_LABELS = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const;

export function getLiveSessionSocketReadyState(session: Session | null) {
  if (!session) {
    return null;
  }

  const readyState = (session as SessionSocketShape).conn?.ws?.readyState;

  return typeof readyState === "number" ? readyState : null;
}

export function getLiveSessionSocketStateLabel(session: Session | null) {
  const readyState = getLiveSessionSocketReadyState(session);

  if (readyState === null) {
    return session ? "UNKNOWN" : "NOT_CREATED";
  }

  return SOCKET_STATE_LABELS[readyState] ?? `UNKNOWN_${readyState}`;
}

export function isLiveSessionSocketOpen(session: Session | null) {
  if (!session) {
    return false;
  }

  const readyState = getLiveSessionSocketReadyState(session);

  if (readyState === null) {
    return true;
  }

  return readyState === SOCKET_OPEN_STATE;
}

export function formatLiveSessionCloseReason(event: Event) {
  const closeEvent = event as CloseEvent;
  const code =
    typeof closeEvent.code === "number" ? closeEvent.code : undefined;
  const reason =
    typeof closeEvent.reason === "string" ? closeEvent.reason.trim() : "";

  if (typeof code === "number" && reason) {
    return `Realtime session closed (code ${code}: ${reason}).`;
  }

  if (typeof code === "number") {
    return `Realtime session closed (code ${code}).`;
  }

  return "Realtime session closed unexpectedly.";
}

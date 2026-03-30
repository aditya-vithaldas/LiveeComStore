import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { LIVE_MODEL, getTokenConstraintConfig } from "@/lib/live-tools";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is missing. Set it in your environment before starting the session.",
      },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });

  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      newSessionExpireTime: new Date(now + 5 * 60 * 1000).toISOString(),
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: LIVE_MODEL,
        config: getTokenConstraintConfig(),
      },
    },
  });

  return NextResponse.json({
    token: token.name,
    model: LIVE_MODEL,
  });
}

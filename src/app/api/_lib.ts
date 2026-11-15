import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ConfigError, getCineverse, type CineverseService } from "@/core";

/**
 * Wraps a route: optional CINEVERSE_API_KEY check (for external clients like the Android app),
 * a shared service instance, and consistent JSON errors.
 */
export function route<C>(handler: (req: Request, svc: CineverseService, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const required = process.env.CINEVERSE_API_KEY?.trim();
    if (required) {
      const given = req.headers.get("x-cineverse-key") ?? "";
      const ok = given.length === required.length && timingSafeEqual(Buffer.from(given), Buffer.from(required));
      if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
      return NextResponse.json(await handler(req, getCineverse(), ctx));
    } catch (e) {
      const err = e as Error;
      const status = e instanceof ConfigError ? 500 : e instanceof BadRequest ? 400 : 502;
      if (status !== 400) console.error("[cineverse]", err);
      return NextResponse.json({ error: err.message }, { status });
    }
  };
}

export class BadRequest extends Error {}

export type IdCtx = { params: Promise<{ id: string }> };

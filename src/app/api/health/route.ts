import { route } from "../_lib";

/** GET /api/health → which AI / catalogue / playback providers are active (never returns keys). */
export const GET = route(async (_req, svc) => ({ ok: true, ...svc.info() }));

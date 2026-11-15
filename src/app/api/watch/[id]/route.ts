import { route, type IdCtx } from "../../_lib";

/** GET /api/watch/tmdb:603?region=IN → { mode: PLAY | WHERE_TO_WATCH | TRAILER_ONLY | UNAVAILABLE, ... } */
export const GET = route<IdCtx>(async (req, svc, { params }) => {
  const region = new URL(req.url).searchParams.get("region")?.toUpperCase() || undefined;
  return svc.watch(decodeURIComponent((await params).id), region);
});

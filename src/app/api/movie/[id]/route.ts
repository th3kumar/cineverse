import { route, type IdCtx } from "../../_lib";

/** GET /api/movie/tmdb:603 */
export const GET = route<IdCtx>(async (_req, svc, { params }) => svc.movie(decodeURIComponent((await params).id)));

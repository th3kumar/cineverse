import { z } from "zod";
import { BadRequest, route } from "../_lib";

const Body = z.object({
  query: z.string().min(2).max(500),
  count: z.number().int().min(1).max(10).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

/** POST /api/recommend  { "query": "a mind-bending psychological thriller" } */
export const POST = route(async (req, svc) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new BadRequest(z.prettifyError(parsed.error));
  return svc.recommend(parsed.data.query, parsed.data);
});

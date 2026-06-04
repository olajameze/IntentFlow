import { z } from "zod";

/** Postgres UUID columns — accepts seed/demo IDs (Zod 4 strict `.uuid()` rejects non-RFC values). */
export const uuidLike = z.guid();

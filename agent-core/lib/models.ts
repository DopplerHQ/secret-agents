import { z } from "zod";

const DateSchema = z.preprocess((arg) => {
  if (typeof arg === "string") {
    return new Date(arg);
  }
}, z.date());

export const RequestSchema = z.object({
  type: z.string(),
  timestamp: DateSchema,
  body: z.record(z.any()),
});
export type Request = z.infer<typeof RequestSchema>;
export type Response = { status: "ok"; body: Record<string, unknown> } | { status: "error"; metadata: Record<string, unknown> };

export type RequestHandler = (request: Request) => Promise<Response>;

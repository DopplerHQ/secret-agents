import https from "https";
import * as jose from "jose";
import { z } from "zod";
import { AgentError, jsonifyError } from "./utils.js";
import { RequestSchema, Request, Response, RequestHandler } from "./models.js";

export { AgentError, Request, Response, RequestHandler };

export type ProcessRequestOptions = { overrideKeySetURL?: string };

const MAX_ABS_REQUEST_AGE_MS = 30 * 1000; // 30 seconds

async function verifySignature(signature: string, options: ProcessRequestOptions = {}) {
  let decodedHeader;
  try {
    decodedHeader = jose.decodeProtectedHeader(signature);
  } catch (error) {
    throw new AgentError("Invalid JWS header format");
  }

  z.enum(["ES512"]).parse(decodedHeader.alg);

  const keySet = jose.createRemoteJWKSet(
    new URL(options.overrideKeySetURL ?? "https://keys.doppler.com/secret-agents/jwks.json"),
    {
      agent: new https.Agent({ minVersion: "TLSv1.3" }),
    }
  );
  return await jose.compactVerify(signature, keySet);
}

export async function verifyRequest(signature: string, options: ProcessRequestOptions = {}) {
  const decodedSignature = await verifySignature(signature, options);
  let objectPayload;
  try {
    objectPayload = JSON.parse(new TextDecoder().decode(decodedSignature.payload));
  } catch (e) {
    throw new Error("Failed to parse signature payload as JSON");
  }
  const agentRequest = RequestSchema.parse(objectPayload);
  const absoluteRequestAgeMs = Math.abs(agentRequest.timestamp.valueOf() - Date.now());
  if (absoluteRequestAgeMs > MAX_ABS_REQUEST_AGE_MS) {
    throw new Error(`Request age is outside of processing window: ${agentRequest.timestamp.toISOString()}`);
  }
  return agentRequest;
}

export async function processRequest(
  signature: string,
  subhandler: RequestHandler,
  options: ProcessRequestOptions = {}
): Promise<Response> {
  try {
    const agentRequest = await verifyRequest(signature, options);
    return await subhandler(agentRequest);
  } catch (e) {
    return { status: "error", metadata: jsonifyError(e as Error) };
  }
}

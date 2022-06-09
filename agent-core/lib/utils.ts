import { inspect } from "util";

export function getSuperclasses(obj: any) {
  const superclasses = [];
  let prototype = Object.getPrototypeOf(obj);
  while (prototype !== null) {
    superclasses.push(prototype.constructor.name);
    prototype = Object.getPrototypeOf(prototype);
  }
  return superclasses;
}

export function jsonifyError(error: Error) {
  const wrappedError: Record<string, any> = {};
  wrappedError.name = error.name || "<no name available>";
  wrappedError.className = error.constructor.name || "<no class name available>";
  wrappedError.message = error.message || "<no message available>";
  wrappedError.superclasses = getSuperclasses(error);
  wrappedError.inspect = inspect(error);
  if (typeof error.stack === "string" && error.stack.length > 0) {
    wrappedError.stack = error.stack
      .split("\n")
      .map((x) => x.replace(/^\s+/, ""))
      .filter((x) => x);
  } else {
    wrappedError.stack = "<no stack trace available>";
  }
  return wrappedError;
}

export class AgentError extends Error {
  public data: Record<string, unknown>;

  constructor(message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.data = data;
  }
}

export interface HTTPRequestResponse {
  statusCode?: number;
  headers: Record<string, unknown>;
  body: string;
}

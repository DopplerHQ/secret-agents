import pg from "pg";
import pgFormat from "pg-format";
import { z } from "zod";
import { Request, Response, AgentError } from "@dopplerhq/agent-core";

const SSL_SCHEMA = z
  .object({
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
    rejectUauthorized: z.boolean().optional(),
  })
  .optional();

function isInvalidCredentialError(error: Error) {
  // 28P01 (Failed Password Auth) and 28000 (User does not exist) are "expected" errors which would indicate that the user is invalid.
  // Any other errors should be rethrown.
  return error instanceof pg.DatabaseError && (error.code === "28P01" || error.code === "28000");
}

export async function handleUpdateUser(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string(),
      ssl: SSL_SCHEMA,
      managingUser: z.object({
        username: z.string(),
        password: z.string(),
      }),
      rotateUser: z.object({
        username: z.string(),
        currentPassword: z.string(),
        newPassword: z.string(),
      }),
    })
    .parse(body);

  const connectionOptions = {
    host: params.host,
    port: params.port,
    database: params.database,
    connectionTimeoutMillis: 3000,
    ssl: params.ssl,
  };

  const testClient = new pg.Client({
    ...connectionOptions,
    user: params.rotateUser.username,
    password: params.rotateUser.currentPassword,
  });

  try {
    await testClient.connect();
  } catch (testError) {
    if (isInvalidCredentialError(testError as Error)) {
      throw new AgentError("Unable to update credential, current credential is not valid");
    }
    throw testError;
  }

  await testClient.end();

  const client = new pg.Client({
    ...connectionOptions,
    user: params.managingUser.username,
    password: params.managingUser.password,
  });

  await client.connect();

  // pgsql can't parameterize utility directly
  const query = pgFormat("ALTER USER %I WITH PASSWORD %L", params.rotateUser.username, params.rotateUser.newPassword);

  await client.query(query);

  await client.end();

  return { status: "ok", body: {} };
}

export async function handleTestUsers(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string(),
      ssl: SSL_SCHEMA,
      users: z.array(
        z.object({
          username: z.string(),
          password: z.string(),
        })
      ),
    })
    .parse(body);

  try {
    await Promise.all(
      params.users.map(async ({ username, password }) => {
        const client = new pg.Client({
          host: params.host,
          port: params.port,
          database: params.database,
          ssl: params.ssl,
          user: username,
          password: password,
          connectionTimeoutMillis: 3000,
        });

        await client.connect();
        await client.query("SELECT NOW() as now");
        await client.end();
      })
    );
  } catch (connectionError) {
    if (connectionError instanceof Error && isInvalidCredentialError(connectionError)) {
      return {
        status: "ok",
        body: {
          type: "invalid",
          reason: connectionError.message,
        },
      };
    }
    throw connectionError;
  }
  return { status: "ok", body: { type: "valid" } };
}

export default async function handler(request: Request): Promise<Response> {
  switch (request.type) {
    case "status":
      return { status: "ok", body: {} };
    case "testCredentials":
      return handleTestUsers(request.body);
    case "updateCredential":
      return handleUpdateUser(request.body);
    default:
      throw new AgentError("Unknown request type");
  }
}

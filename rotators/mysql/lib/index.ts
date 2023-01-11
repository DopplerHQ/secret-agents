import mysql, { QueryError } from "mysql2/promise";
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
  const queryError = error as QueryError;
  return queryError.code != null && queryError.code === "ER_ACCESS_DENIED_ERROR";
}

export async function handleUpdateUser(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string().optional(),
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

  const connectionOptions: mysql.ConnectionOptions = {
    host: params.host,
    port: params.port,
    database: params.database,
    connectTimeout: 3000,
    ssl: params.ssl,
  };

  let testConnection;
  try {
    testConnection = await mysql.createConnection({
      ...connectionOptions,
      user: params.rotateUser.username,
      password: params.rotateUser.currentPassword,
    });
  } catch (testError) {
    if (isInvalidCredentialError(testError as Error)) {
      throw new AgentError("Unable to update credential, current credential is not valid");
    }
    throw testError;
  }

  await testConnection.end();

  const connection = await mysql.createConnection({
    ...connectionOptions,
    user: params.managingUser.username,
    password: params.managingUser.password,
  });

  await connection.query("ALTER USER ? IDENTIFIED BY ?", [params.rotateUser.username, params.rotateUser.newPassword]);

  await connection.end();

  return { status: "ok", body: {} };
}

export async function handleTestUsers(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string().optional(),
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
        const connection = await mysql.createConnection({
          host: params.host,
          port: params.port,
          database: params.database,
          ssl: params.ssl,
          user: username,
          password: password,
          connectTimeout: 3000,
        });

        await connection.query("SELECT NOW() as now");
        await connection.end();
      })
    );
  } catch (connectionError) {
    if (connectionError instanceof Error && isInvalidCredentialError(connectionError as Error)) {
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

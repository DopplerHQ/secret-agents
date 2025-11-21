import mssql, { MSSQLError, type config as Config } from "mssql";
import pgFormat from "pg-format";
import { z } from "zod";
import { Request, Response, AgentError } from "@dopplerhq/agent-core";

function isInvalidCredentialError(error: MSSQLError) {
  return error.code === "ELOGIN";
}

export async function handleUpdateUser(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string(),
      rotateUser: z.object({
        username: z.string(),
        currentPassword: z.string(),
        newPassword: z.string(),
      }),
    })
    .parse(body);

  const connectionOptions: Config = {
    server: params.host,
    port: params.port,
    database: params.database,
    connectionTimeout: 3000,
    options: {
      trustServerCertificate: true,
    },
  };

  let pool;

  try {
    pool = new mssql.ConnectionPool({
      ...connectionOptions,
      user: params.rotateUser.username,
      password: params.rotateUser.currentPassword,
    });
    await pool.connect();
  } catch (testError) {
    if (isInvalidCredentialError(testError as MSSQLError)) {
      throw new AgentError("Unable to update credential, current credential is not valid");
    }
    throw testError;
  }

  // SQL Server doesn't accept parameterized queries for the ALTER LOGIN command, so we need to send a raw SQL string.
  // Username and password have been previously validated, but out of an abundance of caution, we'll make sure to sanitize
  // the values prior to running the query. There is no JS implementation of SQL Server's validation logic, so we'll
  // use pg-format, which has been tested to generate the correct format for the following query.
  // Additionally, note that this query only works for users in contained databases.
  // Rotation for other authentication types (e.g. logins) is not yet implemented.
  const query = pgFormat(
    "ALTER USER %I WITH PASSWORD = %L OLD_PASSWORD = %L",
    params.rotateUser.username,
    params.rotateUser.newPassword,
    params.rotateUser.currentPassword
  );
  await pool.query(query);

  await pool.close();

  return { status: "ok", body: {} };
}

export async function handleTestUsers(body: Record<string, unknown>): Promise<Response> {
  const params = z
    .object({
      host: z.string(),
      port: z.number(),
      database: z.string().optional(),
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
        const pool = new mssql.ConnectionPool({
          server: params.host,
          port: params.port,
          database: params.database,
          connectionTimeout: 3000,
          user: username,
          password: password,
          options: {
            trustServerCertificate: true,
          },
        });
        await pool.connect();
        await pool.request().query("SELECT getdate() as now");
        await pool.close();
      })
    );
  } catch (connectionError) {
    if (connectionError instanceof Error && isInvalidCredentialError(connectionError as MSSQLError)) {
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

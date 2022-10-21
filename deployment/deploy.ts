import { promises } from "fs";
import { spawn as spawnEE } from "child_process";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import * as crypto from "crypto";
const { readFile, writeFile, readdir, rm, mkdtemp } = promises;

const config = {
  agentBuckets: (process.env.AGENT_BUCKETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length),
  signingBucket: process.env.SIGNING_BUCKET ?? "",
  signingProfileName: process.env.SIGNING_PROFILE_NAME ?? "",
  aws: {
    accessKeyId: process.env.DEPLOYER_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.DEPLOYER_AWS_SECRET_ACCESS_KEY,
  },
};

interface AppPackageJSON {
  name: string;
  version: string;
  secretAgentMeta: { platform: string };
}

interface ManifestAgent {
  name: string;
  versions: { id: string; releasedAt: string; sha256: string }[];
}

type DeployInfo =
  | { shouldDeploy: false; description: string }
  | { shouldDeploy: true; type: "create" | "update"; description: string };

async function readJSONFile(filename: string) {
  const body = (await readFile(filename)).toString();
  return JSON.parse(body);
}

async function getFileSHA256(filename: string, encoding: crypto.BinaryToTextEncoding) {
  const fileBuffer = await readFile(filename);
  const hashSum = createHash("sha256");

  hashSum.update(fileBuffer);
  return hashSum.digest(encoding);
}

async function makeTempDir(appName: string) {
  return await mkdtemp(join(tmpdir(), `secret-agents-build-${appName}-`));
}

interface SpawnOptions {
  timeout?: number | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

class SpawnError extends Error {
  public code: number | null;
  public stdout: string;
  public stderr: string;

  constructor(message: string, code: number | null, stdout: string, stderr: string) {
    super(message);
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  toString() {
    return [`SpawnError: ${this.message}`, `exit=${this.code}`, this.stderr].join("\n");
  }
}

async function spawn(command: string, args: string[], options: SpawnOptions = {}) {
  console.log(">", command, JSON.stringify(args));
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const process = spawnEE(command, args, {
      ...options,

      // If the shell option is enabled, any input containing shell metacharacters may be used to trigger arbitrary command execution.
      // We explicitly disable this, in case any caller attempts to enable it.
      shell: false,
    });
    process.stdout.on("data", (data) => {
      stdout += data;
    });

    process.stderr.on("data", (data) => {
      stderr += data;
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout, stderr: stderr });
      } else {
        reject(new SpawnError(`Command failed: ${command} ${JSON.stringify(args)}`, code, stdout, stderr));
      }
    });
  });
}

async function awsSpawn(args: string[], options: SpawnOptions = {}) {
  return await spawn("aws", args, {
    ...options,
    env: {
      ...options.env,
      AWS_ACCESS_KEY_ID: config.aws.accessKeyId,
      AWS_SECRET_ACCESS_KEY: config.aws.secretAccessKey,
      PATH: process.env.PATH,
    },
  });
}

async function awsSpawnJSON<T>(args: string[], options: SpawnOptions = {}) {
  const stringResult = await awsSpawn(args, options);
  try {
    return JSON.parse(stringResult.stdout) as T;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Failed to parse: ${JSON.stringify(stringResult)}`);
    }
    throw e;
  }
}

function formatPackage(appPackage: AppPackageJSON) {
  return `${appPackage.name} (${appPackage.version}/${appPackage.secretAgentMeta.platform})`;
}

async function main() {
  // Fetch the current manifest. If it doesn't exist, we'll create it.
  let manifest: ManifestAgent[] = [];
  try {
    // The zeroth bucket is the "primary" (i.e. source of truth) and is always written last.
    await awsSpawn(["s3", "cp", `s3://${config.agentBuckets[0]}/manifest.json`, "manifest.json"]);
    manifest = await readJSONFile("manifest.json");
  } catch (error: any) {
    const isManifestNotFoundError = error instanceof SpawnError && error.stderr.includes(`Key "manifest.json" does not exist`);
    if (!isManifestNotFoundError) {
      throw error;
    }
  }

  for (const appDir of await readdir("apps")) {
    // Load app's `package.json`
    const appPackage: AppPackageJSON = await readJSONFile(`apps/${appDir}/package.json`);

    // Only AWS is currently supported for deployment
    if (appPackage.secretAgentMeta.platform !== "aws") {
      console.log(`(X) ${formatPackage(appPackage)} :: Not deployable`);
      continue;
    }

    // Determine deploy type
    let deployInfo: DeployInfo;
    const existingAgent = manifest.find((a) => a.name === appPackage.name);
    if (!existingAgent) {
      deployInfo = { shouldDeploy: true, type: "create", description: "No existing version" };
    } else {
      const existingAgentVersion = existingAgent.versions[existingAgent.versions.length - 1];
      if (existingAgentVersion.id !== appPackage.version) {
        deployInfo = { shouldDeploy: true, type: "update", description: `${existingAgentVersion.id} -> ${appPackage.version}` };
      } else {
        deployInfo = { shouldDeploy: false, description: `On latest version (${existingAgentVersion.id})` };
      }
    }

    if (!deployInfo.shouldDeploy) {
      console.log(`(X) ${formatPackage(appPackage)} :: ${deployInfo.description}`);
      continue;
    }

    console.log(`... ${formatPackage(appPackage)} :: ${deployInfo.description}`);

    // Perform app-specific build process
    const buildDir = await makeTempDir(appPackage.name);
    const buildOutputPath = `${buildDir}/build.zip`;
    await spawn(`apps/${appDir}/build.sh`, [], {
      env: {
        PATH: process.env.PATH,
        OUTPUT_ZIP_PATH: buildOutputPath,
      },
    });

    const signingBundleName = `${appPackage.name}-${appPackage.version}.zip`;
    const signingSourceKey = `unsigned-${signingBundleName}`;
    const signingPrefix = "signed-";

    const uploadResult = await awsSpawnJSON<{ VersionId: string }>([
      "s3api",
      "put-object",
      "--body",
      `${buildOutputPath}`,
      "--bucket",
      `${config.signingBucket}`,
      "--key",
      `${signingSourceKey}`,
    ]);

    await rm(buildDir, { recursive: true });

    // Start signing (non-blocking)
    const startSigningResult = await awsSpawnJSON<{ jobId: string }>([
      "signer",
      "start-signing-job",
      "--profile-name",
      `${config.signingProfileName}`,
      "--source",
      `s3={bucketName=${config.signingBucket},key=${signingSourceKey},version=${uploadResult.VersionId}}`,
      "--destination",
      `s3={bucketName=${config.signingBucket},prefix=${signingPrefix}}`,
    ]);

    // Wait for signing job to finish and get result with output
    await awsSpawn([`signer`, `wait`, `successful-signing-job`, `--job-id`, `${startSigningResult.jobId}`]);
    const signingResult = await awsSpawnJSON<{ status: string; statusReason: string; signedObject: { s3: { key: string } } }>([
      "signer",
      "describe-signing-job",
      "--job-id",
      `${startSigningResult.jobId}`,
    ]);

    if (signingResult.status !== "Succeeded") {
      throw new Error(`Signing Failed: ${signingResult.statusReason}`);
    }

    // Download signed bundle to compute SHA256 hash
    const signedLocalPath = `${signingPrefix}${signingBundleName}`;
    await awsSpawn(["s3", "cp", `s3://${config.signingBucket}/${signingResult.signedObject.s3.key}`, `${signedLocalPath}`]);

    const sha256Base64 = await getFileSHA256(signedLocalPath, "base64");

    await rm(signedLocalPath);

    // Copy bundle to all agent buckets
    await Promise.all(
      config.agentBuckets.map(async (bucket) => {
        const sourcePath = `s3://${config.signingBucket}/${signingResult.signedObject.s3.key}`;
        const destinationDirPath = `s3://${bucket}/${appPackage.name}`;
        await Promise.all([
          // Semantic version name for version pinning and explicit version upgrades
          awsSpawn(["s3", "cp", sourcePath, `${destinationDirPath}/${appPackage.version}.zip`]),
          // `latest.zip` name for easy installation
          awsSpawn(["s3", "cp", sourcePath, `${destinationDirPath}/latest.zip`]),
        ]);
      })
    );

    // Clear signing bucket
    await awsSpawn(["s3", "rm", `s3://${config.signingBucket}`, "--recursive"]);

    // Update manifests
    const newVersion = {
      id: appPackage.version,
      releasedAt: new Date().toISOString(),
      sha256: sha256Base64,
    };

    if (deployInfo.type === "create") {
      manifest.push({
        name: appPackage.name,
        versions: [newVersion],
      });
    } else {
      if (!existingAgent) {
        throw new Error("Could not find existing agent");
      }
      existingAgent.versions.push(newVersion);
    }

    await writeFile("manifest.json", JSON.stringify(manifest, null, 2));
    const saveManifest = async (bucket: string) => await awsSpawn(["s3", "cp", "manifest.json", `s3://${bucket}/manifest.json`]);
    // Concurrently write to all buckets *except* the primary
    await Promise.all(config.agentBuckets.slice(1).map(saveManifest));
    // Write the primary last
    await saveManifest(config.agentBuckets[0]);

    console.log(`(/) ${formatPackage(appPackage)} :: Published ${sha256Base64}`);
  }
}

main();

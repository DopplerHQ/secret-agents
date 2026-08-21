#!/bin/bash
set -eo pipefail

BUILD_DIR=$(mktemp -d)

cp ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml "$BUILD_DIR"
cp ./tsconfig* "$BUILD_DIR"

cp -r ./agent-core "$BUILD_DIR/agent-core"
mkdir -p "$BUILD_DIR/rotators"
cp -r ./rotators/postgres "$BUILD_DIR/rotators/postgres"
mkdir -p "$BUILD_DIR/utils"
cp -r ./utils/aws "$BUILD_DIR/utils/aws"
mkdir -p "$BUILD_DIR/apps"
cp -r ./apps/aws-postgres-rotator "$BUILD_DIR/apps/aws-postgres-rotator"

pushd "$BUILD_DIR"

pnpm install --no-frozen-lockfile
pnpm --dir ./agent-core run build
pnpm --dir ./rotators/postgres run build
pnpm --dir ./utils/aws run build
pnpm --dir ./apps/aws-postgres-rotator run build

find . -name node_modules -type d -prune -exec rm -rf {} +

pnpm install --prod --frozen-lockfile

zip -r "$OUTPUT_ZIP_PATH" .

popd

rm -r "$BUILD_DIR"

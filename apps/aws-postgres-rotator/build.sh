#!/bin/bash
set -eo pipefail

BUILD_DIR=$(mktemp -d)

cp ./package*.json "$BUILD_DIR"
cp ./tsconfig* "$BUILD_DIR"

cp -r ./agent-core "$BUILD_DIR/agent-core"
mkdir -p "$BUILD_DIR/rotators"
cp -r ./rotators/postgres "$BUILD_DIR/rotators/postgres"
mkdir -p "$BUILD_DIR/utils"
cp -r ./utils/aws "$BUILD_DIR/utils/aws"
mkdir -p "$BUILD_DIR/apps"
cp -r ./apps/aws-postgres-rotator "$BUILD_DIR/apps/aws-postgres-rotator"

pushd "$BUILD_DIR"

npm install --workspace apps/aws-postgres-rotator
npm --prefix ./agent-core run build
npm --prefix ./rotators/postgres run build
npm --prefix ./utils/aws run build
npm --prefix ./apps/aws-postgres-rotator run build

rm -r node_modules

npm clean-install --production

zip -r "$OUTPUT_ZIP_PATH" .

popd

rm -r "$BUILD_DIR"

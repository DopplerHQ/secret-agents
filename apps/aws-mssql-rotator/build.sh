#!/bin/bash
set -eo pipefail

BUILD_DIR=$(mktemp -d)

cp ./package*.json "$BUILD_DIR"
cp ./tsconfig* "$BUILD_DIR"

cp -r ./agent-core "$BUILD_DIR/agent-core"
mkdir -p "$BUILD_DIR/rotators"
cp -r ./rotators/mssql "$BUILD_DIR/rotators/mssql"
mkdir -p "$BUILD_DIR/utils"
cp -r ./utils/aws "$BUILD_DIR/utils/aws"
mkdir -p "$BUILD_DIR/apps"
cp -r ./apps/aws-mssql-rotator "$BUILD_DIR/apps/aws-mssql-rotator"

pushd "$BUILD_DIR"

npm install --workspace apps/aws-mssql-rotator
npm --prefix ./agent-core run build
npm --prefix ./rotators/mssql run build
npm --prefix ./utils/aws run build
npm --prefix ./apps/aws-mssql-rotator run build

rm -r node_modules

npm clean-install --production

zip -r "$OUTPUT_ZIP_PATH" .

popd

rm -r "$BUILD_DIR"

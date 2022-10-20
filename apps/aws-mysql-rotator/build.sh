#!/bin/bash
set -eo pipefail

BUILD_DIR=$(mktemp -d)

cp ./package*.json "$BUILD_DIR"
cp ./tsconfig* "$BUILD_DIR"

cp -r ./agent-core "$BUILD_DIR/agent-core"
mkdir -p "$BUILD_DIR/rotators"
cp -r ./rotators/mysql "$BUILD_DIR/rotators/mysql"
mkdir -p "$BUILD_DIR/utils"
cp -r ./utils/aws "$BUILD_DIR/utils/aws"
mkdir -p "$BUILD_DIR/apps"
cp -r ./apps/aws-mysql-rotator "$BUILD_DIR/apps/aws-mysql-rotator"

pushd "$BUILD_DIR"

npm install --workspace apps/aws-mysql-rotator
npm --prefix ./agent-core run build
npm --prefix ./rotators/mysql run build
npm --prefix ./utils/aws run build
npm --prefix ./apps/aws-mysql-rotator run build

rm -r node_modules

npm clean-install --production

zip -r "$OUTPUT_ZIP_PATH" .

popd

rm -r "$BUILD_DIR"

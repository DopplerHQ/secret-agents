#!/bin/bash
set -eo pipefail

# Because the script will be run without a `package.json`, it cannot specifify `"type": "module"`.
# The `{"module": "CommonJS"}` option modifier tell ts-node to transpile our ESM imports to CJS before execution.
./node_modules/.bin/ts-node -O '{"module": "CommonJS"}' ./deployment/deploy.ts

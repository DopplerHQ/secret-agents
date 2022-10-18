# secret-agents

This project contains the official Doppler agents for performing actions such as secret rotation.

## Goals

- All work in one project
- Fewest possible dependencies per image
- Simple to develop, build, and release

## Deployment

- Feature branches should target the `develop` branch. When changes are merged, they will automatically be deployed to the _Staging_ environment.
- When changes in _Staging_ are ready to be released to _Production_, a "Main Update" PR should be created to merge `develop` in to `main`. Merging changes to `main` will automatically release the changes to _Production_.

Each app in the `apps` directory is deployable by the build system.
The platform is indicated by the `secretAgentMeta.platform` field in the app's `package.json`.

### `aws`

`aws` apps are deployed as zip files to S3.

The build system will attempt to invoke a script called `build.sh` in the app's root dir. This script is expected to create a zip bundle and copy it to the path provided in the `OUTPUT_ZIP_PATH` environment variable.

### `gcp`

`gcp` apps are not yet supported and will be quietly skipped.

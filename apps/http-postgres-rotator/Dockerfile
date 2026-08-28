FROM node:24-alpine as build

WORKDIR /usr/src/app

RUN npm install -g pnpm@11.22.0

# Copy package files and install all dependencies
COPY ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
COPY ./agent-core/package.json ./agent-core/
COPY ./rotators/postgres/package.json ./rotators/postgres/
COPY ./apps/http-postgres-rotator/package.json ./apps/http-postgres-rotator/
RUN pnpm install --no-frozen-lockfile

# Copy sources
COPY ./tsconfig* ./
COPY ./agent-core ./agent-core
COPY ./rotators/postgres ./rotators/postgres
COPY ./apps/http-postgres-rotator ./apps/http-postgres-rotator

# Build dependencies and app
RUN pnpm --dir ./agent-core run build
RUN pnpm --dir ./rotators/postgres run build
RUN pnpm --dir ./apps/http-postgres-rotator run build

# Only install production dependencies
RUN find . -name node_modules -type d -prune -exec rm -rf {} + && pnpm install --prod --frozen-lockfile

FROM node:24-alpine

WORKDIR /usr/src/app

COPY --from=build /usr/src/app .

CMD [ "node", "./apps/http-postgres-rotator/dist/index.js" ]

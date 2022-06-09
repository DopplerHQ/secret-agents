FROM node:16-alpine as build

WORKDIR /usr/src/app

# Copy package files and install all dependencies
COPY ./package*.json ./
COPY ./agent-core/package*.json ./agent-core/
COPY ./rotators/postgres/package*.json ./rotators/postgres/
COPY ./apps/http-postgres-rotator/package*.json ./apps/http-postgres-rotator/
RUN npm install --workspace apps/http-postgres-rotator

# Copy sources
COPY ./tsconfig* ./
COPY ./agent-core ./agent-core
COPY ./rotators/postgres ./rotators/postgres
COPY ./apps/http-postgres-rotator ./apps/http-postgres-rotator

# Build dependencies and app
RUN npm --prefix ./agent-core run build
RUN npm --prefix ./rotators/postgres run build
RUN npm --prefix ./apps/http-postgres-rotator run build

# Remove node_modules to be reinstalled later
RUN rm -r node_modules

FROM node:16-alpine

WORKDIR /usr/src/app

COPY --from=build /usr/src/app .

# Only install production dependencies
RUN npm install --production

CMD [ "node", "--experimental-specifier-resolution=node", "./apps/http-postgres-rotator/dist/index.js" ]

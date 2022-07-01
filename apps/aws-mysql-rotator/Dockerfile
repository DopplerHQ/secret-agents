FROM node:16-alpine as build

WORKDIR /usr/src/app

# Copy package files and install all dependencies
COPY ./package*.json ./
COPY ./agent-core/package*.json ./agent-core/
COPY ./rotators/mysql/package*.json ./rotators/mysql/
COPY ./utils/aws/package*.json ./utils/aws/
COPY ./apps/aws-mysql-rotator/package*.json ./apps/aws-mysql-rotator/
RUN npm install --workspace apps/aws-mysql-rotator

# Copy sources
COPY ./tsconfig* ./
COPY ./agent-core ./agent-core
COPY ./rotators/mysql ./rotators/mysql
COPY ./utils/aws ./utils/aws
COPY ./apps/aws-mysql-rotator ./apps/aws-mysql-rotator

# Build dependencies and app
RUN npm --prefix ./agent-core run build
RUN npm --prefix ./rotators/mysql run build
RUN npm --prefix ./utils/aws run build
RUN npm --prefix ./apps/aws-mysql-rotator run build

# Remove node_modules to be reinstalled later
RUN rm -r node_modules

FROM public.ecr.aws/lambda/nodejs:16

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=build /usr/src/app .

# Only install production dependencies
RUN npm clean-install --production

CMD [ "apps/aws-mysql-rotator/dist/app.handler" ]  

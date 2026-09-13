# Build the client, then run the server which also serves client/dist.
# Pulled from the ECR Public mirror: Docker Hub rate-limits anonymous pulls from CodeBuild.
FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client client
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Font for the results card rendered with @napi-rs/canvas (Alpine ships none).
RUN apk add --no-cache font-dejavu
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]

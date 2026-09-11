# Build the client, then run the server which also serves client/dist.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client client
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]

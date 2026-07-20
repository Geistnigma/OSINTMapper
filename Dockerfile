FROM node:20-alpine AS builder

WORKDIR /app

# Client build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY plugins/ ./plugins/
COPY shared/ ./shared/

# Generate Prisma client
RUN cd server && npx prisma generate

EXPOSE 4444
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node index.js"]

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/data /app/uploads
ENV DB_PATH=/app/data/copro.db
ENV UPLOAD_DIR=/app/uploads
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "node src/db/seed.js && node src/server.js"]

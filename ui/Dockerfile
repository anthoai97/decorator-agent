FROM node:22-bookworm-slim

WORKDIR /app/ui

COPY ui/package*.json ./

RUN npm ci

COPY ui/ ./

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

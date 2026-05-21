FROM node:20-slim

WORKDIR /app

# better-sqlite3 needs build tools on some platforms
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY client/package*.json ./client/
RUN cd client && npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/app.db

EXPOSE 3000
CMD ["npm", "start"]

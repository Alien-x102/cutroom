FROM node:22-slim
WORKDIR /app
COPY package.json server.js db.js ./
COPY public ./public
COPY scripts ./scripts
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/cutroom.db
EXPOSE 3000
CMD ["npm", "start"]

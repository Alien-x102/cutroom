FROM node:22-slim
WORKDIR /app
COPY package.json server.js db.js ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/cutroom.db
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]

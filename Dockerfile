FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build
ENV GAME_PORT=2567
EXPOSE 2567
CMD ["npm", "start"]

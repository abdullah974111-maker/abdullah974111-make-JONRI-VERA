FROM node:22-alpine

WORKDIR /app

# Install dependencies first so the layer is cached across source edits.
COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=development
EXPOSE 3001

CMD ["npm", "start"]

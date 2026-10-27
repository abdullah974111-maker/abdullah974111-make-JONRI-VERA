FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Dev server: hot reload against the API container.
# For production, run `npm run build` and serve dist/ from a CDN or static host.
CMD ["npm", "run", "dev"]

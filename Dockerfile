
FROM node:14
ENV NODE_ENV=production

RUN mkdir /app
WORKDIR /app
COPY package*.json ./
RUN npm install --production
ADD . /app/
COPY . .

EXPOSE 8080
CMD ["node", "/app/app.js"]

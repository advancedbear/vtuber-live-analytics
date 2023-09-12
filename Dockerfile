FROM node:18-buster-slim
WORKDIR /app
ADD . .
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN npm install && \
    npm install -g pm2
ENTRYPOINT ["pm2","--no-daemon","start","ecosystem.config.js"]
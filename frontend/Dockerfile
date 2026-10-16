FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Baked into the bundle at build time: the public origin the browser reaches
# the API on (nginx below proxies /api and /socket.io to the backend).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# "true" pre-fills the login form with the demo account (admin / admin).
ARG VITE_DEMO_LOGIN=false
ENV VITE_DEMO_LOGIN=$VITE_DEMO_LOGIN
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

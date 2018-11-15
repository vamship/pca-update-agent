FROM vamship/helm:1.1.0

ARG APP_NAME
ARG APP_VERSION
ARG CONFIG_NAME
ARG BUILD_DATE

# Metadata
LABEL org.label-schema.name=$APP_NAME \
      org.label-schema.version=$APP_VERSION \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.url="https://hub.docker.com/r/vamship/pca-update-agent/" \
      org.label-schema.vcs-url="https://github.com/vamship/pca-update-agent" 

RUN apk update && apk add nodejs
RUN mkdir -p app/logs

COPY ./dist app/dist
COPY ./.${CONFIG_NAME}rc app/.${CONFIG_NAME}rc
COPY ./package.json app/package.json
COPY ./package-lock.json app/package-lock.json

WORKDIR app

ENV NODE_ENV=production
RUN ["npm", "install", "-g", "."]

ENTRYPOINT ["pca-update", "apply"]

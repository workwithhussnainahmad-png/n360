FROM postgres:16-alpine

ARG TARGETARCH
RUN apk add --no-cache curl openssl nodejs \
    && test "${TARGETARCH}" = "amd64" -o "${TARGETARCH}" = "arm64" \
    && curl -fL -o mc "https://dl.min.io/client/mc/release/linux-${TARGETARCH}/mc" \
    && chmod +x mc \
    && mv mc /usr/local/bin/

COPY backup.sh /backup.sh
COPY encrypt-backup.mjs /encrypt-backup.mjs
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /backup.sh /entrypoint.sh && chmod +x /backup.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

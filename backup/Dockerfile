FROM postgres:16-alpine

# Google Drive uploads use the application's authenticated cron endpoint.
# No MinIO client is needed for this deployment.
RUN apk add --no-cache curl openssl nodejs

COPY backup.sh /backup.sh
COPY encrypt-backup.mjs /encrypt-backup.mjs
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /backup.sh /entrypoint.sh && chmod +x /backup.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

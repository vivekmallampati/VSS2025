# Dockerfile for VSS2025 Excel to Firebase Import Script
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and scripts
COPY package.json ./
COPY import-excel-to-firebase.js ./
COPY sync_email_to_uids.js ./
COPY sync_user_associated_registrations.js ./
COPY normalize-field-names.js ./

# Install dependencies
RUN npm install

# Note: The Excel file is not copied here because:
# 1. The excel-import service mounts it as a volume in docker-compose.yml
# 2. The normalize-field-names script doesn't need it (it updates existing Firestore documents)
# If you need the Excel file in the image, mount it as a volume or copy it separately
ENV EXCEL_FILE_PATH=/app/dataprocessing/Registrations_11_29.xlsx

# The service account key should be mounted as a volume or passed at runtime
# We'll create a directory for it
RUN mkdir -p /app/secrets

# Run the upload script
# Default: upload Registrations_21_11.xlsx
# Override with EXCEL_FILE_PATH environment variable
CMD ["node", "import-excel-to-firebase.js"]


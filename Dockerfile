# Dockerfile for VSS2025 Excel to Firebase Import Script
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and scripts
COPY package.json ./
COPY import-excel-to-firebase.js ./
COPY sync_email_to_uids.js ./
COPY sync_user_associated_registrations.js ./

# Install dependencies
RUN npm install

# Copy the latest registrations extract
COPY dataprocessing/Registrations_21_11.xlsx ./Registrations_21_11.xlsx
ENV EXCEL_FILE_PATH=Registrations_21_11.xlsx

# The service account key should be mounted as a volume or passed at runtime
# We'll create a directory for it
RUN mkdir -p /app/secrets

# Run the upload script
# Default: upload Registrations_21_11.xlsx
# Override with EXCEL_FILE_PATH environment variable
CMD ["node", "import-excel-to-firebase.js"]


# Dockerfile for VSS2025 Excel to Firebase Import Script
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the upload script and Excel file
COPY dataprocessing/upload_registrations_to_firestore.js ./
COPY dataprocessing/Registrations.xlsx ./

# The service account key should be mounted as a volume or passed at runtime
# We'll create a directory for it
RUN mkdir -p /app/secrets

# Run the upload script
# Default: upload Registrations.xlsx
# Override with EXCEL_FILE_PATH environment variable
CMD ["node", "upload_registrations_to_firestore.js"]


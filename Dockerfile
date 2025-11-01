# Dockerfile for VSS2025 Excel to Firebase Import Script
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the import script and Excel file
COPY import-excel-to-firebase.js ./
COPY TestData.xlsx ./

# The service account key should be mounted as a volume or passed at runtime
# We'll create a directory for it
RUN mkdir -p /app/secrets

# Run the import script
CMD ["node", "import-excel-to-firebase.js"]


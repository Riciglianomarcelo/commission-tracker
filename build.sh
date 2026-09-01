#!/bin/bash
set -e

echo "Building Commission Tracker..."

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm install --legacy-peer-deps || true
npm run build
cd ..

# Copy dist to backend
echo "📦 Copying frontend dist to backend..."
mkdir -p backend/dist
cp -r frontend/dist/* backend/dist/ || true

echo "✅ Build complete!"

#!/bin/bash

# Deploy Script for Transaction Dashboard

echo "🚀 Starting Deployment Process..."

# 1. Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "📦 Staging changes..."
  git add .
  
  TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
  echo "💾 Committing changes as 'Deploy $TIMESTAMP'..."
  git commit -m "Deploy $TIMESTAMP"
else
  echo "✅ No changes to commit."
fi

# 2. Push to Main
echo "⬆️ Pushing to GitHub main branch..."
git push origin main

if [ $? -eq 0 ]; then
  echo "✅ Push successful!"
  echo "🎉 Vercel build should be triggered automatically by the Git push."
  echo "   Check your Vercel dashboard: https://vercel.com/dashboard"
else
  echo "❌ Push failed. Please check your git configuration."
  exit 1
fi

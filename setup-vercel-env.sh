#!/bin/bash

# Vercel Environment Variables Setup Script
# This script adds all required environment variables to your Vercel project

set -e

echo "🚀 Setting up Vercel Environment Variables..."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "🔗 Linking to Vercel project..."
vercel link --yes

echo ""
echo "➕ Adding environment variables to production..."
echo ""

# Add each environment variable
echo "1/5 Adding VITE_SUPABASE_URL..."
echo "YOUR_SUPABASE_URL" | vercel env add VITE_SUPABASE_URL production

echo "2/5 Adding VITE_SUPABASE_ANON_KEY..."
echo "YOUR_SUPABASE_ANON_KEY" | vercel env add VITE_SUPABASE_ANON_KEY production

echo "3/5 Adding VITE_AIRTABLE_PAT..."
echo "YOUR_AIRTABLE_PAT" | vercel env add VITE_AIRTABLE_PAT production

echo "4/5 Adding VITE_AIRTABLE_BASE_ID..."
echo "YOUR_AIRTABLE_BASE_ID" | vercel env add VITE_AIRTABLE_BASE_ID production

echo "5/5 Adding VITE_INTELLIGENCE_WEBHOOK_URL..."
echo "YOUR_WEBHOOK_URL" | vercel env add VITE_INTELLIGENCE_WEBHOOK_URL production

echo ""
echo "✅ All environment variables added successfully!"
echo ""
echo "🔄 Triggering production deployment..."
vercel --prod

echo ""
echo "✨ Done! Your app will be live in 2-3 minutes at:"
echo "https://transaction-coordinator-dash-dosbrcvlw-jerez-lands-projects.vercel.app/"
echo ""

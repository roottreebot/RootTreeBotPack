#!/data/data/com.termux/files/usr/bin/bash
# === V1LE FARM BOT INSTALLER ===

echo "📦 Installing V1LE FARM Bot dependencies..."

# Update packages
pkg update -y
pkg upgrade -y

# Install Node.js and npm if not installed
pkg install nodejs -y

# Install git if not installed
pkg install git -y

# Install dependencies
npm install

echo "✅ Installation complete!"
echo "Run the bot with: npm start"

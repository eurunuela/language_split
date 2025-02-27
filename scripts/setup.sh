#!/bin/bash
# Setup script for Language Split

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js before continuing."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f 2 | cut -d'.' -f 1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "Language Split requires Node.js v14 or higher. Please upgrade your Node.js installation."
    exit 1
fi

# Install dependencies
echo "Installing dependencies for client..."
npm install

echo "Installing dependencies for server..."
cd server
npm install
cd ..

# Check for .env file
if [ ! -f .env ]; then
    echo "Creating example .env file. Please edit it to add your OpenAI API key."
    echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
    echo ""
    echo "IMPORTANT: Edit the .env file now to add your OpenAI API key."
    echo "The application will not work without a valid API key."
fi

# Create directories
mkdir -p docs

# Give execution permission to scripts
chmod +x scripts/*.js
chmod +x scripts/*.sh

echo ""
echo "Setup complete!"
echo "To start the application, run: npm run dev"
echo ""

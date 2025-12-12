#!/bin/bash
set -e
pkg update -y && pkg upgrade -y
pkg install -y nodejs git curl
npm install -g pm2

mkdir -p ~/v1lefarm
cd ~/v1lefarm

curl -L https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/install_bot.sh -o install_bot.sh
chmod +x install_bot.sh
bash install_bot.sh

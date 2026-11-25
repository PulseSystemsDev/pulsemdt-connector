fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'pulsemdt'
description 'PulseMDT 2.0 game bridge'
version '2.0.0'
author 'Pulse Systems'
url 'https://pulsemdt.com'

shared_script 'config.lua'

client_script 'client/main.lua'

server_script 'server/bridge.js'

ui_page 'nui/index.html'

files {
    'nui/index.html',
    'nui/style.css',
    'nui/app.js',
}

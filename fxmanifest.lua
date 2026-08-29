fx_version 'cerulean'
game 'gta5'

name 'pulsemdt'
description 'PulseMDT - Free CAD/MDT for FiveM'
version '0.4.0'
author 'PulseMDT'
url 'https://pulsemdt.com'

shared_scripts {
    'config.lua',
}

client_scripts {
    'client/main.lua',
}

server_scripts {
    'server/framework.lua',
    'server/main.lua',
}

ui_page 'nui/index.html'

files {
    'nui/index.html',
    'nui/style.css',
    'nui/app.js',
    'nui/brand/pulsemdt-mark.svg',
}

lua54 'yes'

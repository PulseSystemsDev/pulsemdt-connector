local state = nil
local tabletOpen = false
local panicBlips = {}

local function streetAndPostal()
    local coords = GetEntityCoords(PlayerPedId())
    local streetHash, crossingHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local street = GetStreetNameFromHashKey(streetHash)
    local crossing = crossingHash ~= 0 and GetStreetNameFromHashKey(crossingHash) or ''
    if crossing ~= '' then
        street = street .. ' / ' .. crossing
    end
    local postal = ''
    if Config.PostalResource and GetResourceState(Config.PostalResource) == 'started' then
        local ok, value = pcall(function()
            return exports[Config.PostalResource]:getPostal()
        end)
        if ok and value then
            postal = tostring(value)
        end
    end
    return street, postal, coords
end

local function feed(title, text)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(('~b~%s~s~ %s'):format(title, text))
    EndTextCommandThefeedPostTicker(false, true)
end

local function showNotice(data)
    local title = data.title or 'PulseMDT'
    local text = data.text or ''
    local shown = false
    if Config.UsePulseNotify and GetResourceState('pulse_notify') == 'started' then
        shown = pcall(function()
            exports.pulse_notify:Notify(('%s: %s'):format(title, text))
        end)
    end
    if not shown then
        feed(title, text)
    end
    if data.kind == 'emergency' then
        PlaySoundFrontend(-1, 'Beep_Red', 'DLC_HEIST_HACKING_SNAKE_SOUNDS', true)
    elseif data.kind == 'call' then
        PlaySoundFrontend(-1, 'Event_Message_Purple', 'GTAO_FM_Events_Soundset', true)
    end
    if tabletOpen then
        SendNUIMessage({ type = 'notice', notice = data })
    end
end

local function addPanicBlip(x, y, label)
    local blip = AddBlipForCoord(x + 0.0, y + 0.0, 0.0)
    SetBlipSprite(blip, 161)
    SetBlipScale(blip, 1.2)
    SetBlipColour(blip, 1)
    SetBlipFlashes(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(label)
    EndTextCommandSetBlipName(blip)
    panicBlips[#panicBlips + 1] = blip
    SetTimeout((Config.PanicBlipSeconds or 90) * 1000, function()
        if DoesBlipExist(blip) then
            RemoveBlip(blip)
        end
    end)
end

RegisterNetEvent('pulsemdt:notify', function(data)
    if type(data) ~= 'table' then return end
    showNotice(data)
    if data.waypoint and data.waypoint.x and data.waypoint.y then
        if data.kind == 'emergency' then
            addPanicBlip(data.waypoint.x, data.waypoint.y, data.title or 'Emergency')
        else
            SetNewWaypoint(data.waypoint.x + 0.0, data.waypoint.y + 0.0)
        end
    end
end)

local radioChannel = 0

local function radioTarget()
    local unit = state and state.unit
    if not unit then return 0 end
    local radio = Config.Radio
    if radio.incidentChannels and state.incident and state.incident.shortNumber then
        local range = math.max(1, radio.incidentChannelRange or 50)
        return (radio.incidentChannelBase or 100) + (state.incident.shortNumber % range)
    end
    local agencies = state.profile and state.profile.agencies or {}
    for _, agency in ipairs(agencies) do
        if agency.id == unit.agencyId then
            return (radio.agencyChannels or {})[agency.code] or 0
        end
    end
    return 0
end

local function syncRadio()
    if not Config.Radio or not Config.Radio.enabled then return end
    local target = radioTarget()
    if target == radioChannel then return end
    local ok, applied = pcall(Config.Radio.setChannel, target)
    if ok and applied ~= false then
        radioChannel = target
        if target > 0 then
            feed('Radio', ('Channel %d'):format(target))
        end
        if tabletOpen then
            SendNUIMessage({ type = 'radio', channel = radioChannel })
        end
    end
end

RegisterNetEvent('pulsemdt:state', function(next)
    state = next
    if tabletOpen then
        SendNUIMessage({ type = 'state', state = state })
    end
    syncRadio()
end)

RegisterNetEvent('pulsemdt:return', function(ret)
    if tabletOpen then
        SendNUIMessage({ type = 'return', ret = ret })
    end
end)

RegisterNetEvent('pulsemdt:online', function(online)
    if state then
        state.online = online
    end
    if tabletOpen then
        SendNUIMessage({ type = 'online', online = online })
    end
end)

local function openTablet()
    if tabletOpen then return end
    tabletOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ type = 'open', state = state })
    if Config.Radio and Config.Radio.enabled then
        SendNUIMessage({ type = 'radio', channel = radioChannel })
    end
    TriggerServerEvent('pulsemdt:tablet')
end

local function closeTablet()
    if not tabletOpen then return end
    tabletOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ type = 'close' })
end

local function call911(message)
    local street, postal, coords = streetAndPostal()
    TriggerServerEvent('pulsemdt:911', message, street, postal, coords.x, coords.y)
end

local function setStatus(code)
    TriggerServerEvent('pulsemdt:status', code)
end

local function command(name, handler)
    if Config.Commands and Config.Commands[name] then
        RegisterCommand(Config.Commands[name], handler, false)
    end
end

command('tablet', function()
    if tabletOpen then closeTablet() else openTablet() end
end)

command('duty', function(_, args)
    if not args[1] then
        openTablet()
        return
    end
    TriggerServerEvent('pulsemdt:signOn', args[1], args[2] or '', args[3] or '')
end)

command('offduty', function()
    TriggerServerEvent('pulsemdt:signOff')
end)

command('status', function(_, args)
    if args[1] then
        setStatus(args[1])
    else
        showNotice({ title = 'PulseMDT', text = 'Add a status code, for example /status OS' })
    end
end)

command('plate', function(_, args)
    local plate = table.concat(args, '')
    if plate == '' then
        showNotice({ title = 'Plate', text = 'Add a plate, for example /plate 8KLM441' })
        return
    end
    TriggerServerEvent('pulsemdt:queryPlate', plate)
end)

command('person', function(_, args)
    local query = table.concat(args, ' ')
    if query == '' then
        showNotice({ title = 'Name check', text = 'Add a name, for example /person john smith' })
        return
    end
    TriggerServerEvent('pulsemdt:queryPerson', query)
end)

command('panic', function()
    TriggerServerEvent('pulsemdt:panic')
end)

command('call911', function(_, args)
    local message = table.concat(args, ' ')
    if message == '' then
        showNotice({ title = '911', text = 'Say what is happening, for example /911 car crash on the highway' })
        return
    end
    call911(message)
end)

RegisterCommand('+pulsemdt_tablet', function()
    if tabletOpen then closeTablet() else openTablet() end
end, false)
RegisterCommand('-pulsemdt_tablet', function() end, false)
RegisterKeyMapping('+pulsemdt_tablet', 'PulseMDT: open tablet', 'keyboard', Config.TabletKey or 'F6')

RegisterCommand('+pulsemdt_panic', function()
    TriggerServerEvent('pulsemdt:panic')
end, false)
RegisterCommand('-pulsemdt_panic', function() end, false)
RegisterKeyMapping('+pulsemdt_panic', 'PulseMDT: panic button', 'keyboard', Config.PanicKey or 'F7')

for index, quick in ipairs(Config.QuickStatus or {}) do
    if quick.key and quick.code then
        local name = ('+pulsemdt_status_%d'):format(index)
        RegisterCommand(name, function()
            setStatus(quick.code)
        end, false)
        RegisterCommand(('-pulsemdt_status_%d'):format(index), function() end, false)
        RegisterKeyMapping(name, ('PulseMDT: status %s'):format(quick.code), 'keyboard', quick.key)
    end
end

RegisterNUICallback('close', function(_, cb)
    closeTablet()
    cb({ ok = true })
end)

RegisterNUICallback('signOn', function(data, cb)
    TriggerServerEvent('pulsemdt:signOn', data.agencyId, data.callsign or '', data.vehicle or '')
    cb({ ok = true })
end)

RegisterNUICallback('signOff', function(_, cb)
    TriggerServerEvent('pulsemdt:signOff')
    cb({ ok = true })
end)

RegisterNUICallback('status', function(data, cb)
    setStatus(data.code)
    cb({ ok = true })
end)

RegisterNUICallback('attach', function(data, cb)
    TriggerServerEvent('pulsemdt:attach', data.incidentId)
    cb({ ok = true })
end)

RegisterNUICallback('note', function(data, cb)
    TriggerServerEvent('pulsemdt:note', data.incidentId, data.text)
    cb({ ok = true })
end)

RegisterNUICallback('panic', function(_, cb)
    TriggerServerEvent('pulsemdt:panic')
    cb({ ok = true })
end)

RegisterNUICallback('waypoint', function(data, cb)
    if data.x and data.y then
        SetNewWaypoint(data.x + 0.0, data.y + 0.0)
    end
    cb({ ok = true })
end)

RegisterNUICallback('query', function(data, cb)
    if data.kind == 'plate' and data.text and data.text ~= '' then
        TriggerServerEvent('pulsemdt:queryPlate', data.text)
    elseif data.kind == 'person' and data.text and data.text ~= '' then
        TriggerServerEvent('pulsemdt:queryPerson', data.text)
    end
    cb({ ok = true })
end)

RegisterNUICallback('call911', function(data, cb)
    if data.message and data.message ~= '' then
        call911(data.message)
    end
    cb({ ok = true })
end)

CreateThread(function()
    while true do
        Wait(Config.StreetUpdateInterval or 5000)
        if state and state.unit then
            local street, postal = streetAndPostal()
            TriggerServerEvent('pulsemdt:where', street, postal)
        end
    end
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do
        Wait(500)
    end
    Wait(2000)
    if GetConvar('pulsemdt_server_key', '') ~= '' then
        TriggerServerEvent('pulsemdt:keyLeak')
    end
    TriggerServerEvent('pulsemdt:hello')
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if tabletOpen then
        SetNuiFocus(false, false)
    end
    for _, blip in ipairs(panicBlips) do
        if DoesBlipExist(blip) then
            RemoveBlip(blip)
        end
    end
end)

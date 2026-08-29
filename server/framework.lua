local FW = Config and Config.Framework or 'standalone'
local Bridge = { kind = FW }

local QBCore, ESX, Qbox

local function safeQuery(sql, params)
    local ok, res = pcall(function()
        if exports.oxmysql and exports.oxmysql.query_await then
            return exports.oxmysql:query_await(sql, params)
        end
        return nil
    end)
    return (ok and res) or {}
end

if FW == 'qb' then
    QBCore = exports['qb-core'] and exports['qb-core']:GetCoreObject() or nil
elseif FW == 'qbox' then
    Qbox = exports['qbx_core'] or nil
elseif FW == 'esx' then
    if exports['es_extended'] then ESX = exports['es_extended']:getSharedObject() end
end

function Bridge.GetIdentity(src)
    if FW == 'qb' and QBCore then
        local p = QBCore.Functions.GetPlayer(src)
        if not p then return nil end
        local ci = p.PlayerData.charinfo or {}
        return {
            id = p.PlayerData.citizenid,
            name = ((ci.firstname or '') .. ' ' .. (ci.lastname or '')):gsub('^%s+', ''),
            job = p.PlayerData.job and p.PlayerData.job.name or nil,
            grade = p.PlayerData.job and p.PlayerData.job.grade and p.PlayerData.job.grade.level or 0,
        }
    elseif FW == 'qbox' and Qbox then
        local p = Qbox:GetPlayer(src)
        if not p then return nil end
        local ci = p.PlayerData.charinfo or {}
        return {
            id = p.PlayerData.citizenid,
            name = ((ci.firstname or '') .. ' ' .. (ci.lastname or '')):gsub('^%s+', ''),
            job = p.PlayerData.job and p.PlayerData.job.name or nil,
            grade = p.PlayerData.job and p.PlayerData.job.grade and p.PlayerData.job.grade.level or 0,
        }
    elseif FW == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src)
        if not p then return nil end
        return {
            id = p.identifier,
            name = p.getName and p.getName() or nil,
            job = p.job and p.job.name or nil,
            grade = p.job and p.job.grade or 0,
        }
    end
    return nil
end

function Bridge.GetOwnedPlates(src)
    local plates = {}
    if FW == 'qb' and QBCore then
        local p = QBCore.Functions.GetPlayer(src)
        if p then
            local rows = safeQuery(
                'SELECT plate FROM player_vehicles WHERE citizenid = ?', { p.PlayerData.citizenid }) or {}
            for _, r in ipairs(rows) do plates[#plates + 1] = (r.plate or ''):gsub('%s+', '') end
        end
    elseif FW == 'qbox' and Qbox then
        local p = Qbox:GetPlayer(src)
        if p then
            local rows = safeQuery(
                'SELECT plate FROM player_vehicles WHERE citizenid = ?', { p.PlayerData.citizenid }) or {}
            for _, r in ipairs(rows) do plates[#plates + 1] = (r.plate or ''):gsub('%s+', '') end
        end
    elseif FW == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src)
        if p then
            local rows = safeQuery(
                'SELECT plate FROM owned_vehicles WHERE owner = ?', { p.identifier }) or {}
            for _, r in ipairs(rows) do plates[#plates + 1] = (r.plate or ''):gsub('%s+', '') end
        end
    end
    return plates
end

function Bridge.AddMoney(src, amount)
    if not Config.EconomyHook or amount <= 0 then return false end
    if FW == 'qb' and QBCore then
        local p = QBCore.Functions.GetPlayer(src); if p then p.Functions.AddMoney('bank', amount, 'pulsemdt'); return true end
    elseif FW == 'qbox' and Qbox then
        local p = Qbox:GetPlayer(src); if p then p.Functions.AddMoney('bank', amount, 'pulsemdt'); return true end
    elseif FW == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src); if p then p.addAccountMoney('bank', amount); return true end
    end
    return false
end

function Bridge.RemoveMoney(src, amount)
    if not Config.EconomyHook or amount <= 0 then return false end
    if FW == 'qb' and QBCore then
        local p = QBCore.Functions.GetPlayer(src); if p then return p.Functions.RemoveMoney('bank', amount, 'pulsemdt') end
    elseif FW == 'qbox' and Qbox then
        local p = Qbox:GetPlayer(src); if p then return p.Functions.RemoveMoney('bank', amount, 'pulsemdt') end
    elseif FW == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src); if p and p.getAccount('bank').money >= amount then p.removeAccountMoney('bank', amount); return true end
    end
    return false
end

function Bridge.IsActive()
    return FW ~= 'standalone'
end

_G.PulseFramework = Bridge

if FW ~= 'standalone' then
    print(('^2[PulseMDT]^7 Framework bridge active: %s'):format(FW))
end

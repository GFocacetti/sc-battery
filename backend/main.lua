local logger = require("logger")
local millennium = require("millennium")
local cjson = require("json")
require("history") -- registers the scb_history_* calls
local windows_battery = require("windows_battery") -- registers the scb_windows_batteries call

-- Settings are stored in the plugin config as one JSON object, shaped by the frontend (see settings.ts)
local KEY = "sc_battery_settings"

function scb_get_settings()
    local raw = millennium.config.get(KEY)
    if type(raw) ~= "string" or raw == "" then return "{}" end
    local ok, decoded = pcall(cjson.decode, raw)
    if not ok or type(decoded) ~= "table" then return "{}" end
    return raw
end

function scb_save_settings(json)
    local ok, decoded = pcall(cjson.decode, json or "")
    if not ok or type(decoded) ~= "table" then
        logger:error("scb_save_settings: invalid json")
        return false
    end
    millennium.config.set(KEY, cjson.encode(decoded))
    return true
end

local function on_load()
    logger:info("SC-Battery backend loading, Millennium " .. tostring(millennium.version()))
    millennium.ready()
    -- Xbox controllers: Steam doesn't get their level, Windows does
    pcall(windows_battery.start)
end

local function on_unload()
    logger:info("SC-Battery backend unloaded")
end

local function on_frontend_loaded()
    logger:info("SC-Battery frontend loaded")
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}

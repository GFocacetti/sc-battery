local fs = require("fs")
local utils = require("utils")
local logger = require("logger")
local cjson = require("json")

-- Battery history (shape defined by the frontend, see history.ts), kept in data/history.json
-- inside the plugin folder so it survives Steam restarts without bloating Millennium's config.

local function history_path()
    local dir = fs.join(utils.get_backend_path(), "..", "data")
    if not fs.exists(dir) then fs.create_directories(dir) end
    return fs.join(dir, "history.json")
end

function scb_history_get()
    local f = io.open(history_path(), "r")
    if not f then return "{}" end
    local raw = f:read("*a")
    f:close()
    local ok, decoded = pcall(cjson.decode, raw or "")
    if not ok or type(decoded) ~= "table" then return "{}" end
    return raw
end

function scb_history_save(json)
    local ok, decoded = pcall(cjson.decode, json or "")
    if not ok or type(decoded) ~= "table" then
        logger:error("scb_history_save: invalid json")
        return false
    end
    local path = history_path()
    local tmp = path .. ".tmp"
    local f = io.open(tmp, "w")
    if not f then return false end
    f:write(json)
    f:close()
    os.remove(path)
    os.rename(tmp, path)
    return true
end

CREATE TABLE IF NOT EXISTS daily_device
(
    device_id String,
    app_id String,
    date Date,
    PRIMARY KEY (device_id, date)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (device_id, date);

CREATE TABLE IF NOT EXISTS devices
(
    updated_at DateTime64(6),
    device_id String,
    custom_id String,
    app_id String,
    platform String,
    plugin_version String,
    os_version String,
    version_build String,
    version Int64,
    is_prod UInt8,
    is_emulator UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(updated_at)
ORDER BY (app_id, device_id, updated_at)
PRIMARY KEY (app_id, device_id);

CREATE TABLE IF NOT EXISTS app_versions_meta
(
    created_at DateTime64(6),
    app_id String,
    size Int64,
    id Int64,
    action String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (id, app_id, action)
PRIMARY KEY (id, app_id, action);

CREATE TABLE IF NOT EXISTS devices_u
(
    created_at DateTime64(6),
    updated_at DateTime64(6),  -- This column is used to determine the latest record
    device_id String,
    custom_id String,
    app_id String,
    platform String,
    plugin_version String,
    os_version String,
    version_build String,
    version Int64,
    is_prod UInt8,
    is_emulator UInt8
) ENGINE = ReplacingMergeTree(updated_at)
PARTITION BY toYYYYMM(updated_at)
ORDER BY (device_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS devices_u_mv
TO devices_u
AS
SELECT
    argMin(updated_at, updated_at) AS created_at,  -- Get the earliest updated_at as created_at
    device_id,
    argMax(custom_id, updated_at) AS custom_id,
    argMax(app_id, updated_at) AS app_id,
    argMax(platform, updated_at) AS platform,
    argMax(plugin_version, updated_at) AS plugin_version,
    argMax(os_version, updated_at) AS os_version,
    argMax(version_build, updated_at) AS version_build,
    argMax(version, updated_at) AS version,
    argMax(is_prod, updated_at) AS is_prod,
    argMax(is_emulator, updated_at) AS is_emulator
FROM devices
GROUP BY device_id;

CREATE TABLE IF NOT EXISTS logs
(
    created_at DateTime64(6),
    device_id String,
    app_id String,
    platform String,
    action String,
    version_build String,
    version Int64
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(created_at)
ORDER BY (app_id, device_id, created_at)
PRIMARY KEY (app_id, device_id, created_at);

CREATE TABLE IF NOT EXISTS logs_daily_raw
(
    date Date,
    app_id String,
    version Int64, -- Using the version from the logs table
    get AggregateFunction(countIf, UInt64, UInt8),
    fail AggregateFunction(countIf, UInt64, UInt8),
    install AggregateFunction(countIf, UInt64, UInt8),
    uninstall AggregateFunction(countIf, UInt64, UInt8),
    bandwidth AggregateFunction(sumIf, Int64, UInt8),
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id, version);

CREATE MATERIALIZED VIEW IF NOT EXISTS logs_daily_raw_mv
TO logs_daily_raw
AS
SELECT
    toDate(l.created_at) AS date,
    l.app_id,
    l.version, -- Using the version from the logs table
    countIfState(l.action = 'get') AS get,
    countIfState(l.action IN ('set_fail', 'update_fail', 'download_fail')) AS fail,
    countIfState(l.action = 'set') AS install,
    countIfState(l.action = 'uninstall') AS uninstall,
    -- Calculate the bandwidth by summing the size from the app_versions_meta table
    -- for 'get' actions, where there is a matching version.
    sumIfState(a.size, l.action = 'get' AND a.id = l.version AND a.app_id = l.app_id) AS bandwidth
FROM logs AS l
LEFT JOIN app_versions_meta AS a ON l.app_id = a.app_id AND l.version = a.id
GROUP BY
    date,
    l.app_id,
    l.version;

CREATE VIEW logs_daily AS 
SELECT 
  date, 
  app_id, 
  version, 
  countIfMerge(get) as get, 
  countIfMerge(fail) as fail, 
  countIfMerge(install) as install, 
  countIfMerge(uninstall) as uninstall, 
  sumIfMerge(bandwidth) as bandwidth 
  from logs_daily_raw 
  GROUP BY (date, app_id, version);

CREATE TABLE IF NOT EXISTS app_storage_daily
(
    date Date,
    app_id String,
    storage_added Int64,
    storage_deleted Int64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS app_storage_daily_mv
TO app_storage_daily
AS
SELECT
    toDate(created_at) AS date,
    app_id,
    sumIf(size, action = 'add') AS storage_added,
    sumIf(size, action = 'delete') AS storage_deleted
FROM app_versions_meta
GROUP BY date, app_id;

-- 
-- MAU aggregation
-- 

CREATE TABLE IF NOT EXISTS mau
(
    date Date,
    app_id String,
    total AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, app_id);
-- select date, app_id, sum(mau) as mau from mau_mv group by date, app_id
-- drop table mau_mv
-- select * from mau_mv

CREATE MATERIALIZED VIEW IF NOT EXISTS mau_mv
TO mau
AS
SELECT
    minDate AS date,
    app_id,
    uniqState(device_id) AS total
FROM
    (
    SELECT
        min(toDate(created_at)) AS minDate,
        app_id,
        device_id
    FROM logs
    WHERE 
        created_at >= toStartOfMonth(toDate(now())) 
        AND created_at < toStartOfMonth(toDate(now()) + INTERVAL 1 MONTH)
    GROUP BY device_id, app_id
    )
GROUP BY date, app_id;

-- AND date >= {start_date:Date} AND date <= {end_date:Date}
CREATE VIEW IF NOT EXISTS mau_final_param as
SELECT DISTINCT ON (m.date,m.app_id) 
  m.date AS date,
  m.app_id AS app_id,
  COALESCE(m.total, 0) AS mau,
  COALESCE(l.get, 0) AS get,
  COALESCE(l.fail, 0) AS fail,
  COALESCE(l.install, 0) AS install,
  COALESCE(l.uninstall, 0) AS uninstall,
  COALESCE(l.bandwidth, 0) AS bandwidth,
  COALESCE(s.storage_added, 0) AS storage_added,
  COALESCE(s.storage_deleted, 0) AS storage_deleted
  FROM (SELECT result.1 date, uniqMerge(arrayJoin(result.2)) total, app_id
    FROM (
        SELECT 
            groupArray((date, value)) data,
            arrayMap(
                (x, index) -> (x.1, arrayMap(y -> y.2, arraySlice(data, index))), 
                data, 
                arrayEnumerate(data)) result_as_array,
            arrayJoin(result_as_array) result, app_id
        FROM (        
            SELECT app_id, date, total value
            FROM (
                /* emulate the original data */
                SELECT app_id, total, date from mau where hasAll(JSONExtract({app_list:String}, 'Array(String)'), [app_id]) AND date >= {start_date:Date} AND date < {end_date:Date} 
            ORDER BY date desc, app_id)
        ) group by app_id
    ) group by app_id, date order by date desc) m
  LEFT JOIN logs_daily l ON m.date = l.date AND m.app_id = l.app_id
  LEFT JOIN (select * from app_storage_daily final) s ON l.date = s.date AND l.app_id = s.app_id
  group by m.app_id, m.date, l.get, l.install, l.uninstall, l.bandwidth, l.fail, s.storage_added, s.storage_deleted, m.total;

-- Aggregate table partitioned by version only
CREATE TABLE IF NOT EXISTS version_aggregate_logs
(
    version Int64,
    total_installs Int64,
    total_failures Int64,
    unique_devices Int64,
    install_percent Float64,
    failure_percent Float64
) ENGINE = AggregatingMergeTree()
PARTITION BY version
ORDER BY version;

-- 
-- Install and fail stats
-- 

CREATE TABLE IF NOT EXISTS daily_aggregate_logs
(
    date Date,
    version Int64,
    total_installs Int64,
    total_failures Int64,
    unique_devices Int64,
    install_percent Float64,
    failure_percent Float64
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, version);

CREATE TABLE store_apps (
    created_at DateTime DEFAULT now(),
    url String DEFAULT '',
    app_id String,
    title String DEFAULT '',
    summary String DEFAULT '',
    icon String DEFAULT '',
    free UInt8 DEFAULT 1,
    category String DEFAULT '',
    capacitor UInt8 DEFAULT 0,
    developer_email String DEFAULT '',
    installs UInt64 DEFAULT 0,
    developer String DEFAULT '',
    score Float64 DEFAULT 0,
    to_get_framework UInt8 DEFAULT 1,
    onprem UInt8 DEFAULT 0,
    updates AggregateFunction(sum, UInt64),
    to_get_info UInt8 DEFAULT 1,
    error_get_framework String DEFAULT '',
    to_get_similar UInt8 DEFAULT 1,
    error_get_similar String DEFAULT '',
    updated_at DateTime DEFAULT now(),
    error_get_info String DEFAULT '',
    cordova UInt8 DEFAULT 0,
    react_native UInt8 DEFAULT 0,
    capgo UInt8 DEFAULT 0,
    kotlin UInt8 DEFAULT 0,
    flutter UInt8 DEFAULT 0,
    native_script UInt8 DEFAULT 0,
    lang String DEFAULT '',
    developer_id String DEFAULT ''
) ENGINE = AggregatingMergeTree()
ORDER BY (app_id);

-- Create a Materialized View that aggregates data daily
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_aggregate_logs_mv TO daily_aggregate_logs AS
SELECT 
    toDate(created_at) AS date,
    version,
    countIf(action = 'set') AS total_installs,
    countIf(action IN ('set_fail', 'update_fail', 'download_fail')) AS total_failures,
    uniq(device_id) AS unique_devices,
    total_installs / unique_devices * 100 AS install_percent,
    total_failures / unique_devices * 100 AS failure_percent
FROM logs
GROUP BY date, version;

CREATE MATERIALIZED VIEW IF NOT EXISTS version_aggregate_logs_mv TO version_aggregate_logs AS
SELECT 
    version,
    countIf(action = 'set') AS total_installs,
    countIf(action IN ('set_fail', 'update_fail', 'download_fail')) AS total_failures,
    uniq(device_id) AS unique_devices,
    total_installs / unique_devices * 100 AS install_percent,
    total_failures / unique_devices * 100 AS failure_percent
FROM logs
GROUP BY version;

const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');

function readCgroup(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

router.get('/stats', (req, res) => {
  // Memory calculation
  let usedBytes = Number(readCgroup('/sys/fs/cgroup/memory.current')) ||
                  Number(readCgroup('/sys/fs/cgroup/memory/memory.usage_in_bytes')) ||
                  (os.totalmem() - os.freemem());

  let limitBytes = Number(readCgroup('/sys/fs/cgroup/memory.max')) ||
                   Number(readCgroup('/sys/fs/cgroup/memory/memory.limit_in_bytes')) ||
                   os.totalmem();

  if (!limitBytes || !Number.isFinite(limitBytes) || limitBytes > os.totalmem()) {
    limitBytes = os.totalmem();
  }

  const usedGb = (usedBytes / 1024 / 1024 / 1024).toFixed(2);
  const totalGb = (limitBytes / 1024 / 1024 / 1024).toFixed(2);
  const ramPercent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

  // CPU Load
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const cpuPercent = Math.min(100, Math.round((loadAvg[0] / (cpus.length || 1)) * 100));

  const uptimeSec = Math.floor(process.uptime());
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);

  res.json({
    status: true,
    creator: 'RED API Engine',
    data: {
      node: process.env.NODE_NAME || 'RED API',
      platform: os.platform() + ' ' + os.arch(),
      node_version: process.version,
      cpu: {
        model: cpus[0]?.model || 'AMD Dedicated Server',
        cores: cpus.length,
        usage_percent: cpuPercent
      },
      memory: {
        used_gb: usedGb,
        total_gb: totalGb,
        usage_percent: ramPercent
      },
      uptime: {
        raw_seconds: uptimeSec,
        formatted: `${days}d ${hours}h ${mins}m`
      },
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;

'use strict';
/* =====================================================================
 * 极简零依赖静态文件服务器（替代 nginx，供抖音云托管使用）
 *  - 抖音云构建环境无法访问 DockerHub，故不用 nginx:alpine
 *  - 基础镜像改用官方可达的火山引擎公共源 node:18-alpine
 *  - 监听 8000（抖音云托管约定端口），入口 preview.html
 *  - 内置路径穿越防护
 * ===================================================================== */
var http = require('http');
var fs = require('fs');
var path = require('path');

/* =====================================================================
 * 部族巅峰榜（排行榜）——内存缓存 + JSON 落盘（data/rank.json）
 *  - POST /api/rank  提交 {devId, peak, day, season, year}
 *  - GET  /api/rank?top=20  返回按 peak 降序 / ts 升序的榜单
 *  - 同一 devId 只保留历史最高峰值（同峰值保留更早达成时间）
 *  - 说明：容器本地盘在实例重建后可能重置；生产建议挂载持久卷或迁移 Redis/云数据库
 * ===================================================================== */
var RANK_FILE = path.join(__dirname, 'data', 'rank.json');
var rankList = [];            // [{devId, peak, day, season, year, ts}]
var rankDirty = false;
var rankFlushTimer = null;

function loadRank() {
  try {
    var s = fs.readFileSync(RANK_FILE, 'utf8');
    var arr = JSON.parse(s);
    if (Array.isArray(arr)) rankList = arr;
  } catch (e) { rankList = []; }
}
function flushRank() {
  try {
    if (!fs.existsSync(path.dirname(RANK_FILE))) fs.mkdirSync(path.dirname(RANK_FILE), { recursive: true });
    fs.writeFileSync(RANK_FILE, JSON.stringify(rankList));
    rankDirty = false;
  } catch (e) { /* ignore */ }
}
function scheduleFlush() {
  rankDirty = true;
  if (rankFlushTimer) return;
  rankFlushTimer = setTimeout(function () { rankFlushTimer = null; flushRank(); }, 800);
}
function addRank(body) {
  var devId = typeof body.devId === 'string' ? body.devId.slice(0, 64) : '';
  var peak = Math.floor(Number(body.peak));
  if (!devId || !isFinite(peak) || peak <= 0) return { ok: false, error: 'bad request' };
  var day = Math.max(1, Math.floor(Number(body.day) || 1));
  var season = Math.max(0, Math.floor(Number(body.season) || 0));
  var year = Math.max(1, Math.floor(Number(body.year) || 1));
  var now = Date.now();
  var found = null;
  for (var i = 0; i < rankList.length; i++) {
    if (rankList[i].devId === devId) { found = rankList[i]; break; }
  }
  if (found) {
    if (peak > found.peak || (peak === found.peak && now < found.ts)) {
      found.peak = peak; found.day = day; found.season = season; found.year = year; found.ts = now;
      scheduleFlush();
    }
  } else {
    rankList.push({ devId: devId, peak: peak, day: day, season: season, year: year, ts: now });
    scheduleFlush();
  }
  return { ok: true };
}
function getRank(top) {
  var n = Math.max(1, Math.min(100, Number(top) || 20));
  var sorted = rankList.slice().sort(function (a, b) {
    if (b.peak !== a.peak) return b.peak - a.peak;
    return a.ts - b.ts;
  });
  var list = sorted.slice(0, n).map(function (r, idx) {
    return { rank: idx + 1, peak: r.peak, day: r.day, season: r.season, year: r.year, ts: r.ts };
  });
  return { ok: true, total: rankList.length, list: list };
}
loadRank();

// 静态资源根目录：使用 server.js 所在目录（模板/自定义 Dockerfile 的拷贝位置可能不同，自适应）
var root = __dirname;
var mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

http.createServer(function (req, res) {
  var url = (req.url || '/').split('?')[0];
  // 排行榜 API
  if (url === '/api/rank') {
    if (req.method === 'POST') {
      var chunks = [];
      req.on('data', function (c) { chunks.push(c); });
      req.on('end', function () {
        var body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { body = {}; }
        var out = addRank(body);
        res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    var top = 20;
    var m = /[?&]top=(\d+)/.exec(req.url || '');
    if (m) top = parseInt(m[1], 10);
    var out2 = getRank(top);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(out2));
    return;
  }
  var p;
  try {
    p = decodeURIComponent(url);
  } catch (e) {
    p = url;
  }
  if (p === '/') p = '/preview.html';
  var fp = path.normalize(path.join(root, p));
  // 路径穿越防护：确保解析后的路径仍在 root 内
  if (fp !== root && fp.indexOf(root + path.sep) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  fs.readFile(fp, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8000, '0.0.0.0');

console.log('static server listening on 8000, root=' + root);

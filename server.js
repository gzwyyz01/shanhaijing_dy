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

var root = '/opt/application';
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

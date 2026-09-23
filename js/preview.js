'use strict';
/* =====================================================================
 * 浏览器预览入口 preview.js —— 抖音小游戏工程先在浏览器跑通（官方推荐流程）
 * 加载：core.js → adapter.js(浏览器分支) → ui.js → 本文件
 * 与抖音端唯一差异：把 canvas 挂进 DOM、dev 模式开启便于调试。
 * ===================================================================== */
window.__SH_ERR = [];
window.onerror = function (m, s, l, c) { window.__SH_ERR.push(m + ' @' + l + ':' + c); };

var App = SHCore.createGame();
App.init();
/* 注入云存档 KV 适配（浏览器端 localStorage 模拟，与抖音端同构） */
if (SHCore.setCloudAdapter) SHCore.setCloudAdapter({
  write: function (items, cb) { return SHPlatform.cloudKVWrite(items, cb); },
  read: function (keys, cb) { return SHPlatform.cloudKVRead(keys, cb); },
  remove: function (keys, cb) { return SHPlatform.cloudKVRemove(keys, cb); }
});
SHUI.boot(App, SHPlatform, {
  dev: true,
  attach: function (c) {
    c.style.display = 'block';
    c.style.width = window.innerWidth + 'px';
    c.style.height = window.innerHeight + 'px';
    document.body.appendChild(c);
  }
});

'use strict';
/* =====================================================================
 * 平台适配层 adapter.js —— 抖音小游戏(tt) 与 浏览器预览 双端统一
 *  - 抖音端：tt.createCanvas / tt.onTouch* / tt.getSystemInfoSync / tt.requestAnimationFrame
 *  - 浏览器端：document.createElement('canvas') / mouse+touch 事件（供 preview.html 本地验证）
 * 同一份 ui.js 在两端运行，无需改动。
 * ===================================================================== */

var hasTT = typeof tt !== 'undefined';

function createCanvas() {
  if (hasTT) return tt.createCanvas();
  var c = document.createElement('canvas');
  return c;
}

function getInfo() {
  if (hasTT) {
    var s = tt.getSystemInfoSync();
    // 顶部安全区：safeArea.top 优先，模拟器可能返回 0 → 用 statusBarHeight 兜底（iOS 灵动岛 ≈59）
    var safeTop = 0;
    var safeBottom = 0;
    if (s.safeArea) {
      safeTop = s.safeArea.top || 0;
      safeBottom = (s.screenHeight - s.safeArea.bottom) || 0;
    }
    if (!safeTop && s.statusBarHeight) safeTop = s.statusBarHeight;
    return {
      width: s.windowWidth,
      height: s.windowHeight,
      dpr: s.pixelRatio || 1,
      safeTop: safeTop,
      safeBottom: safeBottom
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    safeTop: 0,
    safeBottom: 0
  };
}

function raf(cb) {
  if (hasTT && tt.requestAnimationFrame) return tt.requestAnimationFrame(cb);
  // 浏览器预览端：setTimeout 兜底（后台标签页 rAF 会被浏览器挂起，导致预览白屏）
  return setTimeout(cb, 1000 / 60);
}

/* 触摸回调统一为 {x, y}（CSS 逻辑像素） */
function onTouchStart(cb) {
  if (hasTT) { tt.onTouchStart(function (e) { if (e && e.touches && e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mousedown', function (e) { cb({ x: e.offsetX, y: e.offsetY }); });
  c.addEventListener('touchstart', function (e) { if (e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); });
}
function onTouchMove(cb) {
  if (hasTT) { tt.onTouchMove(function (e) { if (e && e.touches && e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mousemove', function (e) { cb({ x: e.offsetX, y: e.offsetY }); });
  c.addEventListener('touchmove', function (e) { if (e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); });
}
function onTouchEnd(cb) {
  if (hasTT) { tt.onTouchEnd(function (e) { cb(); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mouseup', function () { cb(); });
  c.addEventListener('touchend', function () { cb(); });
}

function showToast(title) {
  if (hasTT) { try { tt.showToast({ title: title, duration: 1500 }); } catch (e) { /* ignore */ } return; }
  if (typeof alert === 'function') alert(title);
}

/* 分享（抖音端由用户主动触发时才可调用） */
function share(opts) {
  if (!hasTT) { if (typeof alert === 'function') alert('（预览模式）分享：' + (opts && opts.title)); return; }
  try {
    tt.shareAppMessage({ title: (opts && opts.title) || '山海经·洪荒开荒：从洪荒到盛世，你说了算！', desc: (opts && opts.desc) || '', success: function () {}, fail: function () {} });
  } catch (e) { /* ignore */ }
}

function vibrate() {
  if (hasTT) { try { tt.vibrateShort({}); } catch (e) { /* ignore */ } }
}

function onShow(cb) {
  if (hasTT) tt.onShow(cb);
  else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (!document.hidden) cb(); });
}
function onHide(cb) {
  if (hasTT) tt.onHide(cb);
  else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.hidden) cb(); });
}

/* =====================================================================
 * 侧边栏复访能力（抖音小游戏「必接」能力）
 *  - initSidebar：必须在 game.js 启动时机调用（过早监听 tt.onShow，否则
 *    用户从侧边栏热启动回游戏时收不到回调，导致无法领奖）
 *  - 侧边栏场景值：抖音 021036（首页侧边栏-最近使用/常用小程序）、021012；
 *    抖极 101036
 *  - 浏览器预览端全部降级：checkSidebar 返回 isExist=false（不显示入口）
 * ===================================================================== */
var SIDEBAR_SCENES = ['021036', '021012', '101036'];
var _lastShow = null;

function initSidebar() {
  if (!hasTT) return;
  try {
    // 官方要求：尽可能提前监听（game.js 运行时机），且判断是否从侧边栏启动
    // 必须使用 tt.onShow 的最新返回值
    tt.onShow(function (op) {
      _lastShow = op || null;
    });
    try {
      var lo = tt.getLaunchOptionsSync ? tt.getLaunchOptionsSync() : null;
      if (lo) _lastShow = lo;
    } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }
}
function _isSidebarScene(scene) {
  var s = String(scene || '');
  return SIDEBAR_SCENES.indexOf(s) >= 0;
}
function isFromSidebar() {
  return _isSidebarScene(_lastShow && _lastShow.scene);
}
function checkSidebar(cb) {
  if (!hasTT) { if (cb) cb({ isExist: false }); return; }
  try {
    tt.checkScene({
      scene: 'sidebar',
      success: function (r) { if (cb) cb(r || { isExist: false }); },
      fail: function () { if (cb) cb({ isExist: false }); }
    });
  } catch (e) { if (cb) cb({ isExist: false }); }
}
function navigateToSidebar() {
  if (!hasTT) return;
  try {
    tt.navigateToScene({
      scene: 'sidebar',
      success: function () {},
      fail: function () {}
    });
  } catch (e) { /* ignore */ }
}

/* 通用本地存储（每日礼包状态等；tt / localStorage 双端） */
function storageGet(k) {
  if (hasTT) { try { return tt.getStorageSync(k); } catch (e) { return null; } }
  if (typeof localStorage !== 'undefined') { try { return localStorage.getItem(k); } catch (e) { return null; } }
  return null;
}
function storageSet(k, v) {
  if (hasTT) { try { tt.setStorageSync(k, v); } catch (e) { /* ignore */ } return; }
  if (typeof localStorage !== 'undefined') { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
}

/* =====================================================================
 * 排行榜网络请求（tt.request / fetch 双端）与匿名设备标识
 * 注意：抖音端 tt.request 必须使用完整 https URL（相对路径会直接失败，
 * 显示「网络异常」）；浏览器端 fetch 会自动拼接当前域名。故统一在此
 * 将相对路径拼到 RANK_BASE_URL 上。
 * ===================================================================== */
var RANK_BASE_URL = 'https://1mettiuvm1b1l-env-zlfz29hqoi.service.douyincloud.run';
function httpJson(url, method, body) {
  var full = (/^https?:\/\//i.test(url)) ? url : RANK_BASE_URL + url;
  if (hasTT) {
    return new Promise(function (resolve, reject) {
      try {
        tt.request({
          url: full,
          method: method || 'GET',
          data: body || undefined,
          header: { 'Content-Type': 'application/json' },
          success: function (r) { resolve(r.data); },
          fail: function (e) { reject(e); }
        });
      } catch (e) { reject(e); }
    });
  }
  // 浏览器预览端 / Node：fetch
  return fetch(full, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) { return r.json(); });
}
function getDeviceId() {
  var k = 'shj_dev_id';
  var v = storageGet(k);
  if (!v) {
    v = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    storageSet(k, v);
  }
  return v;
}

var SHPlatform = {
  isTT: hasTT,
  createCanvas: createCanvas,
  getInfo: getInfo,
  raf: raf,
  onTouchStart: onTouchStart,
  onTouchMove: onTouchMove,
  onTouchEnd: onTouchEnd,
  showToast: showToast,
  share: share,
  vibrate: vibrate,
  onShow: onShow,
  onHide: onHide,
  initSidebar: initSidebar,
  isFromSidebar: isFromSidebar,
  checkSidebar: checkSidebar,
  navigateToSidebar: navigateToSidebar,
  storageGet: storageGet,
  storageSet: storageSet,
  httpJson: httpJson,
  getDeviceId: getDeviceId
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHPlatform;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHPlatform = SHPlatform;
}

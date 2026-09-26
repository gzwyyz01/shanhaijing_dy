'use strict';
/* =====================================================================
 * 平台适配层 adapter.js —— 抖音小游戏(tt) / 微信小游戏(wx) / 浏览器预览(web) 三端统一
 *  - 抖音端：tt.createCanvas / tt.onTouch* / tt.getSystemInfoSync / tt.requestAnimationFrame
 *  - 微信端：wx.createCanvas / wx.onTouch* / wx.getSystemInfoSync（无 rAF，setTimeout 兜底）
 *  - 浏览器端：document.createElement('canvas') / mouse+touch 事件（供 preview.html 本地验证）
 * 同一份 ui.js 在三端运行，无需改动。
 * 平台差异点：侧边栏复访（仅抖音）、云存档 KV（抖音平台 KV / 微信复用自建后端 /api/save）
 * ===================================================================== */

var PLAT = (typeof tt !== 'undefined') ? 'tt' : ((typeof wx !== 'undefined') ? 'wx' : 'web');

function createCanvas() {
  if (PLAT === 'tt') return tt.createCanvas();
  if (PLAT === 'wx') return wx.createCanvas();
  var c = document.createElement('canvas');
  return c;
}

function getInfo() {
  if (PLAT === 'tt' || PLAT === 'wx') {
    var s = (PLAT === 'tt' ? tt : wx).getSystemInfoSync();
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
  if (PLAT === 'tt' && tt.requestAnimationFrame) return tt.requestAnimationFrame(cb);
  // 微信小游戏无全局 requestAnimationFrame；浏览器预览端 setTimeout 兜底（后台标签页 rAF 会被挂起）
  return setTimeout(cb, 1000 / 60);
}

/* 触摸回调统一为 {x, y}（CSS 逻辑像素）。
   浏览器端同时监听 touch 与 mouse：手机触摸会合成 mousedown/mouseup，
   用 lastTouch 时间窗忽略触摸后 400ms 内的合成鼠标事件，避免双击。 */
var __lastTouch = 0;
function __isSynthMouse() { return Date.now() - __lastTouch < 400; }
function __hostTouch() { return PLAT === 'tt' ? tt : (PLAT === 'wx' ? wx : null); }
function onTouchStart(cb) {
  var h = __hostTouch();
  if (h) { h.onTouchStart(function (e) { if (e && e.touches && e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mousedown', function (e) { if (!__isSynthMouse()) cb({ x: e.offsetX, y: e.offsetY }); });
  c.addEventListener('touchstart', function (e) {
    __lastTouch = Date.now();
    if (e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  });
}
function onTouchMove(cb) {
  var h = __hostTouch();
  if (h) { h.onTouchMove(function (e) { if (e && e.touches && e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY }); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mousemove', function (e) { if (!__isSynthMouse()) cb({ x: e.offsetX, y: e.offsetY }); });
  c.addEventListener('touchmove', function (e) {
    __lastTouch = Date.now();
    if (e.touches[0]) cb({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  });
}
function onTouchEnd(cb) {
  var h = __hostTouch();
  if (h) { h.onTouchEnd(function () { cb(); }); return; }
  var c = document.querySelector('canvas');
  if (!c) return;
  c.addEventListener('mouseup', function () { if (!__isSynthMouse()) cb(); });
  c.addEventListener('touchend', function () { __lastTouch = Date.now(); cb(); });
}

function showToast(title) {
  var h = __hostTouch();
  if (h) { try { h.showToast({ title: title, duration: 1500 }); } catch (e) { /* ignore */ } return; }
  if (typeof alert === 'function') alert(title);
}

/* 分享（宿主端由用户主动触发时才可调用） */
function share(opts) {
  var h = __hostTouch();
  if (!h) { if (typeof alert === 'function') alert('（预览模式）分享：' + (opts && opts.title)); return; }
  try {
    h.shareAppMessage({ title: (opts && opts.title) || '山海开荒模拟：从洪荒到盛世，你说了算！', desc: (opts && opts.desc) || '', success: function () {}, fail: function () {} });
  } catch (e) { /* ignore */ }
}

function vibrate() {
  var h = __hostTouch();
  if (h) { try { h.vibrateShort({}); } catch (e) { /* ignore */ } }
}

function onShow(cb) {
  var h = __hostTouch();
  if (h) h.onShow(cb);
  else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (!document.hidden) cb(); });
}
function onHide(cb) {
  var h = __hostTouch();
  if (h) h.onHide(cb);
  else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.hidden) cb(); });
}

/* =====================================================================
 * 侧边栏复访能力（抖音小游戏「必接」能力；微信端无此能力，全部降级）
 *  - initSidebar：必须在 game.js 启动时机调用（过早监听 tt.onShow，否则
 *    用户从侧边栏热启动回游戏时收不到回调，导致无法领奖）
 *  - 侧边栏场景值：抖音 021036（首页侧边栏-最近使用/常用小程序）、021012；
 *    抖极 101036
 *  - 浏览器预览端全部降级：checkSidebar 返回 isExist=false（不显示入口）
 * ===================================================================== */
var SIDEBAR_SCENES = ['021036', '021012', '101036'];
var _lastShow = null;

function initSidebar() {
  if (PLAT !== 'tt') return;
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
  if (PLAT !== 'tt') { if (cb) cb({ isExist: false }); return; }
  try {
    tt.checkScene({
      scene: 'sidebar',
      success: function (r) { if (cb) cb(r || { isExist: false }); },
      fail: function () { if (cb) cb({ isExist: false }); }
    });
  } catch (e) { if (cb) cb({ isExist: false }); }
}
function navigateToSidebar() {
  if (PLAT !== 'tt') return;
  try {
    tt.navigateToScene({
      scene: 'sidebar',
      success: function () {},
      fail: function () {}
    });
  } catch (e) { /* ignore */ }
}

/* 通用本地存储（每日礼包状态等；tt / wx / localStorage 三端） */
function __hostStorage() {
  var h = __hostTouch();
  return (h && h.getStorageSync) ? h : null;
}
function storageGet(k) {
  var h = __hostStorage();
  if (h) { try { return h.getStorageSync(k); } catch (e) { return null; } }
  if (typeof localStorage !== 'undefined') { try { return localStorage.getItem(k); } catch (e) { return null; } }
  return null;
}
function storageSet(k, v) {
  var h = __hostStorage();
  if (h) { try { h.setStorageSync(k, v); } catch (e) { /* ignore */ } return; }
  if (typeof localStorage !== 'undefined') { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
}

/* =====================================================================
 * 排行榜网络请求（tt.request / wx.request / fetch 三端）与匿名设备标识
 * 注意：tt/wx 端 request 必须使用完整 https URL（相对路径会直接失败，
 * 显示「网络异常」）；浏览器端 fetch 会自动拼接当前域名。故统一在此
 * 将相对路径拼到 RANK_BASE_URL 上。
 * 微信端正式上线前，需在微信公众平台「开发-开发设置-服务器域名」
 * 将 RANK_BASE_URL 加入 request 合法域名；开发期可在开发者工具
 * 「详情-本地设置」勾选「不校验合法域名」。
 * ===================================================================== */
var RANK_BASE_URL = 'https://1mettiuvm1b1l-env-zlfz29hqoi.service.douyincloud.run';
function httpJson(url, method, body) {
  var full = (/^https?:\/\//i.test(url)) ? url : RANK_BASE_URL + url;
  var h = __hostTouch();
  if (h && h.request) {
    return new Promise(function (resolve, reject) {
      try {
        h.request({
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

/* =====================================================================
 * 激励视频广告（重开存档入口）——抖音/微信真实广告，浏览器预览模拟
 * REWARD_AD_UNIT：在抖音开放平台「流量主」创建激励视频广告位后填入；
 * 微信端填 REWARD_AD_UNIT_WX（微信公众平台「流量主-广告位管理」创建）。
 * 未创建时留空，宿主端 show() 会 fail → 视为未完整观看（不发放）。
 * ===================================================================== */
var REWARD_AD_UNIT = '';      // 抖音：流量主激励视频广告位 ID
var REWARD_AD_UNIT_WX = '';   // 微信：流量主激励视频广告位 ID
var _rvAd = null;
function showRewardedAd(opts) {
  var onDone = opts && opts.onDone;
  var h = __hostTouch();
  if (!h) {
    // 浏览器预览：模拟 1.2 秒广告后视为完整观看
    if (onDone) setTimeout(function () { onDone(true); }, 1200);
    return;
  }
  var unit = (PLAT === 'wx') ? REWARD_AD_UNIT_WX : REWARD_AD_UNIT;
  try {
    if (!_rvAd) {
      _rvAd = h.createRewardedVideoAd({ adUnitId: unit });
      _rvAd.onClose(function (res) { if (onDone) onDone(!!(res && res.isEnded)); });
      _rvAd.onError(function () { if (onDone) onDone(false); });
    }
    _rvAd.show().catch(function () {
      _rvAd.load().then(function () { _rvAd.show(); }).catch(function () { if (onDone) onDone(false); });
    });
  } catch (e) { if (onDone) onDone(false); }
}

/* =====================================================================
 * Banner 广告（日志 / 排行榜面板内展示）
 * 抖音填 BANNER_AD_UNIT、微信填 BANNER_AD_UNIT_WX（流量主 banner 广告位）；
 * 未创建时留空，宿主端创建失败自动忽略（不影响游戏运行）。
 * 浏览器预览端不展示（无原生广告组件）。
 * ===================================================================== */
var BANNER_AD_UNIT = '';      // 抖音：流量主 banner 广告位 ID
var BANNER_AD_UNIT_WX = '';   // 微信：流量主 banner 广告位 ID
var _banner = null;
function showBanner() {
  var h = __hostTouch();
  if (!h) return;   // 预览端无原生 banner
  if (_banner) { try { _banner.show(); } catch (e) { /* ignore */ } return; }
  try {
    var s = h.getSystemInfoSync();
    var bw = s.windowWidth || 320;
    var bh = Math.round(bw * 0.156);   // banner 常见宽高比 ≈ 320:50
    var safeBottom = (s.safeArea && s.screenHeight) ? (s.screenHeight - s.safeArea.bottom) : 0;
    _banner = h.createBannerAd({
      adUnitId: (PLAT === 'wx') ? BANNER_AD_UNIT_WX : BANNER_AD_UNIT,
      style: { left: 0, top: (s.windowHeight || 640) - bh - safeBottom, width: bw }
    });
    _banner.onError(function () { /* 广告加载失败静默 */ });
    _banner.show();
  } catch (e) { /* ignore */ }
}
function hideBanner() {
  if (_banner) { try { _banner.hide(); } catch (e) { /* ignore */ } }
}

/* =====================================================================
 * KV 用户云存储（免费云存档方案）
 *  - 抖音端：tt.setUserCloudStorage / tt.getUserCloudStorage /
 *            tt.removeUserCloudStorage（按 openid 维度，跨设备天然同步）
 *  - 微信端：复用自建后端 /api/save（server.js 按 devId 落盘；上线前
 *            配置 request 合法域名；跨设备同步后续可接 wx.login 换 openid）
 *  - 浏览器预览端：localStorage 前缀模拟（前缀 CLOUD_KV_PREFIX）
 *  - 平台限制（抖音）：单条 key+value ≤1024 字节；每用户每游戏 ≤128 条；
 *    value 必须为 string（core.js 负责分片 ≤950 字节/条）
 * ===================================================================== */
var CLOUD_KV_PREFIX = 'shj6_';
function cloudKVWrite(items, cb) {
  // items: [{key, value}]，key 不含前缀
  var h = __hostTouch();
  if (!h) {
    try {
      for (var i = 0; i < items.length; i++) {
        localStorage.setItem(CLOUD_KV_PREFIX + items[i].key, String(items[i].value));
      }
    } catch (e) { if (cb) cb(e); return; }
    if (cb) cb(null);
    return;
  }
  if (PLAT === 'wx') {
    // 微信端：整档对象走后端 /api/save
    var obj = {};
    for (var w = 0; w < items.length; w++) obj[CLOUD_KV_PREFIX + items[w].key] = String(items[w].value);
    httpJson('/api/save', 'POST', { devId: getDeviceId(), data: obj }).then(
      function () { if (cb) cb(null); },
      function (e) { if (cb) cb(e); }
    );
    return;
  }
  try {
    var list = [];
    for (var j = 0; j < items.length; j++) list.push({ key: CLOUD_KV_PREFIX + items[j].key, value: String(items[j].value) });
    tt.setUserCloudStorage({
      KVDataList: list,
      success: function () { if (cb) cb(null); },
      fail: function (e) { if (cb) cb(e); }
    });
  } catch (e) { if (cb) cb(e); }
}
function cloudKVRead(keys, cb) {
  // keys: 不含前缀；返回 {key: value}
  var h = __hostTouch();
  if (!h) {
    var out = {};
    try {
      for (var i = 0; i < keys.length; i++) {
        var v = localStorage.getItem(CLOUD_KV_PREFIX + keys[i]);
        if (v !== null) out[keys[i]] = v;
      }
    } catch (e) { if (cb) cb(e); return; }
    if (cb) cb(null, out);
    return;
  }
  if (PLAT === 'wx') {
    httpJson('/api/save?devId=' + encodeURIComponent(getDeviceId()), 'GET').then(
      function (r) {
        var o = {};
        if (r && r.data) {
          for (var k in r.data) {
            if (k.indexOf(CLOUD_KV_PREFIX) === 0) o[k.slice(CLOUD_KV_PREFIX.length)] = r.data[k];
          }
        }
        if (cb) cb(null, o);
      },
      function (e) { if (cb) cb(e); }
    );
    return;
  }
  try {
    var klist = [];
    for (var j = 0; j < keys.length; j++) klist.push(CLOUD_KV_PREFIX + keys[j]);
    tt.getUserCloudStorage({
      keyList: klist,
      success: function (r) {
        var o = {};
        if (r && r.KVDataList) {
          for (var m = 0; m < r.KVDataList.length; m++) {
            var it = r.KVDataList[m];
            var k = it.key;
            if (k && k.indexOf(CLOUD_KV_PREFIX) === 0) k = k.slice(CLOUD_KV_PREFIX.length);
            o[k] = it.value;
          }
        }
        if (cb) cb(null, o);
      },
      fail: function (e) { if (cb) cb(e); }
    });
  } catch (e) { if (cb) cb(e); }
}
function cloudKVRemove(keys, cb) {
  var h = __hostTouch();
  if (!h) {
    try {
      for (var i = 0; i < keys.length; i++) localStorage.removeItem(CLOUD_KV_PREFIX + keys[i]);
    } catch (e) { if (cb) cb(e); return; }
    if (cb) cb(null);
    return;
  }
  if (PLAT === 'wx') {
    // 微信端：删除整个 devId 存档
    httpJson('/api/save?devId=' + encodeURIComponent(getDeviceId()), 'DELETE').then(
      function () { if (cb) cb(null); },
      function (e) { if (cb) cb(e); }
    );
    return;
  }
  try {
    var klist = [];
    for (var j = 0; j < keys.length; j++) klist.push(CLOUD_KV_PREFIX + keys[j]);
    tt.removeUserCloudStorage({
      keyList: klist,
      success: function () { if (cb) cb(null); },
      fail: function (e) { if (cb) cb(e); }
    });
  } catch (e) { if (cb) cb(e); }
}

var SHPlatform = {
  PLAT: PLAT,
  isTT: PLAT === 'tt',
  isWX: PLAT === 'wx',
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
  getDeviceId: getDeviceId,
  showRewardedAd: showRewardedAd,
  REWARD_AD_UNIT: REWARD_AD_UNIT,
  REWARD_AD_UNIT_WX: REWARD_AD_UNIT_WX,
  showBanner: showBanner,
  hideBanner: hideBanner,
  BANNER_AD_UNIT: BANNER_AD_UNIT,
  BANNER_AD_UNIT_WX: BANNER_AD_UNIT_WX,
  cloudKVWrite: cloudKVWrite,
  cloudKVRead: cloudKVRead,
  cloudKVRemove: cloudKVRemove
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHPlatform;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHPlatform = SHPlatform;
}

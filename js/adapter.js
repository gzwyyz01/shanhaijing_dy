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
  onHide: onHide
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHPlatform;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHPlatform = SHPlatform;
}

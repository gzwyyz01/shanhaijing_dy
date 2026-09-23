'use strict';
/* =====================================================================
 * 《山海经·洪荒开荒》 UI 层 ui.js（Canvas 自绘，抖音小游戏 / 浏览器预览通用）
 *  - 不依赖 DOM，仅使用传入的 Platform 抽象（adapter.js）
 *  - 竖屏布局：Header / 资源条 / 提示条 / 页签 / 可滚动内容区 / 调试条 / 模态框
 *  - 触摸命中 + 内容滚动
 * ===================================================================== */

/* 引擎引用：抖音小游戏(require) / 浏览器预览(全局 SHCore) 双端兼容 */
var SHCore;
if (typeof module !== 'undefined' && module.exports) {
  SHCore = require('./core.js');
} else {
  SHCore = (typeof globalThis !== 'undefined' ? globalThis : this).SHCore;
}

var SHUI = (function () {
  var App = null;
  var Platform = null;
  var canvas = null, ctx = null;
  var W = 0, H = 0, DPR = 1, safeTop = 0, safeBottom = 0;
  var currentTab = 'bonfire';
  var scrollY = 0, scrollMax = 0, dragY = null, dragStartY = 0, touchX = 0, touchY = 0;
  var buttons = [];
  var modal = null;
  var devMode = false;
  var lastLogLen = -1;
  var dirty = true;
  /* 数值增量感知：资源变化闪金放大 + 操作上浮飘字 */
  var lastRes = {};
  var resPop = {};
  var floats = [];
  /* 侧边栏复访（必接能力）状态 */
  var sidebarAvail = false;                 // 宿主是否支持跳转侧边栏（tt.checkScene）
  var SIDEBAR_CLAIM_KEY = 'shj_sidebar_claim_date';
  var SIDEBAR_GIFT = { linghe: 500, wood: 10 };  // 每日礼包内容

  var C = {
    bg: '#0e1420', panel: '#17202f', panel2: '#1d2738', border: '#2a3950',
    text: '#dfe6f0', dim: '#8a97ab', jade: '#3fa46a', gold: '#dba901',
    red: '#d34e4e', blue: '#4ea1d3'
  };

  var TABS = [
    { key: 'bonfire', label: '篝火' },
    { key: 'village', label: '部族' },
    { key: 'tech', label: '典籍' },
    { key: 'craft', label: '炼器' },
    { key: 'prestige', label: '轮回' }
  ];

  /* ---------- 基础绘制 ---------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(s, x, y, size, color, align, bold) {
    if (s === undefined || s === null) s = '';
    ctx.font = (bold ? 'bold ' : '') + size + 'px sans-serif';
    ctx.fillStyle = color || C.text;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(s), x, y);
  }
  function clipText(s, maxW, size) {
    if (!s) return s;
    ctx.font = (size || 12) + 'px sans-serif';
    if (ctx.measureText(s).width <= maxW) return s;
    var t = String(s);
    while (t.length > 2 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function btn(x, y, w, h, label, enabled, cb, style) {
    var s = style || {};
    if (enabled === false) {
      ctx.globalAlpha = 0.38;
      roundRect(x, y, w, h, 6);
      ctx.fillStyle = C.panel2;
      ctx.fill();
      ctx.globalAlpha = 1;
      text(label, x + w / 2, y + (h - 13) / 2, 13, C.dim, 'center');
      return;
    }
    buttons.push({ x: x, y: y, w: w, h: h, cb: cb || null });
    roundRect(x, y, w, h, 6);
    ctx.fillStyle = s.fill || C.panel2;
    ctx.fill();
    ctx.strokeStyle = s.stroke || (s.danger ? C.red : C.jade);
    ctx.lineWidth = 1;
    ctx.stroke();
    text(label, x + w / 2, y + (h - 13) / 2, 13, s.color || (s.danger ? C.red : C.jade), 'center');
  }
  function rowPanel(x, y, w, h) {
    roundRect(x, y, w, h, 8);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ---------- 布局常量 ---------- */
  function layout() {
    var top = safeTop;
    var bottom = H - safeBottom;
    var headerH = 58;
    var resH = 94;
    var hintH = 40;
    var tabH = 44;
    var devH = devMode ? 38 : 0;
    return {
      top: top, bottom: bottom,
      headerTop: top, headerH: headerH,
      resTop: top + headerH, resH: resH,
      hintTop: top + headerH + resH, hintH: hintH,
      tabTop: top + headerH + resH + hintH, tabH: tabH,
      contentTop: top + headerH + resH + hintH + tabH,
      contentBottom: bottom - devH,
      devTop: bottom - devH, devH: devH
    };
  }

  /* ---------- 区块绘制 ---------- */
  function drawHeader(L) {
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, L.top, W, L.headerH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, L.top + L.headerH - 1, W, 1);
    text('山海经·洪荒开荒', 12, L.top + 8, 16, C.gold, 'left', true);
    var G = App.G;
    var s = SHCore.DATA.SEASONS[G.season];
    var modTxt = (App.isTech('lifa') && s.mod !== 1) ? '（灵禾 ×' + s.mod + '）' : '';
    text('第 ' + G.year + ' 年 · ' + s.name + ' · 第 ' + G.day + ' 天 ' + modTxt, 12, L.top + 30, 12, C.dim);
  }

  function drawResources(L) {
    var rates = App.calcRates();
    var keys = ['linghe', 'wood', 'stone', 'xueshi'];
    var cellW = W / keys.length;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = App.G.res[k] || 0;
      var max = App.getMax(k);
      var capTxt = isFinite(max) ? ' / ' + SHCore.fmt(max) : '';
      var rate = rates[k] || 0;
      var cls = rate > 0.0005 ? C.jade : (rate < -0.0005 ? C.red : C.dim);
      var cx = i * cellW;
      // 增量感知：数值变化 → 闪金放大 2 帧
      var last = lastRes[k];
      if (last === undefined) lastRes[k] = v;
      var changed = Math.abs(v - last) > 0.001;
      lastRes[k] = v;
      if (changed) resPop[k] = 2;
      var popping = resPop[k] > 0;
      if (resPop[k] > 0) resPop[k]--;
      if (i > 0) {
        ctx.fillStyle = C.border;
        ctx.fillRect(cx, L.resTop + 6, 1, L.resH - 12);
      }
      // 主资源（灵禾）：金边 + 上限进度条（>80% 琥珀提示将满）
      if (i === 0) {
        roundRect(cx + 3, L.resTop + 3, cellW - 6, L.resH - 6, 8);
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1;
        ctx.stroke();
        var pct = isFinite(max) && max > 0 ? Math.min(1, v / max) : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(cx + 8, L.resTop + 64, cellW - 16, 5, 3);
        ctx.fill();
        if (pct > 0.02) {
          ctx.fillStyle = pct > 0.8 ? C.gold : C.jade;
          roundRect(cx + 8, L.resTop + 64, (cellW - 16) * pct, 5, 3);
          ctx.fill();
        }
      }
      text(SHCore.DATA.RES_DEF[k].title, cx + 10, L.resTop + 8, 11, i === 0 ? C.gold : C.dim, 'left', i === 0);
      text(SHCore.fmt(v) + capTxt, cx + 10, L.resTop + 24, popping ? 16 : 15, popping ? C.gold : C.text, 'left', popping);
      // 速率：加大加粗 + ▲/▼ 方向箭头（绿涨红跌）
      var arrow = rate > 0.0005 ? '▲ ' : (rate < -0.0005 ? '▼ ' : '');
      text(arrow + SHCore.fmtRate(rate), cx + 10, L.resTop + 46, 13, cls, 'left', true);
    }
  }

  function drawHint(L) {
    ctx.fillStyle = C.panel2;
    ctx.fillRect(0, L.hintTop, W, L.hintH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, L.hintTop, W, 1);
    var hint = nextHint();
    var starving = App.G.starving;
    var color = starving ? C.red : C.gold;
    var y = L.hintTop + (L.hintH - 13) / 2;
    // 右侧操作按钮：入口有奖 / 日志 / 暂停 / 存档（放提示条，避开顶部模拟器悬浮调试条）
    var bw = 42, bh = 24, gap = 6;
    var sbW = sidebarAvail ? 70 : 0;   // 「入口有奖」仅侧边栏可用时显示
    var bx = W - 10 - (sidebarAvail ? sbW : bw);
    if (sidebarAvail) {
      var pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 420));
      ctx.save();
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      btn(bx, L.hintTop + (L.hintH - bh) / 2, sbW, bh, '入口有奖', true, openSidebarGift, { fill: '#3a2d0b', stroke: C.gold, color: C.gold });
      ctx.restore();
      bx -= sbW + gap;
    }
    btn(bx, L.hintTop + (L.hintH - bh) / 2, bw, bh, '存档', true, doSave, {});
    bx -= bw + gap;
    btn(bx, L.hintTop + (L.hintH - bh) / 2, bw, bh, App.G.running ? '暂停' : '继续', true, togglePause, { stroke: C.gold, color: C.gold });
    bx -= bw + gap;
    btn(bx, L.hintTop + (L.hintH - bh) / 2, bw, bh, '日志', true, showLogModal, {});
    // 提示文本（截断到按钮左侧）
    var str = hint;
    ctx.font = '12px sans-serif';
    var btnW = (sidebarAvail ? sbW + gap : 0) + bw * 3 + gap * 2 + 10;
    var maxW = W - 24 - btnW;
    while (ctx.measureText(str).width > maxW && str.length > 4) str = str.slice(0, -1);
    if (str !== hint) str = str.slice(0, -1) + '…';
    text(str, 12, y, 12, color);
  }

  function drawTabs(L) {
    var tw = W / TABS.length;
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      var active = t.key === currentTab;
      ctx.fillStyle = active ? C.panel2 : C.panel;
      ctx.fillRect(i * tw, L.tabTop, tw, L.tabH);
      if (active) {
        ctx.fillStyle = C.gold;
        ctx.fillRect(i * tw, L.tabTop, tw, 2);
      } else {
        ctx.fillStyle = C.border;
        ctx.fillRect(i * tw, L.tabTop + L.tabH - 1, tw, 1);
      }
      buttons.push({ x: i * tw, y: L.tabTop, w: tw, h: L.tabH, cb: (function (k) { return function () { switchTab(k); }; })(t.key) });
      text(t.label, i * tw + tw / 2, L.tabTop + (L.tabH - 15) / 2, 15, active ? C.gold : C.text, 'center', active);
    }
  }

  function drawContent(L) {
    var top = L.contentTop;
    var h = L.contentBottom - L.contentTop;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, h);
    ctx.clip();
    var rows = [];
    if (currentTab === 'bonfire') rows = buildBonfireRows();
    else if (currentTab === 'village') rows = buildVillageRows();
    else if (currentTab === 'tech') rows = buildTechRows();
    else if (currentTab === 'craft') rows = buildCraftRows();
    else if (currentTab === 'prestige') rows = buildPrestigeRows();
    var total = 0;
    for (var i = 0; i < rows.length; i++) total += rows[i].h;
    scrollMax = Math.max(0, total - h);
    if (scrollY > scrollMax) scrollY = scrollMax;
    if (scrollY < 0) scrollY = 0;
    var y = top - scrollY + 4;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (y + r.h > top && y < L.contentBottom) r.draw(y);
      y += r.h;
    }
    ctx.restore();
  }

  /* ---------- 总绘制入口 ---------- */
  function draw(L) {
    buttons = [];
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    drawHeader(L);
    drawResources(L);
    drawHint(L);
    drawTabs(L);
    drawContent(L);
    drawDevBar(L);
    drawModal();
    drawFloats();
  }

  /* 操作反馈飘字：上浮 + 淡出，1 秒生命周期 */
  function addFloat(x, y, str, color, size) {
    floats.push({ x: x, y: y, str: str, color: color || C.gold, size: size || 14, t0: Date.now() });
    dirty = true;
  }
  function drawFloats() {
    var now = Date.now();
    for (var i = floats.length - 1; i >= 0; i--) {
      var f = floats[i];
      var age = (now - f.t0) / 1000;
      if (age >= 1) { floats.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age);
      text(f.str, f.x, f.y - age * 22, f.size, f.color, 'center', true);
      ctx.restore();
    }
  }

  function drawDevBar(L) {
    if (!devMode) return;
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, L.devTop, W, L.devH);
    ctx.fillStyle = C.border;
    ctx.fillRect(0, L.devTop, W, 1);
    var items = [
      { label: App.G.speed === 10 ? '加速×10' : '加速', cb: toggleSpeed },
      { label: '+灵禾', cb: function () { App.G.res.linghe += 5000; } },
      { label: '+木料', cb: function () { App.G.res.wood += 5000; } },
      { label: '+青铜', cb: function () { App.G.res.bronze += 2000; } },
      { label: '+学识', cb: function () { App.G.res.xueshi += 5000; } },
      { label: '+族人', cb: function () { App.G.kittens += 10; } },
      { label: '全典籍', cb: function () { for (var i = 0; i < SHCore.DATA.TECH_ORDER.length; i++) App.G.techs[SHCore.DATA.TECH_ORDER[i]] = true; App.updateCaches(); } }
    ];
    var bw = (W - 20) / items.length;
    for (var i = 0; i < items.length; i++) {
      btn(10 + i * bw, L.devTop + 6, bw - 4, L.devH - 12, items[i].label, true, items[i].cb, {});
    }
  }

  function drawModal() {
    if (!modal) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    var mw = Math.min(300, W - 40);
    var mh = modal.tall ? Math.min(320, H - 80) : 150;
    var mx = (W - mw) / 2;
    var my = (H - mh) / 2;
    roundRect(mx, my, mw, mh, 10);
    ctx.fillStyle = C.panel2;
    ctx.fill();
    ctx.strokeStyle = C.border;
    ctx.stroke();
    text(modal.title || '提示', mx + 14, my + 14, 15, C.gold, 'left', true);
    // 正文换行（裁剪到按钮上方）
    ctx.font = '13px sans-serif';
    var lines = wrapText(modal.text || '', mw - 28);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx + 8, my + 40, mw - 16, mh - 40 - (modal.cancel ? 56 : 48));
    ctx.clip();
    for (var i = 0; i < lines.length; i++) {
      text(lines[i], mx + 14, my + 42 + i * 18, 13, C.text);
    }
    ctx.restore();
    var bw = 90, bh = 34;
    var bx = mx + mw - bw - 14;
    if (modal.cancel) {
      btn(bx - 6 - bw, my + mh - bh - 12, bw, bh, '取消', true, function () { var m = modal; modal = null; if (m.onCancel) m.onCancel(); }, {});
    }
    btn(bx, my + mh - bh - 12, bw, bh, modal.okText || '确定', true, function () { var m = modal; modal = null; if (m.onOk) m.onOk(); }, { stroke: C.gold, color: C.gold });
  }

  function wrapText(s, maxW) {
    var lines = [];
    var cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '\n') {
        lines.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
      if (ctx.measureText(cur).width > maxW) {
        lines.push(cur.slice(0, -1));
        cur = ch;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* ---------- 各行内容 ---------- */
  function lockedTxt(unlock) {
    return '需先参悟《' + SHCore.DATA.TECH_DEF[unlock].title + '》';
  }
  function costTxt(p) {
    var arr = [];
    for (var k in p) {
      var ok = (App.G.res[k] || 0) >= p[k];
      arr.push({ txt: SHCore.fmt(p[k]) + ' ' + (SHCore.DATA.RES_DEF[k] ? SHCore.DATA.RES_DEF[k].title : k), ok: ok });
    }
    return arr;
  }
  function fxTxt(fx) {
    var arr = [];
    var noTickKeys = { maxKittens: 1, lingheMax: 1, xueshiMax: 1, woodRatio: 1, xueshiRatio: 1, prodRatio: 1 };
    for (var k in fx) {
      var label = SHCore.DATA.RES_DEF[k] ? SHCore.DATA.RES_DEF[k].title : k;
      if (label === 'maxKittens') label = '族人上限';
      if (label === 'lingheMax') label = '灵禾上限';
      if (label === 'xueshiMax') label = '学识上限';
      if (label === 'woodRatio') label = '木料产出';
      if (label === 'xueshiRatio') label = '学识产出';
      var v = fx[k];
      var s = v >= 0 ? '+' : '−';
      s += SHCore.fmt(Math.abs(v));
      if (label === '木料产出' || label === '学识产出') s += '%';
      else if (!noTickKeys[k]) s += '/t';
      arr.push(s + ' ' + label);
    }
    return arr.join('　');
  }

  function buildBonfireRows() {
    var D = SHCore.DATA;
    var rows = [];
    // 采集行（原版猫薄荷手动采集）：灵田上方常驻
    rows.push({ h: 68, draw: function (y) {
      rowPanel(10, y, W - 20, 60);
      text('采集灵禾', 20, y + 10, 14, C.text, 'left', true);
      text('轻点采集 +10 灵禾', 20, y + 34, 11.5, C.dim);
      btn(W - 110, y + 28, 96, 26, '采集 +10', true, function () {
        if (App.gather()) addFloat(W - 62, y + 24, '+10 灵禾', C.gold);
        dirty = true;
      }, { stroke: C.gold, color: C.gold });
    } });
    // 精炼行（10 灵禾 → 1 木料）：灵田上方常驻
    rows.push({ h: 68, draw: function (y) {
      rowPanel(10, y, W - 20, 60);
      text('精炼木料', 20, y + 10, 14, C.text, 'left', true);
      text('100 灵禾 → 1 木料', 20, y + 34, 11.5, C.dim);
      var can = (App.G.res.linghe || 0) >= 100;
      btn(W - 110, y + 28, 96, 26, '精炼', can, function () {
        App.craft('wood');
        if (can) addFloat(W - 62, y + 24, '+1 木料', C.jade);
        dirty = true;
      }, {});
    } });
    for (var i = 0; i < D.BLD_ORDER.length; i++) {
      var k = D.BLD_ORDER[i];
      var b = D.BLD_DEF[k];
      if (!App.isBldUnlocked(k)) continue;   // 未解锁建筑隐藏（对齐猫国：解锁后才显示）
      (function (k2, b2) {
        var n = App.G.bld[k2] || 0;
        var p = App.getPrice(k2);
        var costs = costTxt(p);
        var fx = fxTxt(b2.fx);
        var can = App.canAfford(p);
        rows.push({ h: 96, draw: function (y) {
          rowPanel(10, y, W - 20, 88);
          text(b2.title, 20, y + 10, 14, C.text, 'left', true);
          text('×' + n, W - 20 - 16, y + 10, 13, C.gold, 'right');
          // 价格行
          var px = 20;
          for (var c = 0; c < costs.length; c++) {
            text(costs[c].txt, px, y + 34, 12, costs[c].ok ? C.text : C.red);
            px += ctx.measureText(costs[c].txt).width + 10;
          }
          text(b2.desc, 20, y + 56, 11.5, C.dim);
          if (fx) text(clipText(fx, W - 110, 11.5), 20, y + 70, 11.5, C.jade);
          btn(W - 70, y + 44, 56, 26, '建造', can, function () {
            App.build(k2);
            if (can) addFloat(W - 42, y + 40, b2.title + ' +1', C.gold);
            dirty = true;
          }, {});
        } });
      })(k, b);
    }
    return rows;
  }

  function buildVillageRows() {
    var D = SHCore.DATA;
    var rows = [];
    var maxK = App.getEffect('maxKittens');
    var rates = App.calcRates();
    var foodRate = rates.linghe || 0;
    var pct = Math.min(100, Math.floor(App.G.kittenProgress * 100));
    rows.push({ h: 84, draw: function (y) {
      rowPanel(10, y, W - 20, 76);
      text('族人', 20, y + 10, 14, C.text, 'left', true);
      text(App.G.kittens + ' / ' + maxK, W - 20 - 16, y + 10, 13, C.gold, 'right');
      // 出生进度条
      ctx.fillStyle = C.bg;
      roundRect(20, y + 34, W - 40, 8, 4);
      ctx.fill();
      ctx.fillStyle = C.jade;
      roundRect(20, y + 34, (W - 40) * pct / 100, 8, 4);
      ctx.fill();
      text('出生进度 ' + pct + '% · 灵禾收支 ' + SHCore.fmtRate(foodRate), 20, y + 50, 11.5, C.dim);
      if (App.G.starving) text('⚠ 灵禾断绝，族人正在饿死！', 20, y + 63, 11.5, C.red);
    } });
    for (var i = 0; i < D.JOB_ORDER.length; i++) {
      var k = D.JOB_ORDER[i];
      var j = D.JOB_DEF[k];
      if (!App.isJobUnlocked(k)) continue;   // 未解锁职业隐藏
      (function (k2, j2) {
        var n = App.G.jobs[k2] || 0;
        var jfx = [];
        for (var f in j2.fx) jfx.push('+' + SHCore.fmt(j2.fx[f]) + ' ' + D.RES_DEF[f].title + '/t');
        rows.push({ h: 68, draw: function (y) {
          rowPanel(10, y, W - 20, 60);
          text(j2.title, 20, y + 9, 14, C.text, 'left', true);
          text('×' + n, W - 20 - 16, y + 9, 13, C.gold, 'right');
          text(clipText(j2.desc + ' · ' + jfx.join(' '), W - 150, 11.5), 20, y + 34, 11.5, C.dim);
          btn(W - 110, y + 30, 40, 26, '−', true, function () { App.setJob(k2, -1); dirty = true; }, {});
          btn(W - 62, y + 30, 40, 26, '＋', true, function () { App.setJob(k2, 1); dirty = true; }, {});
        } });
      })(k, j);
    }
    return rows;
  }

  function buildTechRows() {
    var D = SHCore.DATA;
    var rows = [];
    for (var i = 0; i < D.TECH_ORDER.length; i++) {
      var k = D.TECH_ORDER[i];
      var t = D.TECH_DEF[k];
      if (App.G.techs[k]) {
        rows.push({ h: 46, draw: (function (t2) {
          return function (y) {
            rowPanel(10, y, W - 20, 38);
            ctx.strokeStyle = C.jade;
            ctx.lineWidth = 1;
            roundRect(10, y, W - 20, 38, 8);
            ctx.stroke();
            text(t2.title, 20, y + 11, 14, C.text, 'left', true);
            text('已研', W - 20 - 16, y + 11, 12, C.jade, 'right');
            text(t2.desc, 20, y + 22, 11, C.dim);
          };
        })(t) });
        continue;
      }
      (function (k2, t2) {
        var can = App.techReqsMet(k2) && App.canAfford(t2.prices);
        var reqMet = App.techReqsMet(k2);
        var costs = costTxt(t2.prices);
        rows.push({ h: 96, draw: function (y) {
          rowPanel(10, y, W - 20, 88);
          text(t2.title, 20, y + 10, 14, C.text, 'left', true);
          var px = 20;
          for (var c = 0; c < costs.length; c++) {
            text(costs[c].txt, px, y + 34, 12, costs[c].ok ? C.text : C.red);
            px += ctx.measureText(costs[c].txt).width + 10;
          }
          text(t2.desc, 20, y + 56, 11.5, C.dim);
          if (!reqMet) text('需先参悟前置典籍', 20, y + 72, 11, C.red);
          btn(W - 70, y + 44, 56, 26, '参悟', can, function () { App.research(k2); dirty = true; }, {});
        } });
      })(k, t);
    }
    return rows;
  }

  function buildCraftRows() {
    var D = SHCore.DATA;
    var rows = [];
    for (var i = 0; i < D.CRAFT_ORDER.length; i++) {
      var k = D.CRAFT_ORDER[i];
      var c = D.CRAFT_DEF[k];
      if (!App.isCraftUnlocked(k)) continue;   // 未解锁配方隐藏
      (function (k2, c2) {
        var needOk = true, needTxt = '';
        if (c2.need) {
          var parts = [];
          for (var j = 0; j < c2.need.length; j++) {
            var bn = c2.need[j];
            var have = (App.G.bld[bn] || 0) >= 1;
            if (!have) needOk = false;
            parts.push(D.BLD_DEF[bn].title + (have ? '' : '（未建）'));
          }
          needTxt = '需要：' + parts.join('、');
        }
        var can = needOk && App.canAfford(c2.prices);
        var costs = costTxt(c2.prices);
        rows.push({ h: 96, draw: function (y) {
          rowPanel(10, y, W - 20, 88);
          text(c2.title, 20, y + 10, 14, C.text, 'left', true);
          text('×' + (App.G.res[k2] || 0), W - 20 - 16, y + 10, 13, C.gold, 'right');
          var px = 20;
          for (var c3 = 0; c3 < costs.length; c3++) {
            text(costs[c3].txt, px, y + 34, 12, costs[c3].ok ? C.text : C.red);
            px += ctx.measureText(costs[c3].txt).width + 10;
          }
          text(c2.desc, 20, y + 56, 11.5, C.dim);
          if (needTxt) text(needTxt, 20, y + 72, 11, C.dim);
          btn(W - 70, y + 44, 56, 26, '炼制', can, function () { App.craft(k2); dirty = true; }, {});
        } });
      })(k, c);
    }
    return rows;
  }

  function buildPrestigeRows() {
    var rows = [];
    var preview = App.getQiyunPreview();
    rows.push({ h: 62, draw: function (y) {
      rowPanel(10, y, W - 20, 54);
      text('气运', 20, y + 10, 14, C.text, 'left', true);
      text(App.G.qiyun + ' 点', W - 20 - 16, y + 10, 13, C.gold, 'right');
      text('每点气运 +1% 全部产出（当前 ' + SHCore.fmt((1 + App.getEffect('prodRatio')) * 100) + '%）。轮回时保留。', 20, y + 32, 11.5, C.dim);
    } });
    rows.push({ h: 84, draw: function (y) {
      rowPanel(10, y, W - 20, 76);
      text('兵解轮回', 20, y + 10, 14, C.text, 'left', true);
      text(clipText('族人数 ' + App.G.kittens + '；轮回可得气运 +' + preview + ' 点（需族人 > 70）。', W - 120, 11.5), 20, y + 32, 11.5, C.dim);
      btn(W - 90, y + 38, 76, 28, '兵解轮回', preview > 0, function () {
        modal = {
          title: '兵解轮回',
          text: '将舍弃所有建筑、典籍与资源，仅保留气运 +' + preview + ' 点。轮回前自动备份旧档。是否继续？',
          okText: '轮回',
          cancel: true,
          onOk: function () { App.reincarnate(); dirty = true; },
          onCancel: null
        };
      }, { danger: true });
    } });
    rows.push({ h: 50, draw: function (y) {
      text('轮回将舍弃所有家业；轮回前会自动备份旧档。', 20, y + 6, 11.5, C.dim);
    } });
    return rows;
  }

  /* ---------- 提示与日志 ---------- */
  function nextHint() {
    var G = App.G;
    var x = G.res.xueshi || 0;
    var D = SHCore.DATA;
    if (G.starving)
      return '灵禾告罄，族人正在挨饿！' + (x >= D.TECH_DEF.lifa.prices.xueshi ? '学识已足：参悟《历法》→《百草经》，派灵农（产出不受季节）即解粮荒。' : '先建更多灵田，待灵禾收支转正。');
    if (!G.techs.lifa && x >= D.TECH_DEF.lifa.prices.xueshi && App.techReqsMet('lifa'))
      return '学识已足，前往「典籍」参悟《历法》——解锁樵夫与林场，木料自动化。';
    if (G.techs.lifa && !G.techs.baicaojing && x >= D.TECH_DEF.baicaojing.prices.xueshi && App.techReqsMet('baicaojing'))
      return '参悟《百草经》解锁灵农：产出不受季节影响，冬季不再挨饿。';
    var rates = App.calcRates();
    if ((rates.linghe || 0) < -0.0005)
      return '灵禾入不敷出（' + SHCore.fmtRate(rates.linghe) + '）：铺更多灵田，或研《百草经》后派灵农。';
    var maxK = App.getEffect('maxKittens');
    if (maxK <= 0)
      return '无草庐：精炼攒 50 木料建草庐，族人才会前来定居。';
    if (G.kittens >= maxK)
      return '草庐已满（' + G.kittens + '/' + maxK + '），建造更多草庐以容纳新族人。';
    return '灵禾收支为正，族人稳步增长。入冬前囤足灵禾（冬季产出 ×0.25）。';
  }

  function showLogModal() {
    var G = App.G;
    var lines = [];
    var n = Math.min(G.log.length, 14);
    for (var i = G.log.length - n; i < G.log.length; i++) {
      var e = G.log[i];
      lines.push(e.year + '年 ' + e.text);
    }
    modal = { title: '部落日志（近 ' + n + ' 条）', text: lines.join('\n'), okText: '关闭', cancel: false, onOk: null, tall: true };
  }

  /* ---------- 侧边栏复访每日礼包（必接能力） ---------- */
  function sidebarToday() {
    var d = new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd);
  }
  function sidebarClaimedToday() {
    try { return Platform.storageGet(SIDEBAR_CLAIM_KEY) === sidebarToday(); } catch (e) { return false; }
  }
  function sidebarClaimToday() {
    try { Platform.storageSet(SIDEBAR_CLAIM_KEY, sidebarToday()); } catch (e) { /* ignore */ }
  }
  function openSidebarGift() {
    if (!Platform.isTT) {
      // 浏览器预览：仅展示弹窗说明（不跳转、不发奖）
      modal = {
        title: '抖音首页侧边栏入口奖励',
        text: '（预览模式提示）在抖音端接入侧边栏复访能力：\n① 点击「去首页侧边栏」\n② 在侧边栏点击「山海经·洪荒开荒」\n③ 返回游戏，立即领奖\n每日可领一次部族礼包。',
        okText: '知道了',
        cancel: false,
        tall: true
      };
      return;
    }
    if (!Platform.isFromSidebar()) {
      // 未从侧边栏进入：展示引导 + 去首页侧边栏
      modal = {
        title: '抖音首页侧边栏入口奖励',
        text: '每日限领一次的部族礼包（灵禾 +' + SIDEBAR_GIFT.linghe + '、木料 +' + SIDEBAR_GIFT.wood + '）！\n① 点击下方「去首页侧边栏」\n② 在侧边栏点击「山海经·洪荒开荒」\n③ 返回游戏，立即领奖',
        okText: '去首页侧边栏',
        cancel: true,
        onOk: function () { Platform.navigateToSidebar(); },
        tall: true
      };
      return;
    }
    // 已从侧边栏进入：领奖（每日一次）
    if (sidebarClaimedToday()) {
      modal = {
        title: '今日已领取',
        text: '今日部族礼包已领取完毕，明日再来逛逛侧边栏吧！',
        okText: '确定',
        cancel: false
      };
      return;
    }
    modal = {
      title: '抖音首页侧边栏入口奖励',
      text: '恭喜！已从抖音首页侧边栏进入游戏。\n领取今日部族礼包：\n灵禾 +' + SIDEBAR_GIFT.linghe + '、木料 +' + SIDEBAR_GIFT.wood,
      okText: '立即领奖',
      cancel: true,
      onOk: function () {
        App.G.res.linghe = (App.G.res.linghe || 0) + SIDEBAR_GIFT.linghe;
        App.G.res.wood = (App.G.res.wood || 0) + SIDEBAR_GIFT.wood;
        sidebarClaimToday();
        App.log('领取侧边栏每日礼包（灵禾 +' + SIDEBAR_GIFT.linghe + '、木料 +' + SIDEBAR_GIFT.wood + '）');
        App.save();
        Platform.showToast('礼包已领取');
        dirty = true;
      }
    };
  }

  /* ---------- 操作 ---------- */
  function switchTab(tab) {
    currentTab = tab;
    scrollY = 0;
    dirty = true;
  }
  function togglePause() { App.G.running = !App.G.running; dirty = true; }
  function doSave() { App.save(); App.log('已手动存档。'); Platform.showToast('已存档'); dirty = true; }
  function toggleSpeed() { App.G.speed = App.G.speed === 1 ? 10 : 1; dirty = true; }

  function hitTest(p) {
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (b.cb) { b.cb(); return true; }
      }
    }
    return false;
  }

  function onDown(p) {
    touchX = p.x; touchY = p.y;
    if (modal) { hitTest(p); return; }
    if (hitTest(p)) return;
    dragY = p.y;
    dragStartY = scrollY;
  }
  function onMove(p) {
    if (modal || dragY === null) return;
    scrollY = dragStartY + (dragY - p.y);
    dirty = true;
  }
  function onUp() { dragY = null; }

  /* ---------- 主循环 ---------- */
  var TICK_INTERVAL = 200;   // 原版 TPS=5：每 0.2s 执行一次 tick（1 秒 = 5 tick = 1 天）
  var lastTickTs = 0;
  function frame(ts) {
    var now = (typeof ts === 'number') ? ts : Date.now();
    if (now - lastTickTs >= TICK_INTERVAL) {
      lastTickTs = now - ((now - lastTickTs) % TICK_INTERVAL);  // 对齐 200ms 网格，防漂移
      App.tick();
      dirty = true;   // 每逻辑 tick 刷新数值（5 次/秒，对齐原版观感）
    }
    var L = layout();
    // 文本变化检测（提示条等）
    if (App.G.log.length !== lastLogLen) { lastLogLen = App.G.log.length; dirty = true; }
    if (floats.length) dirty = true;   // 飘字动画持续刷新
    if (dirty) { draw(L); dirty = false; }
    Platform.raf(frame);
  }

  function boot(app, platform, opts) {
    App = app;
    Platform = platform;
    opts = opts || {};
    devMode = !!opts.dev;
    var info = Platform.getInfo();
    W = info.width;
    H = info.height;
    DPR = info.dpr || 1;
    safeTop = info.safeTop || 0;
    safeBottom = info.safeBottom || 0;
    canvas = Platform.createCanvas();
    if (canvas.width !== W * DPR) canvas.width = W * DPR;
    if (canvas.height !== H * DPR) canvas.height = H * DPR;
    ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    if (opts.attach && typeof opts.attach === 'function') opts.attach(canvas);
    Platform.onTouchStart(onDown);
    Platform.onTouchMove(onMove);
    Platform.onTouchEnd(onUp);
    if (Platform.onShow) Platform.onShow(function () { App.G.running = true; dirty = true; });
    if (Platform.onHide) Platform.onHide(function () { App.save(); App.G.running = false; });
    // 侧边栏复访：查询宿主是否支持跳转侧边栏（是则显示「入口有奖」）
    if (Platform.checkSidebar) {
      Platform.checkSidebar(function (r) { sidebarAvail = !!(r && r.isExist); dirty = true; });
    }
    lastLogLen = App.G.log.length;
    Platform.raf(frame);
    return canvas;
  }

  function setDevMode(v) { devMode = v; dirty = true; }
  function setTab(t) { switchTab(t); }

  var SHUI = {
    boot: boot,
    setDevMode: setDevMode,
    setTab: setTab,
    get canvas() { return canvas; }
  };
  return SHUI;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHUI;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHUI = SHUI;
}

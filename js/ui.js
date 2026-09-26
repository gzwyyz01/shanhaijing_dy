'use strict';
/* =====================================================================
 * 《山海开荒模拟》 UI 层 ui.js（Canvas 自绘，抖音小游戏 / 浏览器预览通用）
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
  /* 部族巅峰榜（排行榜）状态 */
  var rankPanel = null;        // { list, total, loading, error }
  var savePanel = null;        // 多档位存档 / 读档面板
  var lastPeakSent = -1;       // 已成功上报的巅峰值（防重复提交）
  var lastPeakNoticed = -1;    // 已提示过的巅峰值（新巅峰飘字）
  var rankFrameCount = 0;
  /* KV 云存档状态（免费云存档） */
  var cloudInfo = null;        // 云端 meta 缓存（null=无云端数据）
  var cloudInfoChecked = false;

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
    { key: 'prestige', label: '轮回' },
    { key: 'deeds', label: '功业' }
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
    var hintH = 56;
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
    text('山海开荒模拟', 12, L.top + 8, 16, C.gold, 'left', true);
    var G = App.G;
    var s = SHCore.DATA.SEASONS[G.season];
    var modTxt = (App.isTech('lifa') && s.mod !== 1) ? '（灵禾 ×' + s.mod + '）' : '';
    text('第 ' + G.year + ' 年 · ' + s.name + ' · 第 ' + G.day + ' 天 ' + modTxt, 12, L.top + 30, 12, C.dim);
  }

  /* 资源栏显示列表：按解锁时间排序；未开始产出（无库存且无产出）隐藏 */
  function visibleResKeys(rates) {
    var order = ['linghe', 'wood', 'kittens', 'xueshi', 'stone', 'bronze',
      'wuliang', 'shiban', 'tongban', 'xuantie', 'xuntie', 'xinghuishi', 'ruishou', 'hetuluoshu'];
    var list = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      if (k === 'kittens') {                       // 族人：首座草庐后显示
        if (App.G.bld.caolu >= 1) list.push('kittens');
      } else if (k === 'linghe' || k === 'wood') { // 灵禾恒显；木料开局可精炼恒显
        list.push(k);
      } else if (k === 'xueshi') {                 // 学识：藏经阁建成后有来源
        if (App.G.bld.cangjingge >= 1 || (App.G.res[k] || 0) > 0 || (rates[k] || 0) > 0) list.push(k);
      } else {                                     // 其余：有库存或有产出才显示
        if ((App.G.res[k] || 0) > 0 || (rates[k] || 0) > 0) list.push(k);
      }
    }
    return list;
  }

  function drawResources(L) {
    var rates = App.calcRates();
    var keys = visibleResKeys(rates);
    var cellW = W / keys.length;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var isKitten = k === 'kittens';
      var v = isKitten ? App.G.kittens : (App.G.res[k] || 0);
      var max = isKitten ? App.getEffect('maxKittens') : App.getMax(k);
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
      text(isKitten ? '族人' : SHCore.DATA.RES_DEF[k].title, cx + 10, L.resTop + 8, 11, i === 0 ? C.gold : C.dim, 'left', i === 0);
      // 数值+上限：自适应字号防止大数溢出窄格
      var fullTxt = SHCore.fmt(v) + capTxt;
      var fs = popping ? 16 : 15;
      ctx.font = (popping ? 'bold ' : '') + fs + 'px sans-serif';
      var maxW = cellW - 16;
      while (ctx.measureText(fullTxt).width > maxW && fs > 9) { fs -= 1; ctx.font = (popping ? 'bold ' : '') + fs + 'px sans-serif'; }
      text(fullTxt, cx + 10, L.resTop + 24, fs, popping ? C.gold : C.text, 'left', popping);
      // 速率：加大加粗 + ▲/▼ 方向箭头（绿涨红跌）；同样自适应字号
      var rateTxt, rCls;
      if (isKitten) {   // 族人显示生息/挨饿状态
        if (App.G.starving) { rateTxt = '▼ 挨饿中'; rCls = C.red; }
        else if (v < max) { rateTxt = '▲ 繁衍生息'; rCls = C.jade; }
        else { rateTxt = '· 人满为患'; rCls = C.dim; }
      } else {
        var arrow = rate > 0.0005 ? '▲ ' : (rate < -0.0005 ? '▼ ' : '');
        rateTxt = arrow + SHCore.fmtRate(rate);
        rCls = cls;
      }
      var fs2 = 13;
      ctx.font = 'bold ' + fs2 + 'px sans-serif';
      while (ctx.measureText(rateTxt).width > maxW && fs2 > 9) { fs2 -= 1; ctx.font = 'bold ' + fs2 + 'px sans-serif'; }
      text(rateTxt, cx + 10, L.resTop + 46, fs2, rCls, 'left', true);
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
    var y = L.hintTop + 44;
    // 右侧操作按钮：入口有奖 / 日志 / 暂停 / 存档（放提示条，避开顶部模拟器悬浮调试条）
    var bw = 42, bh = 24, gap = 4;
    var sbW = sidebarAvail ? 64 : 0;   // 「入口有奖」仅侧边栏可用时显示
    // 按钮行宽度自适应：窄屏自动收窄按钮，避免最左（加速）被挤出屏幕
    var nBtn = 6;   // 存档/暂停/日志/排行/重开/加速
    var gapCnt = nBtn + (sbW ? 1 : 0);
    if (W - 10 - sbW - gapCnt * gap < nBtn * bw) {
      bw = Math.max(30, Math.floor((W - 10 - sbW - gapCnt * gap) / nBtn));
    }
    var bx = W - 10 - (sidebarAvail ? sbW : bw);
    if (sidebarAvail) {
      var pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 420));
      ctx.save();
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      btn(bx, L.hintTop + 2, sbW, bh, '入口有奖', true, openSidebarGift, { fill: '#3a2d0b', stroke: C.gold, color: C.gold });
      ctx.restore();
      bx -= sbW + gap;
    }
    btn(bx, L.hintTop + 2, bw, bh, '存档', true, doSave, {});
    bx -= bw + gap;
    btn(bx, L.hintTop + 2, bw, bh, App.G.running ? '暂停' : '继续', true, togglePause, { stroke: C.gold, color: C.gold });
    bx -= bw + gap;
    btn(bx, L.hintTop + 2, bw, bh, '日志', true, showLogModal, {});
    bx -= bw + gap;
    btn(bx, L.hintTop + 2, bw, bh, '排行', true, openRankPanel, { stroke: C.jade, color: C.jade });
    bx -= bw + gap;
    btn(bx, L.hintTop + 2, bw, bh, '重开', true, askReset, { stroke: C.red, color: C.red });
    bx -= bw + gap;
    /* 加速开关（正式功能）：×1 ↔ ×2，放重开左边，开启后 1 秒 = 2 天 */
    btn(bx, L.hintTop + 2, bw, bh, App.G.speed > 1 ? '已加速' : '加速', true, toggleSpeed2,
        App.G.speed > 1 ? { stroke: C.jade, color: C.jade } : {});
    // 提示文本：按钮行在上、文字在下（不同 y，互不遮挡）→ 文字用整行宽度，超长自动换两行
    var str = hint;
    ctx.font = '12px sans-serif';
    var maxW = W - 24;
    var line1 = str, line2 = '';
    if (ctx.measureText(str).width > maxW) {
      var t = str;
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
      line1 = t;
      line2 = str.slice(t.length);
      if (ctx.measureText(line2).width > maxW) {
        var u = line2;
        while (u.length > 1 && ctx.measureText(u + '…').width > maxW) u = u.slice(0, -1);
        line2 = u + '…';
      }
    }
    text(line1, 12, L.hintTop + 31, 12, color);
    if (line2) text(line2, 12, L.hintTop + 44, 12, color);
  }

  function drawTabs(L) {
    var vis = [];
    for (var vi = 0; vi < TABS.length; vi++) {   // 渐进解锁：篝火恒显示，其余达成条件后显示
      var tk = TABS[vi];
      if (tk.key === 'bonfire' || App.G.tabUnlock[tk.key]) vis.push(tk);
    }
    var tw = W / vis.length;
    for (var i = 0; i < vis.length; i++) {
      var t = vis[i];
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
    if (currentTab !== 'bonfire' && !App.G.tabUnlock[currentTab]) currentTab = 'bonfire';   // 未解锁页不可停留
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
    else if (currentTab === 'deeds') rows = buildDeedsRows();
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
    drawRankPanel(L);
    drawSavePanel(L);
    drawModal();   // modal 永远最顶层（解锁/确认弹窗不被面板遮挡）
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
    var noTickKeys = { maxKittens: 1, lingheMax: 1, xueshiMax: 1, woodMax: 1, woodRatio: 1, xueshiRatio: 1, prodRatio: 1, lingheRatio: 1, stoneRatio: 1, bronzeRatio: 1, tradeSlots: 1 };
    for (var k in fx) {
      var label = SHCore.DATA.RES_DEF[k] ? SHCore.DATA.RES_DEF[k].title : k;
      if (label === 'maxKittens') label = '族人上限';
      if (label === 'lingheMax') label = '灵禾上限';
      if (label === 'xueshiMax') label = '学识上限';
      if (label === 'woodMax') label = '木料上限';
      if (label === 'woodRatio') label = '木料产出';
      if (label === 'xueshiRatio') label = '学识产出';
      if (label === 'lingheRatio') label = '灵禾产出';
      if (label === 'stoneRatio') label = '石料产出';
      if (label === 'bronzeRatio') label = '青铜产出';
      if (label === 'tradeSlots') label = '贸易位';
      if (label === 'prodRatio') label = '全部产出';
      var v = fx[k];
      var s = v >= 0 ? '+' : '−';
      s += SHCore.fmt(Math.abs(v));
      if (label === '木料产出' || label === '学识产出' || label === '灵禾产出' || label === '石料产出' || label === '青铜产出' || label === '全部产出') s += '%';
      else if (!noTickKeys[k]) s += '/秒';
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
      text('轻点采集 +1 灵禾', 20, y + 34, 11.5, C.dim);
      btn(W - 110, y + 28, 96, 26, '采集 +1', true, function () {
        if (App.gather()) addFloat(W - 62, y + 24, '+1 灵禾', C.gold);
        dirty = true;
      }, { stroke: C.gold, color: C.gold });
    } });
    // 精炼行（100 灵禾 → 1 木料）：灵田上方常驻
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
    var assigned = 0, k2;
    for (k2 in App.G.jobs) assigned += App.G.jobs[k2];
    var idle = App.G.kittens - assigned;
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
      text('空闲 ' + idle + ' 人 · 出生进度 ' + pct + '% · 灵禾收支 ' + SHCore.fmtRate(foodRate), 20, y + 50, 11.5, C.dim);
      if (App.G.starving) text('⚠ 灵禾断绝，族人正在饿死！', 20, y + 63, 11.5, C.red);
    } });
    for (var i = 0; i < D.JOB_ORDER.length; i++) {
      var k = D.JOB_ORDER[i];
      var j = D.JOB_DEF[k];
      if (!App.isJobUnlocked(k)) continue;   // 未解锁职业隐藏
      (function (k2, j2) {
        var n = App.G.jobs[k2] || 0;
        var canAdd = assigned < App.G.kittens;      // 无空闲族人不准加人
        var canRemove = n > 0;
        var jfx = [];
        for (var f in j2.fx) jfx.push('+' + SHCore.fmt(j2.fx[f]) + ' ' + D.RES_DEF[f].title + '/秒');
        rows.push({ h: 68, draw: function (y) {
          rowPanel(10, y, W - 20, 60);
          text(j2.title, 20, y + 9, 14, C.text, 'left', true);
          text('×' + n, W - 20 - 16, y + 9, 13, C.gold, 'right');
          text(clipText(j2.desc + ' · ' + jfx.join(' '), W - 150, 11.5), 20, y + 34, 11.5, C.dim);
          btn(W - 110, y + 30, 40, 26, '−', canRemove, function () { App.setJob(k2, -1); dirty = true; }, {});
          btn(W - 62, y + 30, 40, 26, '＋', canAdd, function () { App.setJob(k2, 1); dirty = true; }, {});
        } });
      })(k, j);
    }
    return rows;
  }

  function buildTechRows() {
    var D = SHCore.DATA;
    var rows = [];
    var list = App.getTechDisplayList();   // 渐进显示：已研 + 下一批候选
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
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

  function buildDeedsRows() {
    var D = SHCore.DATA;
    var rows = [];
    var nDone = 0, i;
    for (i = 0; i < D.ACH_ORDER.length; i++) if (App.G.ach[D.ACH_ORDER[i]]) nDone++;
    var ev = App.G.event ? D.EVENT_DEF[App.G.event.id] : null;
    rows.push({ h: 62, draw: function (y) {
      rowPanel(10, y, W - 20, 54);
      text('功业', 20, y + 10, 14, C.text, 'left', true);
      text(nDone + ' / ' + D.ACH_ORDER.length, W - 20 - 16, y + 10, 13, C.gold, 'right');
      if (ev) {
        var evTxt = '【' + ev.title + '】' + ev.text + (App.G.event.remain > 0 ? '（剩 ' + App.G.event.remain + ' 天）' : '');
        text(clipText(evTxt, W - 60, 11.5), 20, y + 30, 11.5, C.red);
      } else {
        text('天象平和，暂无异动。', 20, y + 30, 11.5, C.dim);
      }
    } });
    for (i = 0; i < D.ACH_ORDER.length; i++) {
      var id = D.ACH_ORDER[i];
      var a = D.ACH_DEF[id];
      var done = !!App.G.ach[id];
      (function (a2, done2) {
        rows.push({ h: 52, draw: function (y) {
          rowPanel(10, y, W - 20, 44);
          text(a2.title, 20, y + 8, 13, done2 ? C.jade : C.text, 'left', done2);
          text(done2 ? '已达成' : '未达成', W - 20 - 16, y + 8, 11, done2 ? C.jade : C.dim, 'right');
          text(clipText(a2.desc, W - 140, 11), 20, y + 24, 11, done2 ? C.jade : C.dim);
        } });
      })(a, done);
    }
    return rows;
  }

  /* ---------- 提示与日志 ---------- */
  function nextHint() {
    var G = App.G;
    var x = G.res.xueshi || 0;
    var D = SHCore.DATA;
    if (G.starving)
      return '灵禾告罄，族人正在挨饿！' + (x >= D.TECH_DEF.lifa.prices.xueshi ? '学识已足：参悟《历法》→《百草经》，派灵农（产出不受季节）即解粮荒。' : '先建更多灵田，待灵禾收支转正。');
    if (G.event) {
      var evD = SHCore.DATA.EVENT_DEF[G.event.id];
      if (evD) return '【' + evD.title + '】' + evD.text + (G.event.remain > 0 ? '（剩 ' + G.event.remain + ' 天）' : '');
    }
    if (!G.techs.lifa && x >= D.TECH_DEF.lifa.prices.xueshi && App.techReqsMet('lifa'))
      return '学识已足，前往「典籍」参悟《历法》——解锁樵夫与林场，木料自动化。';
    if (G.techs.lifa && !G.techs.baicaojing && x >= D.TECH_DEF.baicaojing.prices.xueshi && App.techReqsMet('baicaojing'))
      return '参悟《百草经》解锁灵农：产出不受季节影响，冬季不再挨饿。';
    var rates = App.calcRates();
    if ((rates.linghe || 0) < -0.0005)
      return '灵禾入不敷出（' + SHCore.fmtRate(rates.linghe) + '）：铺更多灵田，或研《百草经》后派灵农。';
    var maxK = App.getEffect('maxKittens');
    if (maxK <= 0)
      return '无草庐：精炼攒 5 木料建草庐，族人才会前来定居。';
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
    modal = { title: '部落日志（近 ' + n + ' 条）', text: lines.join('\n'), okText: '关闭', cancel: false, onOk: function () { Platform.hideBanner(); }, tall: true };
    Platform.showBanner();   // 日志面板内展示 banner 广告
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
        text: '（预览模式提示）在抖音端接入侧边栏复访能力：\n① 点击「去首页侧边栏」\n② 在侧边栏点击「山海开荒模拟」\n③ 返回游戏，立即领奖\n每日可领一次部族礼包。',
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
        text: '每日限领一次的部族礼包（灵禾 +' + SIDEBAR_GIFT.linghe + '、木料 +' + SIDEBAR_GIFT.wood + '）！\n① 点击下方「去首页侧边栏」\n② 在侧边栏点击「山海开荒模拟」\n③ 返回游戏，立即领奖',
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

  /* ---------- 部族巅峰榜（排行榜） ---------- */
  function seasonName(s) { return SHCore.DATA.SEASONS[Math.max(0, Math.min(3, s))].name; }
  function openRankPanel() {
    rankPanel = { list: [], total: 0, loading: true, error: '' };
    loadRank();
    Platform.showBanner();   // 排行榜面板内展示 banner 广告
    dirty = true;
  }
  function loadRank() {
    if (!Platform.httpJson) { rankPanel.error = '当前环境不支持联网'; rankPanel.loading = false; return; }
    Platform.httpJson('/api/rank?top=20', 'GET').then(function (d) {
      if (d && d.ok) { rankPanel.list = d.list || []; rankPanel.total = d.total || 0; }
      else { rankPanel.error = '榜单暂时无法获取'; }
      rankPanel.loading = false; dirty = true;
    }).catch(function () { rankPanel.error = '网络异常，稍后再试'; rankPanel.loading = false; dirty = true; });
  }
  function drawRankPanel(L) {
    if (!rankPanel) return;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    var mw = Math.min(340, W - 24);
    var mh = Math.min(H - 60, H * 0.84);
    var mx = (W - mw) / 2, my = 26;
    roundRect(mx, my, mw, mh, 10);
    ctx.fillStyle = C.panel2; ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();
    text('部族巅峰榜', mx + 14, my + 12, 16, C.gold, 'left', true);
    var G = App.G;
    text('我的巅峰：' + G.peakKittens + ' 名族人 · ' + '第' + G.peakYear + '年·' + seasonName(G.peakSeason) + '·第' + G.peakDay + '天', mx + 14, my + 38, 11.5, C.jade);
    var topY = my + 60;
    var rowH = 24;
    var rows = rankPanel.list || [];
    if (rankPanel.loading) {
      text('榜单加载中…', mx + 14, topY + 12, 13, C.dim);
    } else if (rankPanel.error) {
      text(rankPanel.error, mx + 14, topY + 12, 13, C.red);
    } else if (!rows.length) {
      text('暂无上榜部族，快去壮大你的氏族吧！', mx + 14, topY + 12, 13, C.dim);
    } else {
      text('名次', mx + 14, topY, 11.5, C.dim);
      text('巅峰族人', mx + 64, topY, 11.5, C.dim);
      text('达成时刻', mx + 150, topY, 11.5, C.dim);
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var yy = topY + 14 + i * rowH;
        if (yy + rowH > my + mh - 50) break;
        var top3 = r.rank <= 3;
        text('#' + r.rank, mx + 14, yy, 13, top3 ? C.gold : C.text, 'left', top3);
        text(SHCore.fmt(r.peak), mx + 64, yy, 13, top3 ? C.gold : C.text, 'left', top3);
        text('第' + r.year + '年·' + seasonName(r.season) + '·' + r.day + '天', mx + 150, yy, 12, C.dim);
      }
      if (rankPanel.total > rows.length) text('… 共 ' + rankPanel.total + ' 位部族上榜', mx + 14, my + mh - 46, 11.5, C.dim);
    }
    btn(mx + mw - 100, my + mh - 40, 44, 28, '刷新', true, function () { rankPanel.loading = true; rankPanel.error = ''; loadRank(); }, {});
    btn(mx + mw - 50, my + mh - 40, 40, 28, '关闭', true, function () { rankPanel = null; Platform.hideBanner(); dirty = true; }, { stroke: C.gold, color: C.gold });
  }
  /* 巅峰上报：新巅峰即时飘字 + 防抖提交（仅在新峰值时 POST） */
  function uploadPeakIfNeeded(L) {
    var G = App.G;
    if (!G.peakKittens) return;
    if (G.peakKittens > lastPeakNoticed) {
      lastPeakNoticed = G.peakKittens;
      if (L) addFloat(W / 2, L.contentTop + 36, '新巅峰：族人 ' + G.peakKittens + ' 名', C.gold, 16);
    }
    if (G.peakKittens <= lastPeakSent) return;
    Platform.httpJson('/api/rank', 'POST', {
      devId: Platform.getDeviceId(),
      peak: G.peakKittens, day: G.peakDay, season: G.peakSeason, year: G.peakYear
    }).then(function (d) { if (d && d.ok) lastPeakSent = G.peakKittens; })
      .catch(function () { /* 网络失败，稍后重试 */ });
  }

  /* ---------- 操作 ---------- */
  function switchTab(tab) {
    currentTab = tab;
    scrollY = 0;
    dirty = true;
  }
  function togglePause() { App.G.running = !App.G.running; dirty = true; }
  function doSave() { openSavePanel(); }

  /* ---------- 多档位存档 / 读档面板（档位1免费保留，档位2-10看广告解锁） ---------- */
  function openSavePanel() { savePanel = {}; refreshCloudInfo(); dirty = true; }
  function drawSavePanel(L) {
    if (!savePanel) return;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    var mw = Math.min(340, W - 24);
    var mh = Math.min(H - 24, 64 + 10 * 44 + 48 + 52);
    var mx = (W - mw) / 2, my = Math.max(8, (H - mh) / 2);
    roundRect(mx, my, mw, mh, 10);
    ctx.fillStyle = C.panel2; ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.stroke();
    text('存档 / 读档', mx + 14, my + 10, 16, C.gold, 'left', true);
    text('档位1为自动存档（免费保留）；档位2-10首次使用需观看激励广告解锁。', mx + 14, my + 32, 10.5, C.dim);
    var slots = App.getSlots();
    var rowY = my + 52, rowH = 44;
    for (var i = 1; i <= 10; i++) {
      var s = slots[i];
      var yy = rowY + (i - 1) * rowH;
      var locked = i > 1 && !App.isSlotUnlocked(i);
      ctx.fillStyle = (i % 2) ? '#182232' : '#1d2738';
      ctx.fillRect(mx + 8, yy, mw - 16, rowH - 4);
      text('档位 ' + i, mx + 14, yy + 6, 13, locked ? C.dim : C.gold, 'left', true);
      if (locked) {
        text('🔒 未解锁 · 看广告解锁', mx + 14, yy + 24, 10.5, C.dim);
      } else if (s && s.has) {
        text('第' + s.year + '年·' + seasonName(s.season) + '·第' + s.day + '天 · 族人' + s.kittens + '（巅峰' + s.peakKittens + '）', mx + 14, yy + 24, 10, C.text);
      } else {
        text('（空档位）', mx + 14, yy + 24, 10.5, C.dim);
      }
      btn(mx + mw - 86, yy + 7, 34, 30, '存档', true, (function (n) { return function () { saveToSlotUI(n); }; })(i), {});
      btn(mx + mw - 48, yy + 7, 34, 30, '读档', true, (function (n) { return function () { loadSlotUI(n); }; })(i), locked ? {} : { stroke: C.gold, color: C.gold });
    }
    /* 云存档行：状态 + 上传 / 下载 / 清除 */
    var ctxt = '云端存档：';
    if (!cloudInfoChecked) ctxt += '查询中…';
    else if (!cloudInfo) ctxt += '无（未上传）';
    else ctxt += _fmtTime(cloudInfo.t) + ' · ' + _cloudSlotCount(cloudInfo) + ' 档';
    text(ctxt, mx + 14, my + mh - 86, 10.5, cloudInfo ? C.jade : C.dim);
    btn(mx + 8, my + mh - 44, 72, 30, '上传云端', true, cloudUploadUI, {});
    btn(mx + 84, my + mh - 44, 72, 30, '下载云端', true, cloudDownloadUI, { stroke: C.blue, color: C.blue });
    btn(mx + 160, my + mh - 44, 72, 30, '清除云端', true, cloudClearUI, { danger: true });
    btn(mx + mw - 48, my + mh - 44, 40, 30, '关闭', true, function () { savePanel = null; dirty = true; }, { stroke: C.gold, color: C.gold });
  }
  /* ---------- KV 云存档（免费，openid 维度跨设备） ---------- */
  function _fmtTime(t) {
    var d = new Date(t || 0);
    var mo = d.getMonth() + 1, dd = d.getDate();
    var hh = d.getHours(), mm = d.getMinutes();
    return mo + '-' + dd + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function _cloudSlotCount(meta) {
    if (!meta || !meta.parts) return 0;
    var n = 0;
    for (var k in meta.parts) { if (meta.parts[k] > 0 && k !== 'main') n++; }
    if (meta.parts.main) n++;
    return n;
  }
  function refreshCloudInfo() {
    cloudInfoChecked = false;
    cloudInfo = null;
    dirty = true;
    if (!App.cloudGetInfo) { cloudInfoChecked = true; return; }
    App.cloudGetInfo(function (err, meta) {
      cloudInfo = meta || null;
      cloudInfoChecked = true;
      dirty = true;
    });
  }
  function cloudUploadUI() {
    modal = {
      title: '上传云端存档',
      text: '将本地全部档位（含解锁权益）上传并覆盖云端存档。换设备登录同一抖音号即可恢复。是否继续？',
      okText: '上传',
      cancel: true,
      onOk: function () {
        App.cloudUpload(function (err) {
          if (err) { Platform.showToast('上传失败'); return; }
          refreshCloudInfo();
          Platform.showToast('已上传云端');
          App.log('已将全部档位上传云端。');
          dirty = true;
        });
      },
      onCancel: null
    };
  }
  function cloudDownloadUI() {
    App.cloudGetInfo(function (err, meta) {
      if (err || !meta) { Platform.showToast('云端无存档'); return; }
      modal = {
        title: '下载云端存档',
        text: '将用云端存档覆盖本地全部档位（当前进度会先自动存档到档位1）。是否继续？',
        okText: '下载并恢复',
        cancel: true,
        onOk: function () {
          App.save();   // 当前进度先入档位1
          App.cloudDownload(function (err2) {
            if (err2) { Platform.showToast('下载失败'); return; }
            App.load();   // 应用云端主档
            lastRes = {}; resPop = {};
            floats = [];
            scrollY = 0; currentTab = 'bonfire';
            savePanel = null;
            refreshCloudInfo();
            App.log('已从云端恢复存档。');
            Platform.showToast('已从云端恢复');
            dirty = true;
          });
        },
        onCancel: null
      };
    });
  }
  function cloudClearUI() {
    modal = {
      title: '清除云端存档',
      text: '将删除云端全部存档（本地存档不受影响）。是否继续？',
      okText: '清除',
      cancel: true,
      onOk: function () {
        App.cloudClear(function (err) {
          refreshCloudInfo();
          Platform.showToast('云端已清空');
          dirty = true;
        });
      },
      onCancel: null
    };
  }

  /* 解锁档位（2-10）：先看激励广告，完整观看才永久解锁 */
  function ensureSlotUnlock(n, cb) {
    if (n === 1 || App.isSlotUnlocked(n)) { cb(); return; }
    modal = {
      title: '解锁档位 ' + n,
      text: '档位 ' + n + ' 未解锁。观看一段激励视频广告即可永久解锁该档位（解锁后可反复存档 / 读档）。',
      okText: '观看广告解锁',
      cancel: true,
      onOk: function () {
        Platform.showRewardedAd({
          onDone: function (watched) {
            if (watched) { App.unlockSlot(n); dirty = true; cb(); }
            else { Platform.showToast('需完整观看广告才能解锁'); }
          }
        });
      }
    };
  }
  function saveToSlotUI(n) {
    ensureSlotUnlock(n, function () {
      if (App.saveToSlot(n)) {
        App.log('已存档到档位 ' + n);
        Platform.showToast('已存档到档位' + n);
      }
      dirty = true;
    });
  }
  function loadSlotUI(n) {
    ensureSlotUnlock(n, function () {
      var slots = App.getSlots();
      if (!slots[n] || !slots[n].has) { Platform.showToast('档位 ' + n + ' 无存档'); return; }
      modal = {
        title: '读取档位 ' + n,
        text: '读取档位 ' + n + ' 将覆盖当前进度（当前进度会先自动保存到档位1）。是否继续？',
        okText: '读取',
        cancel: true,
        onOk: function () {
          App.save();   // 当前进度先存入档位1，防止误操作丢失
          if (App.loadSlot(n)) {
            lastRes = {}; resPop = {};
            floats = [];
            scrollY = 0; currentTab = 'bonfire';
            savePanel = null;
            App.log('读取档位 ' + n + ' 的存档。');
            Platform.showToast('已读取档位' + n);
            dirty = true;
          } else { Platform.showToast('读取失败'); }
        }
      };
    });
  }

  /* 重开存档：确认后观看激励视频广告，完整观看才从 0 重开（否则取消） */
  function askReset() {
    modal = {
      title: '重开存档',
      text: '将清除当前全部进度（建筑 / 资源 / 典籍 / 族人 / 气运），从 0 重新开荒。\n需完整观看一段激励视频广告方可重开。',
      okText: '观看广告重开',
      cancel: true,
      onOk: function () {
        Platform.showRewardedAd({
          onDone: function (watched) {
            if (watched) {
              App.resetAll();
              if (App.cloudClear) App.cloudClear(function () { /* 静默清云端，避免下次启动误恢复旧档 */ });
              lastRes = {}; resPop = {};
              floats = [];
              scrollY = 0; currentTab = 'bonfire';
              dirty = true;
              App.log('观看广告后重开存档，从 0 开始。');
              Platform.showToast('已重开存档');
            } else {
              Platform.showToast('需完整观看广告才能重开');
            }
          }
        });
      },
      onCancel: null
    };
  }
  function toggleSpeed() { App.G.speed = App.G.speed === 1 ? 10 : 1; dirty = true; }
  /* 正式加速开关：×1 ↔ ×2 */
  function toggleSpeed2() {
    App.G.speed = App.G.speed > 1 ? 1 : 2;
    if (App.G.speed > 1) {
      App.log('开启双倍速：时光流转加快，1 秒 = 2 天。');
      addFloat(W / 2, safeTop + 96, '双倍速开启 ×2', C.jade, 15);
    } else {
      App.log('已关闭加速，恢复常速。');
      addFloat(W / 2, safeTop + 96, '常速 ×1', C.dim, 15);
    }
    App.save();
    dirty = true;
  }

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
    if (rankPanel) { hitTest(p); return; }
    if (modal) { hitTest(p); return; }
    if (savePanel) { hitTest(p); return; }
    if (hitTest(p)) return;
    dragY = p.y;
    dragStartY = scrollY;
  }
  function onMove(p) {
    if (rankPanel || modal || dragY === null) return;
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
    // 排行榜：新巅峰提示 + 上报（每 2 秒检查，仅新峰值才发请求）
    rankFrameCount++;
    if (rankFrameCount % 120 === 0) uploadPeakIfNeeded(L);
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
    // 云存档：启动 2 秒后检测云端存档并提示恢复（仅本地无主档时，新设备/清缓存场景）
    setTimeout(function () { checkCloudOnStart(); }, 2000);
    Platform.raf(frame);
    return canvas;
  }
  function checkCloudOnStart() {
    if (!App.cloudHasData) return;
    var hasLocal = !!(Platform.storageGet && Platform.storageGet('shanhajing_save_v1'));
    if (hasLocal) return;   // 本地已有进度，不打扰（可在存档面板手动下载）
    App.cloudHasData(function (has) {
      if (!has) return;
      App.cloudGetInfo(function (err, meta) {
        if (err || !meta) return;
        modal = {
          title: '检测到云端存档',
          text: '云端存有档位（上传于 ' + _fmtTime(meta.t) + '）。是否从云端恢复？恢复将覆盖当前进度（当前进度会先存档位1）。',
          okText: '恢复',
          cancel: true,
          onOk: function () {
            App.save();
            App.cloudDownload(function (e) {
              if (e) { Platform.showToast('恢复失败'); return; }
              App.load();
              lastRes = {}; resPop = {};
              floats = [];
              scrollY = 0; currentTab = 'bonfire';
              App.log('已从云端恢复存档。');
              Platform.showToast('已恢复云端存档');
              dirty = true;
            });
          },
          onCancel: null
        };
        dirty = true;
      });
    });
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

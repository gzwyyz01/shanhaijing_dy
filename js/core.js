'use strict';
/* =====================================================================
 * 《山海经·洪荒开荒》 引擎层 core.js（抖音小游戏版）
 * 由浏览器原型 game.js 的 data/core/managers 层迁移而来：
 *  - 移除全部 DOM UI，仅保留纯逻辑
 *  - 存档存储走平台适配（tt / localStorage / 可注入内存存储）
 *  - 双模式导出：Node(module.exports) / 全局(SHCore)
 * ===================================================================== */

/* ================= 0. 全局常量 ================= */
var TPS = 5;
var DAY_TICKS = 5;           // 1 天 = 5 tick（1 秒）→ 对齐原版节奏（原版约 1 天/秒，一年约 6-7 分钟）
var TICKS_PER_DAY = 10;
var DAYS_PER_SEASON = 100;
var KITTEN_CONSUME = 8.5;     // 原版 0.85/t ×10：灵田(3/t) 3 座养 1 人（对齐原版 3 田养 1 猫）；灵农(10/t) 养 1.18 人
var KITTEN_BIRTH_BASE = 0.01;    // 原版 0.01/t：约 20 秒 1 名新生儿
var START_LINGHE = 0;   // 对齐原版：开局灵禾为 0，靠手动采集 + 灵田产出起步
var STARTER = { lingTian: 0, caolu: 0, kittens: 0 };   // 对齐猫国：开局 0 田，手动采集攒 100 灵禾建第 1 座灵田

/* ================= 1. 数据层 data/ ================= */
var SEASONS = [
  { name: '春', mod: 1.5,  log: '春回大地，灵禾萌发。' },
  { name: '夏', mod: 1.0,  log: '炎炎夏日，万物生长。' },
  { name: '秋', mod: 1.0,  log: '金秋时节，百谷丰登。' },
  { name: '冬', mod: 0.25, log: '凛冬已至，万物肃杀。' }
];

var RES_ORDER = ['linghe', 'wood', 'stone', 'bronze', 'xueshi', 'wuliang', 'shiban', 'tongban', 'xuantie'];
var RES_DEF = {
  linghe:  { title: '灵禾', desc: '族人口粮，维系生息' },
  wood:    { title: '木料', desc: '营造之材' },
  stone:   { title: '石料', desc: '凿山所得' },
  bronze:  { title: '青铜', desc: '熔炼而生', unlock: 'jinjing' },
  xueshi:  { title: '学识', desc: '典籍之学' },
  wuliang: { title: '屋梁', desc: '营造之材', craft: true },
  shiban:  { title: '石板', desc: '营造之材', craft: true },
  tongban: { title: '铜板', desc: '铸器之材', craft: true },
  xuantie: { title: '玄铁', desc: '百炼神铁', craft: true }
};

var BLD_ORDER = ['lingTian', 'caolu', 'muliaoCang', 'linchang', 'cangjingge', 'liangcang', 'kuangdong', 'lianqifang', 'yelianlu'];
var BLD_DEF = {
  lingTian:  { title: '灵田', desc: '开垦沃土，灵禾自生', unlock: 'start', ratio: 1.12, prices: { linghe: 100 }, fx: { linghe: 3 } },
  caolu:     { title: '草庐', desc: '遮风避雨，族人安居（1 座 = 2 人口上限）', unlock: 'wood', ratio: 2.5,  prices: { wood: 50 }, fx: { maxKittens: 2 } },
  muliaoCang:{ title: '木料仓', desc: '贮存木料，以应营造（木料上限 +1000）', unlock: 'wood', ratio: 1.5, prices: { wood: 100 }, fx: { woodMax: 1000 } },
  linchang:  { title: '林场', desc: '入山采伐，林木不绝', unlock: 'lifa', ratio: 1.15, prices: { linghe: 400, wood: 300 }, fx: { wood: 0.5 } },
  cangjingge:{ title: '藏经阁', desc: '藏书之所，学识之源', unlock: 'wood', ratio: 1.15, prices: { wood: 50 }, fx: { xueshi: 2.5, xueshiMax: 500 } },
  liangcang: { title: '粮仓', desc: '储粮备荒，以度严冬（灵禾上限 +1500）', unlock: 'wood', ratio: 1.75, prices: { wood: 150 }, fx: { lingheMax: 1500 } },
  kuangdong: { title: '矿洞', desc: '凿山取石，深掘矿脉', unlock: 'shanjing', ratio: 1.15, prices: { wood: 600, stone: 400 }, fx: { stone: 0.5 } },
  lianqifang:{ title: '炼器坊', desc: '熔炼万物之所', unlock: 'shanjing', ratio: 1.15, prices: { wood: 800, stone: 500 }, fx: {} },
  yelianlu:  { title: '冶炼炉', desc: '烈火熔金，青铜乃成', unlock: 'jinjing', ratio: 1.15, prices: { wood: 1500, stone: 800, bronze: 300 }, fx: { bronze: 0.5 } }
};

var JOB_ORDER = ['caiyaoren', 'lingnong', 'qiaofu', 'zaoshijiang'];
var JOB_DEF = {
  caiyaoren:  { title: '采药人', desc: '采撷灵药，聊补粮秣（开局即可分配）', unlock: 'start', fx: { linghe: 0.5 } },
  lingnong:   { title: '灵农', desc: '耕种灵禾', unlock: 'baicaojing', fx: { linghe: 10 } },
  qiaofu:     { title: '樵夫', desc: '入山伐木（需先精炼起家）', unlock: 'lifa', fx: { wood: 0.18 } },
  zaoshijiang:{ title: '凿石匠', desc: '凿石开山', unlock: 'shanjing', fx: { stone: 0.5 } }
};

var TECH_ORDER = ['lifa', 'baicaojing', 'shouliejing', 'shanjing', 'jinjing', 'suanjing', 'yingzaojing', 'zhuqijing'];
var TECH_DEF = {
  lifa:        { title: '历法', desc: '观天象，知四时', prices: { xueshi: 300 }, req: null },
  baicaojing:  { title: '百草经', desc: '辨百草，兴稼穑', prices: { xueshi: 1000 }, req: 'lifa' },
  shouliejing: { title: '狩猎经', desc: '入山林，猎百兽', prices: { xueshi: 3000 }, req: 'baicaojing', fx: { woodRatio: 0.5 } },
  shanjing:    { title: '山经', desc: '识山岳，知其矿脉', prices: { xueshi: 5000 }, req: 'baicaojing' },
  jinjing:     { title: '金经', desc: '五金之术，熔炼成器', prices: { xueshi: 9000 }, req: 'shanjing' },
  suanjing:    { title: '算经', desc: '精于术数，博闻强识', prices: { xueshi: 10000 }, req: 'lifa', fx: { xueshiRatio: 0.5 } },
  yingzaojing: { title: '营造经', desc: '营室造屋之法', prices: { xueshi: 13000 }, req: 'suanjing' },
  zhuqijing:   { title: '铸器经', desc: '铸铜炼铁，神器初成', prices: { xueshi: 22000 }, req: ['jinjing', 'yingzaojing'] }
};

var CRAFT_ORDER = ['wood', 'wuliang', 'shiban', 'tongban', 'xuantie'];
var CRAFT_DEF = {
  wood:    { title: '木料', desc: '精炼灵禾为木（100 灵禾 → 10 木料）', unlock: 'start', need: null, prices: { linghe: 100 }, yield: 10 },
  wuliang: { title: '屋梁', desc: '大木成梁', unlock: 'yingzaojing', need: ['lianqifang'], prices: { wood: 1750 } },
  shiban:  { title: '石板', desc: '凿石成板', unlock: 'yingzaojing', need: ['lianqifang'], prices: { stone: 2500 } },
  tongban: { title: '铜板', desc: '青铜锻板', unlock: 'zhuqijing', need: ['lianqifang'], prices: { bronze: 1250 } },
  xuantie: { title: '玄铁', desc: '百炼成玄铁', unlock: 'zhuqijing', need: ['yelianlu'], prices: { bronze: 1000 } }
};

/* ================= 2. 核心工具 core/ ================= */
function getLimitedDR(value, cap) {
  if (value <= cap) return value;
  var d = value - cap;
  return cap + 0.25 * d * cap / (d + cap);
}

function fmt(n) {
  if (!isFinite(n)) return '∞';
  var a = Math.abs(n);
  if (a >= 1e8) return trim(n / 1e8) + '亿';
  if (a >= 1e4) return trim(n / 1e4) + '万';
  if (a >= 1000) return trim(n / 1000) + 'K';
  if (a >= 100) return Math.floor(n).toString();
  if (a >= 1) return (Math.round(n * 10) / 10).toString();
  return (Math.round(n * 100) / 100).toString();
}
function trim(s) { return (Math.round(s * 100) / 100).toString(); }
function fmtRate(n) {
  if (Math.abs(n) < 0.0005) return '0';
  return (n >= 0 ? '+' : '−') + fmt(Math.abs(n)) + '/t';
}

/* ================= 2.5 存档存储适配（tt / localStorage / 可注入） ================= */
var _storageAdapter = null;
function setStorageAdapter(impl) { _storageAdapter = impl; }
function storageGet(k) {
  if (_storageAdapter) return _storageAdapter.get(k);
  if (typeof tt !== 'undefined') { try { return tt.getStorageSync(k); } catch (e) { return null; } }
  if (typeof localStorage !== 'undefined') { try { return localStorage.getItem(k); } catch (e) { return null; } }
  return null;
}
function storageSet(k, v) {
  if (_storageAdapter) return _storageAdapter.set(k, v);
  if (typeof tt !== 'undefined') { try { tt.setStorageSync(k, v); } catch (e) { /* ignore */ } return; }
  if (typeof localStorage !== 'undefined') { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
}

/* ================= 3. 游戏工厂 core+managers/ ================= */
function createGame() {
  var G = {
    running: true,
    speed: 1,
    tick: 0, day: 1, season: 0, year: 1,
    res: {}, bld: {}, jobs: {}, techs: {},
    kittens: 0, kittenProgress: 0, qiyun: 0, starveProgress: 0,
    effects: {}, log: [], seen: {},
    lastSaveTick: 0, autosaveEvery: 400,
    starving: false
  };
  var SAVE_KEY = 'shanhajing_save_v1';
  var BACKUP_KEY = 'shanhajing_save_backup';
  /* 存档版本：数值/开局机制调整时必须 +1。旧版本存档（含无版本号存档）
     将自动备份到 backup 并清空主档，重新开荒——保证新设备/新版本从 0 开始，
     避免旧数值存档与新版本不兼容导致死锁或"非从 0 开局" */
  var SAVE_VERSION = 4;   // v4：数值框架对齐猫国（开局 0 灵田、草庐 50 木），旧档备份后从 0 开荒

  function starterKit() {
    G.res.linghe = START_LINGHE;
    G.bld.lingTian = STARTER.lingTian;
    G.bld.caolu = STARTER.caolu;
    G.kittens = STARTER.kittens;
  }

  function migrate(d) {
    if (!d) return;
    d.res = shallow(d.res || {});
    d.bld = shallow(d.bld || {});
    d.jobs = shallow(d.jobs || {});
    d.techs = shallow(d.techs || {});
    d.seen = shallow(d.seen || {});
    if (!d.log) d.log = [];
    if (typeof d.kittens === 'number') d.kittens = Math.floor(d.kittens);
    if (d.res.linghe === undefined) d.res.linghe = 0;   // 仅缺失时补 0，旧档灵禾保留
  }

  function isTech(n) { return !!G.techs[n]; }
  function techReqsMet(name) {
    var t = TECH_DEF[name];
    if (!t.req) return true;
    var reqs = Array.isArray(t.req) ? t.req : [t.req];
    for (var i = 0; i < reqs.length; i++) { if (!isTech(reqs[i])) return false; }
    return true;
  }
  function isBldUnlocked(name) {
    var b = BLD_DEF[name];
    if (!b.unlock || b.unlock === 'start') return true;
    if (RES_DEF[b.unlock]) return (G.res[b.unlock] || 0) > 0;   // 资源门槛（如草庐需拥有木料）
    return isTech(b.unlock);
  }
  function isJobUnlocked(name) { var j = JOB_DEF[name]; return !j.unlock || j.unlock === 'start' || isTech(j.unlock); }
  function isResUnlocked(name) { var r = RES_DEF[name]; return !r.unlock || isTech(r.unlock); }
  function isCraftUnlocked(name) { var c = CRAFT_DEF[name]; return !c.unlock || c.unlock === 'start' || isTech(c.unlock); }
  function canAfford(p) { for (var k in p) { if ((G.res[k] || 0) < p[k]) return false; } return true; }

  function updateCaches() {
    var E = {};
    var i, k, f;
    for (i = 0; i < BLD_ORDER.length; i++) {
      k = BLD_ORDER[i];
      var n = G.bld[k] || 0;
      if (n <= 0) continue;
      for (f in BLD_DEF[k].fx) E[f] = (E[f] || 0) + BLD_DEF[k].fx[f] * n;
    }
    for (i = 0; i < TECH_ORDER.length; i++) {
      k = TECH_ORDER[i];
      if (G.techs[k] && TECH_DEF[k].fx) {
        for (f in TECH_DEF[k].fx) E[f] = (E[f] || 0) + TECH_DEF[k].fx[f];
      }
    }
    E.prodRatio = getLimitedDR(G.qiyun * 0.01, 0.5);
    G.effects = E;
  }
  function getEffect(name) { return G.effects[name] || 0; }

  function getPrice(name) {
    var b = BLD_DEF[name];
    var n = G.bld[name] || 0;
    var p = {};
    for (var k in b.prices) p[k] = Math.ceil(b.prices[k] * Math.pow(b.ratio, n));
    return p;
  }

  function calcRates() {
    var R = {};
    var i, k;
    for (i = 0; i < RES_ORDER.length; i++) {
      k = RES_ORDER[i];
      var v = getEffect(k);
      if (v) R[k] = v;
    }
    R.linghe = (R.linghe || 0) * SEASONS[G.season].mod;
    for (i = 0; i < JOB_ORDER.length; i++) {
      k = JOB_ORDER[i];
      if (!isJobUnlocked(k)) continue;
      var n = G.jobs[k] || 0;
      if (n <= 0) continue;
      for (var f in JOB_DEF[k].fx) R[f] = (R[f] || 0) + JOB_DEF[k].fx[f] * n;
    }
    var prod = 1 + getEffect('prodRatio');
    for (i = 0; i < RES_ORDER.length; i++) {
      k = RES_ORDER[i];
      if (R[k]) R[k] = R[k] * prod;
    }
    R.wood *= 1 + getEffect('woodRatio');
    R.xueshi *= 1 + getEffect('xueshiRatio');
    R.linghe -= G.kittens * KITTEN_CONSUME;
    return R;
  }

  function getMax(res) {
    if (res === 'linghe') return 1000 + getEffect('lingheMax');
    if (res === 'xueshi') return 1000 + getEffect('xueshiMax');
    if (res === 'wood') return 1000 + getEffect('woodMax');
    return Infinity;
  }

  function log(text) {
    G.log.push({ t: G.tick, year: G.year, text: text });
    if (G.log.length > 200) G.log.shift();
  }

  function calendarUpdate() {
    G.tick++;
    if (G.tick % DAY_TICKS !== 0) return;   // 每 5 tick（1 秒）才推进 1 天，避免日期飞走
    G.day++;
    if (G.day > DAYS_PER_SEASON) {
      G.day = 1;
      G.season = (G.season + 1) % 4;
      log(SEASONS[G.season].log);
      if (G.season === 0) {
        G.year++;
        log('开天第 ' + G.year + ' 年。');
      }
    }
  }

  function resourcesUpdate() {
    var rates = calcRates();
    for (var i = 0; i < RES_ORDER.length; i++) {
      var k = RES_ORDER[i];
      if (!isResUnlocked(k)) continue;
      var v = (G.res[k] || 0) + (rates[k] || 0);
      var max = getMax(k);
      if (isFinite(max) && v > max) v = max;
      if (v < 0) v = 0;
      G.res[k] = v;
    }
    G.starving = (G.kittens > 0) && ((rates.linghe || 0) < 0) && ((G.res.linghe || 0) <= 0);
  }

  function villageUpdate() {
    var maxK = getEffect('maxKittens');
    if (!G.starving && G.kittens < maxK) {
      G.kittenProgress += KITTEN_BIRTH_BASE;
      if (G.kittenProgress >= 1) {
        G.kittenProgress = 0;
        G.kittens++;
        log('一名族人在部落中呱呱坠地。');
      }
    } else {
      if (G.kittenProgress > 0.99) G.kittenProgress = 0.99;
    }
    if (G.starving) {
      G.starveProgress += Math.max(0.005, 0.01 * Math.max(G.kittens, 1));
      if (G.starveProgress >= 1) {
        G.starveProgress -= 1;
        G.kittens = Math.max(0, Math.floor(G.kittens) - 1);
        G.kittenProgress = 0;
        shrinkJobs();   // 族人饿死，岗位同步清退
        if (Math.random() < 0.05) log('灵禾断绝，族人饿殍遍野！');
      }
    }
  }

  // 手动采集灵禾：点一下 +1（原版 catnip 点击），受灵禾上限约束；满仓返回 false
  function gather() {
    var max = getMax('linghe');
    var v = G.res.linghe || 0;
    if (v >= max) return false;
    G.res.linghe = v + 10;
    return true;
  }

  function build(name) {
    var p = getPrice(name);
    if (!canAfford(p)) return;
    for (var k in p) G.res[k] -= p[k];
    G.bld[name] = (G.bld[name] || 0) + 1;
    if (!G.seen[name]) { G.seen[name] = true; log('落成' + BLD_DEF[name].title + '。'); }
    updateCaches();
  }

  function setJob(job, delta) {
    if (!isJobUnlocked(job)) return;
    var cur = G.jobs[job] || 0;
    var next = cur + delta;
    if (next < 0) return;
    var total = 0, k;
    for (k in G.jobs) total += G.jobs[k];
    total = total - cur + next;
    if (total > G.kittens) return;
    G.jobs[job] = next;
    updateCaches();
  }

  // 饿死减员后收缩岗位：确保岗位总数 ≤ 存活族人（从职业列表末尾开始清退，对齐猫国）
  function shrinkJobs() {
    var k, total = 0;
    for (k in G.jobs) total += G.jobs[k];
    if (total <= G.kittens) return;
    var need = total - G.kittens;
    for (var i = JOB_ORDER.length - 1; i >= 0 && need > 0; i--) {
      k = JOB_ORDER[i];
      while (need > 0 && (G.jobs[k] || 0) > 0) { G.jobs[k]--; need--; }
    }
    if (need > 0) {   // 兜底：仍超额时清零剩余岗位
      for (k in G.jobs) {
        if (need <= 0) break;
        if (G.jobs[k] > 0) { G.jobs[k] = 0; need--; }
      }
    }
    updateCaches();
  }

  function research(name) {
    if (G.techs[name] || !techReqsMet(name)) return;
    var t = TECH_DEF[name];
    if (!canAfford(t.prices)) return;
    for (var k in t.prices) G.res[k] -= t.prices[k];
    G.techs[name] = true;
    log('参悟《' + t.title + '》：' + t.desc);
    updateCaches();
  }

  function craft(name) {
    var c = CRAFT_DEF[name];
    if (!isCraftUnlocked(name)) return;
    if (c.need) {
      for (var i = 0; i < c.need.length; i++) { if ((G.bld[c.need[i]] || 0) < 1) return; }
    }
    if (!canAfford(c.prices)) return;
    for (var k in c.prices) G.res[k] -= c.prices[k];
    G.res[name] = (G.res[name] || 0) + (c.yield || 1);
  }

  function getQiyunPreview() { return Math.max(0, Math.floor(G.kittens - 70)); }

  function reincarnate() {
    var gain = getQiyunPreview();
    if (gain <= 0) return;
    backupSave();
    G.qiyun += gain;
    G.tick = 0; G.day = 1; G.season = 0; G.year = 1;
    G.res = {}; G.bld = {}; G.jobs = {}; G.techs = {}; G.seen = {};
    G.kittens = 0; G.kittenProgress = 0; G.starving = false; G.starveProgress = 0;
    G.log = [];
    starterKit();
    log('天地重开，部落复兴。');
    log('你兵解轮回，' + gain + ' 点气运加身。');
    save();
  }

  function serialize() {
    return JSON.stringify({
      v: SAVE_VERSION,
      tick: G.tick, day: G.day, season: G.season, year: G.year,
      res: G.res, bld: G.bld, jobs: G.jobs, techs: G.techs,
      kittens: G.kittens, kittenProgress: G.kittenProgress, qiyun: G.qiyun,
      seen: G.seen, log: G.log.slice(-80)
    });
  }
  function apply(d) {
    G.tick = d.tick || 0; G.day = d.day || 1; G.season = d.season || 0; G.year = d.year || 1;
    G.res = shallow(d.res); G.bld = shallow(d.bld); G.jobs = shallow(d.jobs);
    G.techs = shallow(d.techs); G.seen = shallow(d.seen);
    G.kittens = d.kittens || 0; G.kittenProgress = d.kittenProgress || 0;
    G.qiyun = d.qiyun || 0; G.log = (d.log || []).slice();
  }
  function shallow(o) { var r = {}; if (o) { for (var k in o) r[k] = o[k]; } return r; }
  function save() { try { storageSet(SAVE_KEY, serialize()); } catch (e) { /* ignore */ } }
  function backupSave() { try { storageSet(BACKUP_KEY, serialize()); } catch (e) { /* ignore */ } }
  function load() {
    try {
      var s = storageGet(SAVE_KEY);
      if (s) {
        var d = JSON.parse(s);
        // 版本校验：不匹配（旧档/无版本号）→ 备份旧档、清空主档，重新开荒
        if (!d || d.v !== SAVE_VERSION) {
          try { storageSet(BACKUP_KEY, s); } catch (e) { /* ignore */ }
          try { storageSet(SAVE_KEY, ''); } catch (e) { /* ignore */ }
          return false;
        }
        migrate(d); apply(d); return true;
      }
    } catch (e) { /* 存档损坏则重新开始 */ }
    return false;
  }

  function tick() {
    if (!G.running) return;
    var i;
    for (i = 0; i < G.speed; i++) {
      calendarUpdate();
      updateCaches();
      resourcesUpdate();
      villageUpdate();
    }
    if (G.tick - G.lastSaveTick >= G.autosaveEvery) {
      G.lastSaveTick = G.tick;
      save();
    }
  }

  function init() {
    if (!load()) {
      starterKit();
      log('开天辟地，洪荒初开。你率族人于此地扎根。');
      log('初始：灵田×' + STARTER.lingTian + '、草庐×' + STARTER.caolu + '、族人 ' + STARTER.kittens + ' 名。先垦荒以足粮秣。');
    }
    updateCaches();
  }

  return {
    G: G, init: init, tick: tick, migrate: migrate,
    build: build, setJob: setJob, research: research, craft: craft, gather: gather,
    reincarnate: reincarnate, getQiyunPreview: getQiyunPreview,
    isBldUnlocked: isBldUnlocked, isJobUnlocked: isJobUnlocked,
    isResUnlocked: isResUnlocked, isCraftUnlocked: isCraftUnlocked,
    isTech: isTech, techReqsMet: techReqsMet, updateCaches: updateCaches,
    getPrice: getPrice, calcRates: calcRates, getMax: getMax,
    canAfford: canAfford, log: log,
    save: save, load: load, apply: apply, serialize: serialize,
    backupSave: backupSave, getEffect: getEffect
  };
}

/* ================= 导出 ================= */
var SHCore = {
  createGame: createGame,
  getLimitedDR: getLimitedDR,
  fmt: fmt,
  fmtRate: fmtRate,
  setStorageAdapter: setStorageAdapter,
  DATA: { RES_ORDER: RES_ORDER, RES_DEF: RES_DEF, BLD_ORDER: BLD_ORDER, BLD_DEF: BLD_DEF, JOB_ORDER: JOB_ORDER, JOB_DEF: JOB_DEF, TECH_ORDER: TECH_ORDER, TECH_DEF: TECH_DEF, CRAFT_ORDER: CRAFT_ORDER, CRAFT_DEF: CRAFT_DEF, SEASONS: SEASONS, KITTEN_CONSUME: KITTEN_CONSUME }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHCore;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHCore = SHCore;
}

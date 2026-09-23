'use strict';
/* =====================================================================
 * 抖音版引擎回归测试 test-douyin.js（Node 运行：node test-douyin.js）
 * 验证 core.js 从浏览器 game.js 迁移后无功能回归
 * ===================================================================== */
var SHCore = require('./js/core.js');
var assert = require('assert');

/* 注入内存存储适配（模拟 tt.getStorageSync） */
var mem = {};
SHCore.setStorageAdapter({
  get: function (k) { return k in mem ? mem[k] : null; },
  set: function (k, v) { mem[k] = v; },
  del: function (k) { delete mem[k]; }
});

var pass = 0, fail = 0;
function T(name, fn) {
  try {
    mem = {};   // 每个用例独立开局：清空内存存档，避免跨用例 autosave 污染
    fn();
    pass++;
    console.log('  ✓ ' + name);
  }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

console.log('《山海经·洪荒开荒》抖音版引擎回归测试\n');

T('开局仅 3 项：灵田×0 / 草庐×0 / 族人0 / 灵禾0', function () {
  var A = SHCore.createGame(); A.init();
  assert.strictEqual(A.G.bld.lingTian, 0, '对齐猫国：开局 0 田，手动采集起步');
  assert.strictEqual(A.G.bld.caolu, 0);
  assert.strictEqual(A.G.kittens, 0);
  assert.strictEqual(A.G.res.linghe, 0);
  assert.strictEqual(A.getEffect('maxKittens'), 0, '无草庐无人口上限');
  assert.ok(!A.isBldUnlocked('caolu'), '草庐开局未解锁');
});

T('草庐解锁：精炼出木料后出现', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.isBldUnlocked('caolu'));
  A.G.res.linghe = 100;
  A.craft('wood');
  assert.ok(A.isBldUnlocked('caolu'), '拥有木料后草庐解锁');
});

T('灵禾初始上限 5000（无粮仓）', function () {
  var A = SHCore.createGame(); A.init();
  assert.strictEqual(A.getMax('linghe'), 5000);
});

T('开局即可精炼：100 灵禾 → 10 木料', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(A.isCraftUnlocked('wood'));
  A.G.res.linghe = 100;
  A.craft('wood');
  assert.strictEqual(A.G.res.wood, 10);
  assert.strictEqual(A.G.res.linghe, 0);
});

T('职业经济：2 猫 2 灵农 → 灵禾转正（+1.5/t 春，灵农7/t对齐猫国农夫）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.bld.lingTian = 1;
  A.G.techs.baicaojing = true;
  A.G.kittens = 2; A.G.res.linghe = 500;
  A.setJob('lingnong', 1); A.setJob('lingnong', 1);
  A.updateCaches();
  var r = A.calcRates();
  assert.ok(Math.abs(r.linghe - 1.5) < 1e-9, '春 1田(3/t)2农(7/t)2猫(8.5/t)应 +1.5：' + r.linghe);
  for (var i = 0; i < 500; i++) A.tick();   // 500 tick = 100 天（每天结算一次）
  assert.ok(A.G.res.linghe > 600, '灵禾应稳定增长：' + A.G.res.linghe);
  assert.ok(!A.G.starving);
});

T('手动采集灵禾：点一下 +10，满仓不加', function () {
  var A = SHCore.createGame(); A.init();
  var before = A.G.res.linghe;
  assert.ok(A.gather());
  assert.strictEqual(A.G.res.linghe, before + 10);
  A.G.res.linghe = A.getMax('linghe');
  assert.ok(!A.gather(), '满仓时采集应返回 false');
  assert.strictEqual(A.G.res.linghe, A.getMax('linghe'));
});

T('采药人开局可分配：1 采药人 +0.5 灵禾/t', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(A.isJobUnlocked('caiyaoren'), '采药人开局解锁');
  A.G.kittens = 1; A.G.season = 1;   // 夏季 mod=1
  var base = A.calcRates().linghe;   // 无职业净值 = -8.5
  A.setJob('caiyaoren', 1);
  assert.strictEqual(A.G.jobs.caiyaoren, 1);
  var r = A.calcRates();
  assert.ok(Math.abs((r.linghe - base) - 0.5) < 1e-9, '采药人应 +0.5/t：' + (r.linghe - base));
  A.setJob('caiyaoren', 1);
  assert.strictEqual(A.G.jobs.caiyaoren, 1, '1 人不可派 2 采药人');
});

T('木料仓：木料上限 1000 → 建仓 +1000 = 2000', function () {
  var A = SHCore.createGame(); A.init();
  assert.strictEqual(A.getMax('wood'), 1000, '木料基础上限 1000');
  A.G.res.wood = 100;
  A.build('muliaoCang');
  assert.strictEqual(A.getMax('wood'), 2000);
});

T('樵夫/灵农开局未解锁（需历法/百草经）', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.isJobUnlocked('qiaofu'));
  assert.ok(!A.isJobUnlocked('lingnong'));
  assert.ok(!A.isBldUnlocked('linchang'));
  assert.ok(!A.isBldUnlocked('muliaoCang'), '无木料时木料仓未解锁');
});

T('建造草庐：第1座50木、第2座125木 → 上限 +4（每座 2 人）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 180;
  A.build('caolu');
  A.build('caolu');
  assert.strictEqual(A.G.bld.caolu, 2);
  assert.strictEqual(A.getEffect('maxKittens'), 4);
});

T('价格递增：草庐第 2 座需 125 木（50×2.5）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.bld.caolu = 1;
  assert.strictEqual(A.getPrice('caolu').wood, Math.ceil(50 * Math.pow(2.5, 1)));
});

T('研《历法》需 300 学识（初始 0 不可研）', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.techReqsMet('baicaojing') || !A.canAfford(SHCore.DATA.TECH_DEF.baicaojing.prices));
  A.G.res.xueshi = 300;
  A.research('lifa');
  assert.ok(A.isTech('lifa'));
  assert.ok(A.isJobUnlocked('qiaofu'));
});

T('季节只作用于灵田产灵禾；灵农产出不受季节', function () {
  var A = SHCore.createGame(); A.init();
  A.G.bld.lingTian = 1;
  A.G.techs.baicaojing = true;
  A.G.jobs.lingnong = 1;
  A.updateCaches();
  A.G.season = 0; var spr = A.calcRates().linghe; // 春 ×1.5
  A.G.season = 3; var win = A.calcRates().linghe; // 冬 ×0.25
  // 差值仅来自灵田 1×3×(1.5-0.25)=3.75；灵农 10/t 不乘季节
  assert.ok(Math.abs((spr - win) - 3.75) < 1e-9, '春冬差值应仅来自灵田：' + (spr - win));
  assert.ok(spr > 0 && win > 0, '冬季灵农产出仍为正：' + win);
});

T('饿死按整人数扣减', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 5;
  A.G.res.linghe = 0;
  A.G.starveProgress = 0.95;
  A.G.starving = true;
  for (var i = 0; i < 100; i++) A.tick();
  assert.ok(A.G.kittens <= 5 && Number.isInteger(A.G.kittens), '族人应为整数：' + A.G.kittens);
});

T('饿死时岗位同步清退（超额岗位自动撤销）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 6; A.G.season = 1;
  A.setJob('caiyaoren', 4);
  assert.strictEqual(A.G.jobs.caiyaoren, 4, '6 人可派 4 采药人');
  A.G.res.linghe = 0; A.G.res.wood = 0;
  for (var i = 0; i < 400; i++) A.tick();   // 灵禾 0 + 负收支 → 持续饿死
  var t = 0, k;
  for (k in A.G.jobs) t += A.G.jobs[k];
  assert.ok(t <= A.G.kittens, '岗位须 ≤ 存活族人：岗位=' + t + ' 族人=' + A.G.kittens);
  assert.strictEqual(t, A.G.kittens, '饿死后岗位应收缩到与族人一致：岗位=' + t + ' 族人=' + A.G.kittens);
});

T('建草庐后：上限 2，自动出生到上限（0.01/t 约 20 秒 1 人）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 50;
  A.build('caolu');
  assert.strictEqual(A.getEffect('maxKittens'), 2);
  assert.strictEqual(A.G.kittens, 0);
  for (var i = 0; i < 510; i++) A.tick();   // 510 tick = 102 天：应出生第 1 名（100 天/名，每天结算）
  assert.strictEqual(A.G.kittens, 1, '510 tick 后应出生第 1 名族人');
  A.G.res.linghe = 900;                 // 第 1 名出生后每天消耗 8.5，补足灵禾避免饥饿
  for (var j = 0; j < 500; j++) A.tick();   // 500 tick = 100 天：再出生第 2 名到上限
  assert.strictEqual(A.G.kittens, 2, '1010 tick 后应出生满 2 名');
});

T('饥饿期停止出生累积', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 1;
  A.G.res.linghe = 0;
  A.G.starving = true;
  A.G.kittenProgress = 0.5;
  for (var i = 0; i < 5; i++) A.tick();   // 5 tick = 1 天，触发日结算
  assert.strictEqual(A.G.kittens, 1, '饥饿期不应出生');
  assert.ok(A.G.kittenProgress <= 0.99);
});

T('存档 save/load 往返一致', function () {
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 42;
  A.G.bld.lingTian = 20;
  A.G.techs.lifa = true;
  A.save();
  var B = SHCore.createGame();
  assert.ok(B.load());
  assert.strictEqual(B.G.res.wood, 42);
  assert.strictEqual(B.G.bld.lingTian, 20);
  assert.ok(B.G.techs.lifa);
});

T('轮回守卫：族人 ≤70 时无可得气运', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 50;
  assert.strictEqual(A.getQiyunPreview(), 0);
});

T('轮回：族人 75 → 气运 +5，家业重置但气运保留', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 75;
  A.G.res.wood = 100;
  A.G.techs.lifa = true;
  A.reincarnate();
  assert.strictEqual(A.G.qiyun, 5);
  assert.strictEqual((A.G.res.wood || 0), 0);
  assert.ok(!A.isTech('lifa'));
});

T('边际递减 getLimitedDR（75 线性 + 25 双曲线）', function () {
  assert.strictEqual(SHCore.getLimitedDR(0.4, 0.5), 0.4);
  assert.ok(SHCore.getLimitedDR(1.0, 0.5) < 1.0);
});

T('炼制屋梁需要炼器坊（未建不可炼）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.yingzaojing = true;
  A.G.res.wood = 1750;
  A.craft('wuliang');
  assert.strictEqual((A.G.res.wuliang || 0), 0, '未建炼器坊不可炼屋梁');
  A.G.bld.lianqifang = 1;
  A.craft('wuliang');
  assert.strictEqual((A.G.res.wuliang || 0), 1);
});

T('藏经阁 → 学识上限 +500（50 木，产出 0.2/t = 猫国 library 0.1/s×10）', function () {
  mem = {};                                            // 隔离前面存档测试残留（气运加成会污染绝对产出断言）
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 50;
  assert.ok(A.isBldUnlocked('liangcang'), '拥有木料后粮仓立即解锁（不再卡历法）');
  A.build('cangjingge');
  assert.strictEqual(A.getMax('xueshi'), 1500);
  assert.ok(Math.abs(A.calcRates().xueshi - 0.2) < 1e-9, '1 座藏经阁应 +0.2 学识/t（=1/s，对齐猫国）：' + A.calcRates().xueshi);
});

T('粮仓：有木料即解锁，+1500 灵禾上限', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.isBldUnlocked('liangcang'), '无木料时粮仓隐藏');
  A.G.res.wood = 1;
  assert.ok(A.isBldUnlocked('liangcang'), '拥有木料后粮仓解锁');
  A.G.res.wood = 150;
  A.build('liangcang');
  assert.strictEqual(A.getMax('linghe'), 6500);
});

T('自动存档每 400 tick 落盘', function () {
  var A = SHCore.createGame(); A.init();
  for (var i = 0; i < 400; i++) A.tick();
  var B = SHCore.createGame();
  assert.ok(B.load(), '400 tick 后应已自动存档');
});

T('日期节奏对齐原版：1 秒 = 1 天，100 秒 = 一季', function () {
  mem = {};                                            // 清空共享存储，隔离前面存档测试的档
  var A = SHCore.createGame(); A.init();
  for (var i = 0; i < 60; i++) A.tick();           // 60 tick = 12 秒
  assert.strictEqual(A.G.day, 13, '60 tick 应推进 12 天（含起始第 1 天）');
  for (var j = 0; j < 440; j++) A.tick();          // 共 500 tick = 100 秒
  assert.strictEqual(A.G.day, 1);
  assert.strictEqual(A.G.season, 1, '100 秒后应进入夏季');
  assert.strictEqual(A.G.year, 1);
});

T('巅峰追踪：出生后记录峰值与达成时刻', function () {
  var A = SHCore.createGame(); A.init();
  assert.strictEqual(A.G.peakKittens, 0, '开局巅峰 0');
  A.G.res.wood = 50;
  A.build('caolu');
  A.G.res.linghe = 900;
  for (var i = 0; i < 1015; i++) A.tick();   // 1015 tick = 203 天：第102天出生1名、第202天出生2名
  assert.strictEqual(A.G.peakKittens, 2, '巅峰应随出生更新到 2');
  assert.ok(A.G.peakYear >= 1 && A.G.peakDay >= 1, '记录达成时刻：' + A.G.peakYear + '年·' + A.G.peakSeason + '季·' + A.G.peakDay + '天');
});

T('饿死减员不降低巅峰（轮回后保留历史最高）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 5;
  A.G.res.linghe = 0;
  A.G.starving = true;
  for (var i = 0; i < 400; i++) A.tick();   // 持续饿死
  assert.ok(A.G.kittens < 5, '族人已减少：' + A.G.kittens);
  assert.strictEqual(A.G.peakKittens, 5, '巅峰保持 5，不随饿死下降');
});

T('存档往返包含巅峰字段（旧档兼容补 0）', function () {
  mem = {};
  var A = SHCore.createGame(); A.init();
  A.G.peakKittens = 9; A.G.peakYear = 3; A.G.peakSeason = 2; A.G.peakDay = 40;
  A.save();
  var B = SHCore.createGame();
  assert.ok(B.load());
  assert.strictEqual(B.G.peakKittens, 9);
  assert.strictEqual(B.G.peakYear, 3);
  assert.strictEqual(B.G.peakSeason, 2);
  assert.strictEqual(B.G.peakDay, 40);
});


T('P2 资源链：陨铁/星辉石/瑞兽/河图洛书定义与解锁', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.isResUnlocked('xuntie'), '陨铁初始未解锁');
  assert.ok(!A.isResUnlocked('xinghuishi'));
  assert.ok(!A.isResUnlocked('ruishou'));
  assert.ok(!A.isResUnlocked('hetuluoshu'));
  A.G.techs.xuaniejing = true;
  assert.ok(A.isResUnlocked('xuntie'), '玄铁经后陨铁解锁');
  A.G.techs.xingxiangjing = true;
  assert.ok(A.isResUnlocked('xinghuishi'), '星象经后星辉石解锁');
  A.G.techs.shoujing = true;
  assert.ok(A.isResUnlocked('ruishou'), '兽经后瑞兽解锁');
  A.G.techs.tianji = true;
  assert.ok(A.isResUnlocked('hetuluoshu'), '天机后河图洛书解锁');
});

T('P2 建筑数量达标：32 座 ≥ 25', function () {
  assert.strictEqual(SHCore.DATA.BLD_ORDER.length, 32);
});

T('P2 木屋：需营造经，每座 +4 人口上限', function () {
  var A = SHCore.createGame(); A.init();
  assert.ok(!A.isBldUnlocked('mawu'), '木屋初始未解锁');
  A.G.techs.yingzaojing = true;
  assert.ok(A.isBldUnlocked('mawu'), '营造经后木屋解锁');
  A.G.res.wood = 1000; A.G.res.stone = 500;
  A.build('mawu');
  assert.strictEqual(A.getEffect('maxKittens'), 4, '木屋 +4 人口上限');
});

T('P2 互斥方略：研尚武后不可研崇文', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.shouliejing = true;
  A.G.res.xueshi = 50000;
  A.research('shangwu');
  assert.ok(A.G.techs.shangwu, '尚武已研');
  A.G.techs.wenzi = true;
  A.G.res.xueshi = 50000;
  A.research('chongwen');
  assert.ok(!A.G.techs.chongwen, '互斥：崇文不应研成');
  assert.ok(A.G.techs.shangwu, '尚武保持');
});

T('P2 兽经：解锁兽栏与瑞兽苑，瑞兽苑产瑞兽', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.shoujing = true;
  assert.ok(A.isBldUnlocked('shoulan'));
  assert.ok(A.isBldUnlocked('ruishouyuan'));
  A.G.res.wood = 3000; A.G.res.linghe = 2000;
  A.build('ruishouyuan');
  A.updateCaches();
  var r = A.calcRates();
  assert.ok(Math.abs(r.ruishou - 0.1) < 1e-9, '瑞兽苑 0.1 瑞兽/t：' + r.ruishou);
  for (var i = 0; i < 1010; i++) A.tick();   // 1010 tick = 202 天 × 0.1/天 = 20.2
  assert.ok(A.G.res.ruishou > 20, '累积瑞兽：' + A.G.res.ruishou);
});

T('P2 锻烧窑：需玄铁经，产陨铁', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.xuaniejing = true;
  assert.ok(A.isBldUnlocked('duanshaoyao'));
  A.G.res.wood = 4000; A.G.res.bronze = 1500;
  A.build('duanshaoyao');
  A.updateCaches();
  var r = A.calcRates();
  assert.ok(Math.abs(r.xuntie - 0.5) < 1e-9, '锻烧窑 0.5 陨铁/t：' + r.xuntie);
});

T('P2 引水渠：lingheRatio +0.5 使灵禾产出倍增', function () {
  var A = SHCore.createGame(); A.init();
  A.G.bld.lingTian = 1;   // 3/t 灵禾
  A.G.techs.gongjing = true;
  A.G.res.wood = 400; A.G.res.stone = 1200;
  A.build('yinshuiqu');
  A.updateCaches();
  var r = A.calcRates();
  assert.ok(Math.abs(r.linghe - 7.425) < 1e-9, '引水渠后 3×1.5×1.1×1.5=7.425/t（含春/工经）：' + r.linghe);
});

T('P2 事件系统：大旱事件降低灵禾产出', function () {
  var A = SHCore.createGame(); A.init();
  A.G.bld.lingTian = 1;   // 3/t
  A.G.event = { id: 'dahan', remain: 30 };
  A.updateCaches();
  var r = A.calcRates();
  assert.ok(Math.abs(r.linghe - 2.25) < 1e-9, '大旱后 3×1.5×0.5=2.25/t（含春）：' + r.linghe);
  A.G.event = null;
  A.updateCaches();
  r = A.calcRates();
  assert.ok(Math.abs(r.linghe - 4.5) < 1e-9, '事件结束恢复 3×1.5=4.5/t（含春）：' + r.linghe);
});

T('P2 成就系统：建灵田触发《开荒者》', function () {
  var A = SHCore.createGame(); A.init();
  A.G.res.linghe = 100;
  A.build('lingTian');
  for (var i = 0; i < 55; i++) A.tick();   // 每 10 天检查一次成就（50 tick 触发）
  assert.ok(A.G.ach.kaihuang, '开荒者应已触发');
});

T('P2 猎户产出计数：stat.huntProduced 累积', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.shouliejing = true;
  A.G.kittens = 2;
  A.G.res.linghe = 500;
  A.setJob('liehu', 1);
  A.updateCaches();
  for (var i = 0; i < 5; i++) A.tick();
  assert.ok(A.G.stat.huntProduced >= 3, '猎户 3/t 累积≥3：' + A.G.stat.huntProduced);
});

T('P2 存档 v5：stat/ach/event 往返一致', function () {
  mem = {};
  var A = SHCore.createGame(); A.init();
  A.G.stat.lingheGathered = 100;
  A.G.ach.kaihuang = true;
  A.G.event = { id: 'tianxiang', remain: 5 };
  A.save();
  var B = SHCore.createGame();
  assert.ok(B.load());
  assert.strictEqual(B.G.stat.lingheGathered, 100);
  assert.ok(B.G.ach.kaihuang);
  assert.strictEqual(B.G.event.id, 'tianxiang');
  assert.strictEqual(B.G.event.remain, 5);
});


T('BUG修复：未研《历法》前事件不触发、无事件赠礼（含兽潮500木）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.lifa = false;
  for (var i = 0; i < 300; i++) A.tick();
  assert.strictEqual(A.G.event, null, '无历法不应有事件');
  assert.strictEqual(A.G.res.wood, 0, '无历法不应获得兽潮赠木');
  assert.strictEqual(A.G.res.linghe, 0, '无历法不应获得丰收赠粮');
});

T('BUG修复：研《历法》后事件系统开启', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.lifa = true;
  A.G.res.linghe = 5000; A.G.res.wood = 1000;   // 满仓以验证赠礼 clamp
  var evSeen = false;
  for (var i = 0; i < 3000; i++) {   // 300 天，事件概率 0.008~0.012，必触发多次
    A.tick();
    if (A.G.event) evSeen = true;
  }
  assert.ok(evSeen, '研历法后 300 天内应触发事件');
  assert.ok(A.G.res.linghe <= 5000, '丰收赠礼不突破灵禾上限');
  assert.ok(A.G.res.wood <= 1000, '兽潮赠木不突破木料上限');
});

T('BUG修复：加速时事件倒计时与日期同步（speed=5 时不快于天数）', function () {
  var A = SHCore.createGame(); A.init();
  A.G.techs.lifa = true;
  A.G.speed = 5;
  A.G.event = { id: 'tianxiang', remain: 30 };
  for (var i = 0; i < 10; i++) A.tick();   // 10 次 tick × speed5 = 50 tick = 10 天
  assert.strictEqual(A.G.day, 11, 'day 从 1 起算，过 10 天应为第 11 天');
  assert.strictEqual(A.G.event.remain, 20, '事件剩余应同步减 10：30-10=20（实际 ' + A.G.event.remain + '）');
});


T('重开存档：resetAll 删除存档并重建全新状态', function () {
  mem = {};
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 500; A.G.bld.caolu = 3; A.G.kittens = 5;
  A.G.techs.lifa = true; A.G.qiyun = 3;
  A.G.stat.lingheGathered = 999; A.G.ach.kaihuang = true;
  A.save();
  assert.ok(mem['shanhajing_save_v1'], '存档已写入');
  A.resetAll();
  assert.ok(!mem['shanhajing_save_v1'], '重开后主存档已删除');
  assert.strictEqual(A.G.res.wood, undefined, '资源清空');
  assert.strictEqual(A.G.bld.caolu, 0, '建筑清空');
  assert.strictEqual(A.G.kittens, 0, '族人归零');
  assert.strictEqual(A.G.techs.lifa, undefined, '典籍清空');
  assert.strictEqual(A.G.qiyun, 0, '气运清空');
  assert.strictEqual(A.G.stat.lingheGathered, undefined, '统计清空');
  assert.strictEqual(A.G.ach.kaihuang, undefined, '成就清空');
  assert.ok(!A.load(), '重开后 load 失败（需重新开荒）');
});


T('多档位：saveToSlot/loadSlot 往返与解锁门槛', function () {
  mem = {};
  var A = SHCore.createGame(); A.init();
  A.G.res.wood = 300; A.G.bld.caolu = 2; A.G.kittens = 4;
  A.save();
  var slots = A.getSlots();
  assert.ok(slots[1].has && slots[1].kittens === 4, '档位1有档（自动存档）');
  assert.ok(A.isSlotUnlocked(1), '档位1免费可用');
  assert.ok(!A.isSlotUnlocked(2), '档位2默认未解锁');
  assert.ok(A.saveToSlot(2) === false, '未解锁不可写档位2');
  A.unlockSlot(2);
  assert.ok(A.isSlotUnlocked(2), '解锁后档位2可用');
  assert.ok(A.saveToSlot(2) === true, '可写档位2');
  slots = A.getSlots();
  assert.ok(slots[2].has && slots[2].kittens === 4, '档位2有档');
  // 修改当前档后读回档位2
  A.G.res.wood = 999; A.G.kittens = 9;
  assert.ok(A.loadSlot(2), '读档档位2');
  assert.strictEqual(A.G.kittens, 4, '读档后族人恢复4');
  assert.strictEqual(A.G.res.wood, 300, '读档后木料恢复300');
});

T('多档位：旧版存档迁入档位1且从0开局', function () {
  mem = {};
  mem['shanhajing_save_v1'] = JSON.stringify({ v: 5, tick: 10, day: 30, season: 2, year: 7, res: { linghe: 1234, wood: 56 }, bld: { caolu: 3 }, kittens: 6, kittenProgress: 0, qiyun: 2, seen: {}, log: [], stat: {}, ach: {}, event: null, peakKittens: 6, peakDay: 30, peakSeason: 2, peakYear: 7 });
  var A = SHCore.createGame(); A.init();
  assert.strictEqual(A.G.kittens, 0, 'v5旧档 → 从0开局');
  var slots = A.getSlots();
  assert.ok(slots[1].has && slots[1].kittens === 6, '旧档迁入档位1');
  assert.ok(mem['shanhajing_save_backup'], '旧档已备份');
});

T('重开存档：resetAll 清空全部槽位（保留解锁权益）', function () {
  mem = {};
  var A = SHCore.createGame(); A.init();
  A.unlockSlot(3); A.G.kittens = 5; A.save(); A.saveToSlot(3);
  A.resetAll();
  var slots = A.getSlots();
  assert.ok(!slots[1].has && !slots[3].has, '重置后全部槽位清空');
  assert.ok(A.isSlotUnlocked(3), '解锁状态保留（广告权益不回收）');
});

/* ---------- KV 云存档异步测试（免费云存档方案） ---------- */
var cloudMem = {};
SHCore.setCloudAdapter({
  write: function (items, cb) { for (var i = 0; i < items.length; i++) cloudMem[items[i].key] = items[i].value; cb(null); },
  read: function (keys, cb) { var o = {}; for (var i = 0; i < keys.length; i++) { if (cloudMem[keys[i]] !== undefined) o[keys[i]] = cloudMem[keys[i]]; } cb(null, o); },
  remove: function (keys, cb) { for (var i = 0; i < keys.length; i++) delete cloudMem[keys[i]]; cb(null); }
});
var cloudPass = 0, cloudFail = 0;
var cloudQueue = [];
function CT(name, fn) {
  var done = function (e) {
    if (e) { cloudFail++; console.log('  ✗ ' + name + ' — ' + (e && e.message || e)); }
    else { cloudPass++; console.log('  ✓ ' + name); }
    cloudNext();
  };
  try { fn(done); } catch (e) { done(e); }
}
function cloudNext() {
  var t = cloudQueue.shift();
  if (t) CT(t[0], t[1]);
  else {
    console.log('\n结果：' + pass + ' 项通过，' + fail + ' 项失败；云存档 ' + cloudPass + ' 项通过，' + cloudFail + ' 项失败');
    process.exit(fail + cloudFail > 0 ? 1 : 0);
  }
}
cloudQueue.push([
  '云存档：上传/下载往返一致（长中文档分片重组）',
  function (done) {
    cloudMem = {}; mem = {};
    var A = SHCore.createGame(); A.init();
    for (var i = 0; i < 200; i++) A.G.log.push({ t: i, year: 1, text: '开天辟地洪荒初开，灵禾满仓万物生息第' + i + '日' });
    A.G.res.linghe = 123456; A.G.bld.caolu = 12; A.G.kittens = 34;
    A.G.techs.lifa = true; A.G.qiyun = 5; A.save();
    A.unlockSlot(4); A.G.kittens = 99; A.saveToSlot(4);
    A.cloudUpload(function (err) {
      if (err) return done(err);
      if (!cloudMem['m']) return done(new Error('meta 未写入'));
      var meta = JSON.parse(cloudMem['m']);
      if (!meta.parts.main || meta.parts.main < 1) return done(new Error('主档分片缺失'));
      if (!meta.parts['4'] || meta.parts['4'] < 1) return done(new Error('档位4分片缺失'));
      mem = {};   // 模拟新设备：本地存储清空
      var B = SHCore.createGame(); B.init();
      if (B.load()) return done(new Error('新设备不应有本地档'));
      B.cloudDownload(function (err2) {
        if (err2) return done(err2);
        if (!mem['shanhajing_save_v1']) return done(new Error('主档未写回'));
        var B2 = SHCore.createGame();
        if (!B2.load()) return done(new Error('云端主档无法加载'));
        if (B2.G.res.linghe !== 123456) return done(new Error('灵禾不一致：' + B2.G.res.linghe));
        if (B2.G.bld.caolu !== 12) return done(new Error('草庐不一致'));
        if (B2.G.kittens !== 34) return done(new Error('族人不一致（主档）：' + B2.G.kittens));
        if (!B2.isSlotUnlocked(4)) return done(new Error('云端解锁权益未恢复'));
        var slots = B2.getSlots();
        if (!slots[4].has || slots[4].kittens !== 99) return done(new Error('档位4 未恢复'));
        done(null);
      });
    });
  }
]);
cloudQueue.push([
  '云存档：cloudHasData / cloudGetInfo / cloudClear 全流程',
  function (done) {
    cloudMem = {};
    var A = SHCore.createGame(); A.init();
    A.G.res.linghe = 88; A.save();
    A.cloudHasData(function (has) {
      if (has) return done(new Error('初始云端不应有数据'));
      A.cloudUpload(function (e1) {
        if (e1) return done(e1);
        A.cloudHasData(function (has2) {
          if (!has2) return done(new Error('上传后应有数据'));
          A.cloudGetInfo(function (e2, meta) {
            if (e2) return done(e2);
            if (!meta || !meta.t || meta.t <= 0) return done(new Error('meta 时间缺失'));
            if (!meta.unlock) return done(new Error('meta.unlock 缺失'));
            A.cloudClear(function (e3) {
              if (e3) return done(e3);
              A.cloudHasData(function (has3) {
                if (has3) return done(new Error('清除后不应有数据'));
                done(null);
              });
            });
          });
        });
      });
    });
  }
]);
cloudNext();

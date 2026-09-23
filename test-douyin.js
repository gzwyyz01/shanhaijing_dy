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
  set: function (k, v) { mem[k] = v; }
});

var pass = 0, fail = 0;
function T(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
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
  for (var i = 0; i < 100; i++) A.tick();
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
  for (var i = 0; i < 150; i++) A.tick();   // 150 tick ≈ 30 秒：应出生第 1 名（100 tick/名）
  assert.strictEqual(A.G.kittens, 1, '150 tick 后应出生第 1 名族人');
  A.G.res.linghe = 900;                 // 第 1 名出生后消耗 8.5/t，补足灵禾避免饥饿
  for (var j = 0; j < 110; j++) A.tick();   // 110 tick 后再出生第 2 名到上限
  assert.strictEqual(A.G.kittens, 2, '260 tick 后应出生满 2 名');
});

T('饥饿期停止出生累积', function () {
  var A = SHCore.createGame(); A.init();
  A.G.kittens = 1;
  A.G.res.linghe = 0;
  A.G.starving = true;
  A.G.kittenProgress = 0.5;
  A.tick();
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
  for (var i = 0; i < 260; i++) A.tick();   // 出生 2 名到上限
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

console.log('\n结果：' + pass + ' 项通过，' + fail + ' 项失败');
process.exit(fail > 0 ? 1 : 0);

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

var RES_ORDER = ['linghe', 'wood', 'stone', 'bronze', 'xueshi', 'wuliang', 'shiban', 'tongban', 'xuantie',
  'xuntie', 'xinghuishi', 'ruishou', 'hetuluoshu'];
var RES_DEF = {
  linghe:  { title: '灵禾', desc: '族人口粮，维系生息' },
  wood:    { title: '木料', desc: '营造之材' },
  stone:   { title: '石料', desc: '凿山所得' },
  bronze:  { title: '青铜', desc: '熔炼而生', unlock: 'jinjing' },
  xueshi:  { title: '学识', desc: '典籍之学' },
  wuliang: { title: '屋梁', desc: '营造之材', craft: true },
  shiban:  { title: '石板', desc: '营造之材', craft: true },
  tongban: { title: '铜板', desc: '铸器之材', craft: true },
  xuantie: { title: '玄铁', desc: '百炼神铁', craft: true },
  xuntie:     { title: '陨铁', desc: '天外陨铁，百炼成兵', unlock: 'xuaniejing' },
  xinghuishi: { title: '星辉石', desc: '夜观天象，星辉为石', unlock: 'xingxiangjing' },
  ruishou:    { title: '瑞兽', desc: '祥瑞之兽，通灵之物', unlock: 'shoujing' },
  hetuluoshu: { title: '河图洛书', desc: '河出图，洛出书，圣人则之', unlock: 'tianji' }
};

var BLD_ORDER = ['lingTian', 'caolu', 'muliaoCang', 'linchang', 'cangjingge', 'liangcang', 'kuangdong', 'lianqifang', 'yelianlu',
  'shichang', 'mawu', 'shoulan', 'yinshuiqu', 'shuyuan', 'baicaoyuan', 'kufang', 'shiji', 'zhubisi', 'yuefang',
  'citang', 'shenmiao', 'ruishouyuan', 'niangfang', 'guanxingtai', 'duanshaoyao', 'lingquanyan', 'jiguangfang',
  'julingzhen', 'gongfang', 'dukou', 'huazhai', 'tianjige'];
var BLD_DEF = {
  lingTian:  { title: '灵田', desc: '开垦沃土，灵禾自生', unlock: 'start', ratio: 1.12, prices: { linghe: 100 }, fx: { linghe: 3 } },
  caolu:     { title: '草庐', desc: '遮风避雨，族人安居（1 座 = 2 人口上限）', unlock: 'wood', ratio: 2.5,  prices: { wood: 50 }, fx: { maxKittens: 2 } },
  muliaoCang:{ title: '木料仓', desc: '贮存木料，以应营造（木料上限 +1000）', unlock: 'wood', ratio: 1.5, prices: { wood: 100 }, fx: { woodMax: 1000 } },
  linchang:  { title: '林场', desc: '入山采伐，林木不绝', unlock: 'lifa', ratio: 1.15, prices: { linghe: 400, wood: 300 }, fx: { wood: 0.5 } },
  cangjingge:{ title: '藏经阁', desc: '藏书之所，学识之源', unlock: 'wood', ratio: 1.15, prices: { wood: 50 }, fx: { xueshi: 0.2, xueshiMax: 500 } },
  liangcang: { title: '粮仓', desc: '储粮备荒，以度严冬（灵禾上限 +1500）', unlock: 'wood', ratio: 1.75, prices: { wood: 150 }, fx: { lingheMax: 1500 } },
  kuangdong: { title: '矿洞', desc: '凿山取石，深掘矿脉', unlock: 'shanjing', ratio: 1.15, prices: { wood: 600, stone: 400 }, fx: { stone: 0.5 } },
  lianqifang:{ title: '炼器坊', desc: '熔炼万物之所', unlock: 'shanjing', ratio: 1.15, prices: { wood: 800, stone: 500 }, fx: {} },
  yelianlu:  { title: '冶炼炉', desc: '烈火熔金，青铜乃成', unlock: 'jinjing', ratio: 1.15, prices: { wood: 1500, stone: 800, bronze: 300 }, fx: { bronze: 0.5 } },
  shichang:  { title: '石场', desc: '凿石成场，石料不绝', unlock: 'shanjing', ratio: 1.15, prices: { wood: 1000, stone: 300 }, fx: { stone: 1 } },
  mawu:      { title: '木屋', desc: '木石为屋，族人安居（1 座 = 4 人口上限）', unlock: 'yingzaojing', ratio: 2.2, prices: { wood: 1000, stone: 500 }, fx: { maxKittens: 4 } },
  shoulan:   { title: '兽栏', desc: '圈养百兽，肉食为继', unlock: 'shoujing', ratio: 1.15, prices: { wood: 600, linghe: 300 }, fx: { linghe: 4 } },
  yinshuiqu: { title: '引水渠', desc: '引水灌田，灵禾倍产', unlock: 'gongjing', ratio: 1.25, prices: { wood: 400, stone: 1200 }, fx: { lingheRatio: 0.5 } },
  shuyuan:   { title: '书院', desc: '讲学论道，学识日增', unlock: 'suanjing', ratio: 1.15, prices: { wood: 1500, xueshi: 200 }, fx: { xueshi: 0.6, xueshiMax: 800 } },
  baicaoyuan:{ title: '百草园', desc: '遍植百草，药食两用', unlock: 'wenzi', ratio: 1.15, prices: { wood: 1200, linghe: 2500 }, fx: { linghe: 2 } },
  kufang:    { title: '库房', desc: '广积粮秣（木料上限 +5000）', unlock: 'yingzaojing', ratio: 1.5, prices: { wood: 2500 }, fx: { woodMax: 5000 } },
  shiji:     { title: '市集', desc: '互通有无，八方来朝（开启方国贸易）', unlock: 'liyue', ratio: 1.15, prices: { wood: 3500, stone: 1500 }, fx: { tradeSlots: 1 } },
  zhubisi:   { title: '铸币司', desc: '鼓铸青铜，以资国用', unlock: 'jinjing', ratio: 1.15, prices: { wood: 2500, bronze: 500 }, fx: { bronze: 1.5 } },
  yuefang:   { title: '乐坊', desc: '礼乐之坊，教化万民', unlock: 'liyue', ratio: 1.15, prices: { wood: 3000, xueshi: 500 }, fx: { xueshi: 0.5 } },
  citang:    { title: '祠堂', desc: '祀奉先祖，香火绵延', unlock: 'lidian', ratio: 1.15, prices: { stone: 5000, bronze: 1000 }, fx: { xueshi: 1 } },
  shenmiao:  { title: '神庙', desc: '敬奉神明，庇佑苍生', unlock: 'lidian', ratio: 1.15, prices: { stone: 8000, bronze: 2000 }, fx: { xueshi: 2, prodRatio: 0.02 } },
  ruishouyuan:{ title: '瑞兽苑', desc: '驯养瑞兽，祥瑞降世', unlock: 'shoujing', ratio: 1.15, prices: { wood: 3000, linghe: 2000 }, fx: { ruishou: 0.1 } },
  niangfang: { title: '酿坊', desc: '酿制灵酿，激励万民', unlock: 'gongjing', ratio: 1.15, prices: { wood: 4000, linghe: 1500 }, fx: { prodRatio: 0.03 } },
  guanxingtai:{ title: '观星台', desc: '夜观天象，星辉为石', unlock: 'xingxiangjing', ratio: 1.15, prices: { stone: 3000, bronze: 1200 }, fx: { xueshi: 2, xinghuishi: 0.1 } },
  duanshaoyao:{ title: '锻烧窑', desc: '烈火锻烧，陨铁乃成', unlock: 'xuaniejing', ratio: 1.15, prices: { wood: 4000, bronze: 1500 }, fx: { xuntie: 0.5 } },
  lingquanyan:{ title: '灵泉眼', desc: '灵泉涌出，青铜自生', unlock: 'lianqi', ratio: 1.15, prices: { stone: 5000, xuantie: 200 }, fx: { bronze: 1.5 } },
  jiguangfang:{ title: '机关坊', desc: '机关巧思，玄铁成器', unlock: 'jiguanshu', ratio: 1.15, prices: { wood: 6000, xuantie: 500 }, fx: { xuantie: 1 } },
  julingzhen: { title: '聚灵阵', desc: '聚星辉于阵，灵石自生', unlock: 'zhenfa', ratio: 1.15, prices: { bronze: 3000, xinghuishi: 100 }, fx: { xinghuishi: 1 } },
  gongfang:   { title: '工坊', desc: '百工齐备，万业俱兴', unlock: 'gongjing', ratio: 1.15, prices: { wood: 5000, stone: 3000 }, fx: { prodRatio: 0.05 } },
  dukou:      { title: '渡口', desc: '舟楫往来，货殖通流', unlock: 'hanghaijing', ratio: 1.5, prices: { wood: 8000, stone: 3000 }, fx: { lingheMax: 3000, woodMax: 5000 } },
  huazhai:    { title: '华宅', desc: '雕梁画栋，望族气象（1 座 = 8 人口上限）', unlock: 'lidian', ratio: 2.2, prices: { stone: 2500, bronze: 800 }, fx: { maxKittens: 8 } },
  tianjige:   { title: '天机阁', desc: '窥天机，得河图洛书', unlock: 'xuanmen', ratio: 1.15, prices: { stone: 20000, xinghuishi: 500, ruishou: 10 }, fx: { hetuluoshu: 0.1, xueshiMax: 5000 } }
};

var JOB_ORDER = ['caiyaoren', 'lingnong', 'qiaofu', 'zaoshijiang', 'liehu', 'tanmaishi', 'bushi', 'qishi', 'jisi'];
var JOB_DEF = {
  caiyaoren:  { title: '采药人', desc: '采撷灵药，聊补粮秣（开局即可分配）', unlock: 'start', fx: { linghe: 0.5 } },
  lingnong:   { title: '灵农', desc: '耕种灵禾（≈2.3 块灵田，对齐猫国农夫）', unlock: 'baicaojing', fx: { linghe: 7 } },
  qiaofu:     { title: '樵夫', desc: '入山伐木（需先精炼起家）', unlock: 'lifa', fx: { wood: 0.18 } },
  zaoshijiang:{ title: '凿石匠', desc: '凿石开山', unlock: 'shanjing', fx: { stone: 0.5 } },
  liehu:      { title: '猎户', desc: '入山狩猎，猎获充饥', unlock: 'shouliejing', fx: { linghe: 3 } },
  tanmaishi:  { title: '探脉师', desc: '循脉探矿，得山中之宝', unlock: 'shanjing', fx: { stone: 1.2 } },
  bushi:      { title: '卜者', desc: '观星占卜，明晓天机', unlock: 'xingxiangjing', fx: { xueshi: 1 } },
  qishi:      { title: '器师', desc: '铸器锻兵，巧夺天工', unlock: 'zhuqijing', fx: { xuantie: 0.3 } },
  jisi:       { title: '祭司', desc: '敬神布道，通神达意', unlock: 'lidian', fx: { xueshi: 2 } }
};

var TECH_ORDER = ['lifa', 'baicaojing', 'shouliejing', 'shanjing', 'jinjing', 'suanjing', 'yingzaojing', 'zhuqijing',
  'shoujing', 'gongjing', 'wenzi', 'liyue', 'lidian', 'jiguanshu', 'xuaniejing', 'xingxiangjing', 'lianqi', 'zhenfa',
  'hanghaijing', 'tiangong', 'yuling', 'danding', 'xuanmen', 'tianji',
  'shangwu', 'chongwen', 'shuntian', 'kaishan', 'qiuzhang', 'zhanglao', 'busuan', 'baijia'];
var TECH_DEF = {
  lifa:        { title: '历法', desc: '观天象，知四时', prices: { xueshi: 300 }, req: null },
  baicaojing:  { title: '百草经', desc: '辨百草，兴稼穑', prices: { xueshi: 1000 }, req: 'lifa' },
  shouliejing: { title: '狩猎经', desc: '入山林，猎百兽', prices: { xueshi: 3000 }, req: 'baicaojing', fx: { woodRatio: 0.5 } },
  shanjing:    { title: '山经', desc: '识山岳，知其矿脉', prices: { xueshi: 5000 }, req: 'baicaojing' },
  jinjing:     { title: '金经', desc: '五金之术，熔炼成器', prices: { xueshi: 9000 }, req: 'shanjing' },
  suanjing:    { title: '算经', desc: '精于术数，博闻强识', prices: { xueshi: 10000 }, req: 'lifa', fx: { xueshiRatio: 0.5 } },
  yingzaojing: { title: '营造经', desc: '营室造屋之法', prices: { xueshi: 13000 }, req: 'suanjing' },
  zhuqijing:   { title: '铸器经', desc: '铸铜炼铁，神器初成', prices: { xueshi: 22000 }, req: ['jinjing', 'yingzaojing'] },
  shoujing:    { title: '兽经', desc: '识百兽之性', prices: { xueshi: 15000 }, req: 'shanjing' },
  gongjing:    { title: '工经', desc: '百工之术', prices: { xueshi: 18000 }, req: 'yingzaojing', fx: { prodRatio: 0.1 } },
  wenzi:       { title: '文字经', desc: '结绳记事，始有文字', prices: { xueshi: 24000 }, req: 'suanjing', fx: { xueshiRatio: 0.25 } },
  liyue:       { title: '礼乐经', desc: '礼乐教化', prices: { xueshi: 30000 }, req: 'wenzi', fx: { prodRatio: 0.1 } },
  lidian:      { title: '礼典', desc: '制礼作乐，以安邦国', prices: { xueshi: 40000 }, req: 'liyue', fx: { xueshiRatio: 0.5 } },
  jiguanshu:   { title: '机关术', desc: '机关巧思', prices: { xueshi: 60000 }, req: 'zhuqijing', fx: { prodRatio: 0.15 } },
  xuaniejing:  { title: '玄铁经', desc: '玄铁之秘', prices: { xueshi: 45000 }, req: 'zhuqijing' },
  xingxiangjing:{ title: '星象经', desc: '观星象以知兴替', prices: { xueshi: 80000 }, req: 'lidian' },
  lianqi:      { title: '炼气经', desc: '炼气化神', prices: { xueshi: 120000 }, req: 'xingxiangjing' },
  zhenfa:      { title: '阵法', desc: '布阵聚灵', prices: { xueshi: 160000 }, req: 'lianqi' },
  hanghaijing: { title: '航海经', desc: '乘桴浮海', prices: { xueshi: 220000 }, req: 'zhenfa' },
  tiangong:    { title: '天工', desc: '巧夺天工', prices: { xueshi: 300000 }, req: 'hanghaijing', fx: { prodRatio: 0.25 } },
  yuling:      { title: '御灵经', desc: '御灵之术', prices: { xueshi: 400000 }, req: 'tiangong' },
  danding:     { title: '丹鼎', desc: '丹鼎之术', prices: { xueshi: 600000 }, req: 'yuling' },
  xuanmen:     { title: '玄门', desc: '玄之又玄', prices: { xueshi: 800000 }, req: 'danding' },
  tianji:      { title: '天机', desc: '天机不可泄', prices: { xueshi: 1000000 }, req: 'xuanmen' },
  shangwu:     { title: '尚武', desc: '崇尚武功（与崇文互斥）', prices: { xueshi: 50000 }, req: 'shouliejing', mutex: 'chongwen', fx: { prodRatio: 0.2 } },
  chongwen:    { title: '崇文', desc: '崇尚文治（与尚武互斥）', prices: { xueshi: 50000 }, req: 'wenzi', mutex: 'shangwu', fx: { xueshiRatio: 1 } },
  shuntian:    { title: '顺天', desc: '顺天应时（与开山互斥）', prices: { xueshi: 70000 }, req: 'lifa', mutex: 'kaishan', fx: { lingheRatio: 0.5 } },
  kaishan:     { title: '开山', desc: '开山凿石（与顺天互斥）', prices: { xueshi: 70000 }, req: 'shanjing', mutex: 'shuntian', fx: { stoneRatio: 0.5, bronzeRatio: 0.5 } },
  qiuzhang:    { title: '酋长制', desc: '族权归一（与长老会互斥）', prices: { xueshi: 90000 }, req: 'lifa', mutex: 'zhanglao', fx: { prodRatio: 0.1 } },
  zhanglao:    { title: '长老会', desc: '众议共治（与酋长制互斥）', prices: { xueshi: 90000 }, req: 'wenzi', mutex: 'qiuzhang', fx: { xueshiRatio: 0.5 } },
  busuan:      { title: '卜算治国', desc: '以卜治国（与百家争鸣互斥）', prices: { xueshi: 150000 }, req: 'xingxiangjing', mutex: 'baijia', fx: { xueshi: 0.5 } },
  baijia:      { title: '百家争鸣', desc: '百花齐放（与卜算治国互斥）', prices: { xueshi: 150000 }, req: 'wenzi', mutex: 'busuan', fx: { xueshiRatio: 1 } }
};

var CRAFT_ORDER = ['wood', 'wuliang', 'shiban', 'tongban', 'xuantie'];
var CRAFT_DEF = {
  wood:    { title: '木料', desc: '精炼灵禾为木（100 灵禾 → 10 木料）', unlock: 'start', need: null, prices: { linghe: 100 }, yield: 10 },
  wuliang: { title: '屋梁', desc: '大木成梁', unlock: 'yingzaojing', need: ['lianqifang'], prices: { wood: 1750 } },
  shiban:  { title: '石板', desc: '凿石成板', unlock: 'yingzaojing', need: ['lianqifang'], prices: { stone: 2500 } },
  tongban: { title: '铜板', desc: '青铜锻板', unlock: 'zhuqijing', need: ['lianqifang'], prices: { bronze: 1250 } },
  xuantie: { title: '玄铁', desc: '百炼成玄铁', unlock: 'zhuqijing', need: ['yelianlu'], prices: { bronze: 1000 } }
};

/* ================= 1.5 事件系统 ================= */
var EVENT_ORDER = ['dahan', 'tianxiang', 'fengshou', 'shouchao', 'shanben', 'xingyu'];
var EVENT_DEF = {
  dahan:     { title: '大旱', text: '赤地千里，灵禾减产五成（30 天）', season: 1, prob: 0.012, dur: 30, fx: { lingheRatio: -0.5 } },
  tianxiang: { title: '天象异动', text: '紫气东来，灵禾增产五成（30 天）', prob: 0.008, dur: 30, fx: { lingheRatio: 0.5 } },
  fengshou:  { title: '丰收祭', text: '五谷丰登，灵禾 +1000', prob: 0.01, dur: 0, gain: { linghe: 1000 } },
  shouchao:  { title: '兽潮', text: '万兽奔涌，木料 +500', prob: 0.008, dur: 0, gain: { wood: 500 } },
  shanben:   { title: '山崩', text: '巨石滚落，石料 +800', prob: 0.008, dur: 0, gain: { stone: 800 } },
  xingyu:    { title: '星雨', text: '陨星坠落，陨铁 +20', prob: 0.004, dur: 0, gain: { xuntie: 20 } }
};

/* ================= 1.6 成就系统 ================= */
var ACH_ORDER = ['kaihuang', 'shennong', 'cangjie', 'suiren', 'yujia', 'yugong', 'jingwei', 'kuafu', 'zhinv', 'dayu',
  'houyi', 'pangu', 'nuwa', 'fuxi', 'hetu', 'suiyue', 'qiyun', 'baisheng', 'qianfeng', 'wangguo'];
var ACH_DEF = {
  kaihuang: { title: '开荒者', desc: '建造 1 座灵田', cond: function (g) { return (g.bld.lingTian || 0) >= 1; } },
  shennong: { title: '神农尝草', desc: '研习 5 项典籍', cond: function (g) { var n = 0, k; for (k in g.techs) if (g.techs[k]) n++; return n >= 5; } },
  cangjie:  { title: '仓颉造字', desc: '学识达到 1000', cond: function (g) { return (g.res.xueshi || 0) >= 1000; } },
  suiren:   { title: '燧人取火', desc: '建造冶炼炉', cond: function (g) { return (g.bld.yelianlu || 0) >= 1; } },
  yujia:    { title: '安得广厦', desc: '建造 10 座草庐', cond: function (g) { return (g.bld.caolu || 0) >= 10; } },
  yugong:   { title: '愚公移山', desc: '建造 20 座矿洞', cond: function (g) { return (g.bld.kuangdong || 0) >= 20; } },
  jingwei:  { title: '精卫填海', desc: '累计采集 10000 灵禾', cond: function (g) { return (g.stat.lingheGathered || 0) >= 10000; } },
  kuafu:    { title: '夸父逐日', desc: '累计点击采集 1000 次', cond: function (g) { return (g.stat.gatherClicks || 0) >= 1000; } },
  zhinv:    { title: '嫘祖养蚕', desc: '族人达到 50', cond: function (g) { return (g.kittens || 0) >= 50; } },
  dayu:     { title: '大禹治水', desc: '建造 10 座引水渠', cond: function (g) { return (g.bld.yinshuiqu || 0) >= 10; } },
  houyi:    { title: '后羿射日', desc: '猎户累计产出 100 灵禾', cond: function (g) { return (g.stat.huntProduced || 0) >= 100; } },
  pangu:    { title: '盘古开天', desc: '首次轮回', cond: function (g) { return (g.qiyun || 0) >= 1; } },
  nuwa:     { title: '女娲补天', desc: '获得 100 星辉石', cond: function (g) { return (g.res.xinghuishi || 0) >= 100; } },
  fuxi:     { title: '伏羲画卦', desc: '研习《算经》', cond: function (g) { return !!g.techs.suanjing; } },
  hetu:     { title: '河图洛书', desc: '获得 1 河图洛书', cond: function (g) { return (g.res.hetuluoshu || 0) >= 1; } },
  suiyue:   { title: '岁月如歌', desc: '存活满 1000 天', cond: function (g) { return (g.tick / DAY_TICKS) >= 1000; } },
  qiyun:    { title: '气运加身', desc: '拥有 5 点气运', cond: function (g) { return (g.qiyun || 0) >= 5; } },
  baisheng: { title: '百胜之师', desc: '族人达到 100', cond: function (g) { return (g.kittens || 0) >= 100; } },
  qianfeng: { title: '千峰竞秀', desc: '石料达到 10000', cond: function (g) { return (g.res.stone || 0) >= 10000; } },
  wangguo:  { title: '王国初成', desc: '建造 5 座华宅', cond: function (g) { return (g.bld.huazhai || 0) >= 5; } }
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
  var sign = n < 0 ? '-' : '';
  var v = a, unit = '';
  if (v >= 1e8) { v /= 1e8; unit = '亿'; }
  else if (v >= 1e4) { v /= 1e4; unit = '万'; }
  else if (v >= 1000) { v /= 1000; unit = 'K'; }
  else if (v >= 100) return sign + Math.floor(v).toString();
  else if (v >= 1) return sign + (Math.round(v * 10) / 10).toString();
  else return sign + (Math.round(v * 100) / 100).toString();
  var s = sig3(v);
  // 进位修正：万单位进位到 10000（原值≥1e8）→ 改用亿
  if (unit === '万' && parseFloat(s) >= 10000) {
    v = v / 10000; unit = '亿';
    s = sig3(v);
    if (parseFloat(s) >= 1000) s = '1';
  }
  return sign + s + unit;
}
/* 3 位有效数字、去尾零（防止大数在窄格中溢出，如 123.46万 → 123万） */
function sig3(x) {
  if (x === 0) return '0';
  var v = Math.abs(x);
  var places = 2 - Math.floor(Math.log(v) / Math.LN10);
  if (places < 0) places = 0;
  if (places > 6) places = 6;
  var r = Math.round(v * Math.pow(10, places)) / Math.pow(10, places);
  if (r >= 1000 && v < 1) r = 1;   // 0.999x 进位→1 个单位
  var s = r.toString();
  if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
  return (x < 0 ? '-' : '') + s;
}
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
    stat: {}, ach: {}, event: null,
    peakKittens: 0, peakDay: 1, peakSeason: 0, peakYear: 1,   // 历史巅峰族人及达成时刻（排行榜）
    lastSaveTick: 0, autosaveEvery: 400,
    starving: false
  };
  var SAVE_KEY = 'shanhajing_save_v1';
  var BACKUP_KEY = 'shanhajing_save_backup';
  /* 存档版本：数值/开局机制调整时必须 +1。旧版本存档（含无版本号存档）
     将自动备份到 backup 并清空主档，重新开荒——保证新设备/新版本从 0 开始，
     避免旧数值存档与新版本不兼容导致死锁或"非从 0 开局" */
  var SAVE_VERSION = 5;   // v5：P2 一界完整（新增 4 资源 / 23 建筑 / 5 职业 / 24 典籍 / 事件 / 成就），旧档备份后从 0 开荒

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
    if (!d.stat) d.stat = {};
    if (!d.ach) d.ach = {};
    if (typeof d.kittens === 'number') d.kittens = Math.floor(d.kittens);
    if (d.res.linghe === undefined) d.res.linghe = 0;   // 仅缺失时补 0，旧档灵禾保留
    // 排行榜峰值字段：旧档补默认（不升 SAVE_VERSION，避免清档）
    if (typeof d.peakKittens !== 'number') { d.peakKittens = Math.floor(d.kittens || 0); d.peakDay = d.day || 1; d.peakSeason = d.season || 0; d.peakYear = d.year || 1; }
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
    E.prodRatio = (E.prodRatio || 0) + getLimitedDR(G.qiyun * 0.01, 0.5);
    // 事件效果并入（大旱/天象异动等，作用于 lingheRatio）
    if (G.event) {
      var ev = EVENT_DEF[G.event.id];
      if (ev && ev.fx) { for (var f2 in ev.fx) E[f2] = (E[f2] || 0) + ev.fx[f2]; }
    }
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
      for (var f in JOB_DEF[k].fx) {
        R[f] = (R[f] || 0) + JOB_DEF[k].fx[f] * n;
        if (k === 'liehu' && f === 'linghe') G.stat.huntProduced = (G.stat.huntProduced || 0) + JOB_DEF[k].fx[f] * n;
      }
    }
    var prod = 1 + getEffect('prodRatio');
    for (i = 0; i < RES_ORDER.length; i++) {
      k = RES_ORDER[i];
      if (R[k]) R[k] = R[k] * prod;
    }
    R.wood *= 1 + getEffect('woodRatio');
    R.xueshi *= 1 + getEffect('xueshiRatio');
    R.linghe *= 1 + getEffect('lingheRatio');
    R.stone *= 1 + getEffect('stoneRatio');
    R.bronze *= 1 + getEffect('bronzeRatio');
    R.linghe -= G.kittens * KITTEN_CONSUME;
    return R;
  }

  function getMax(res) {
    if (res === 'linghe') return 5000 + getEffect('lingheMax');
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

  // 事件系统：每天一次——已有事件倒计时，无事件则按概率触发
  function eventUpdate() {
    if (G.event) {
      G.event.remain--;
      if (G.event.remain <= 0) { G.event = null; updateCaches(); }
      return;
    }
    for (var i = 0; i < EVENT_ORDER.length; i++) {
      var id = EVENT_ORDER[i];
      var e = EVENT_DEF[id];
      if (e.season !== undefined && e.season !== G.season) continue;
      if (Math.random() < e.prob) {
        G.event = { id: id, remain: e.dur || 1 };
        if (e.gain) { for (var k in e.gain) G.res[k] = (G.res[k] || 0) + e.gain[k]; }
        log('【' + e.title + '】' + e.text);
        updateCaches();
        break;
      }
    }
  }

  // 成就系统：每 10 tick 检查一次
  function achUpdate() {
    for (var i = 0; i < ACH_ORDER.length; i++) {
      var id = ACH_ORDER[i];
      if (G.ach[id]) continue;
      try {
        if (ACH_DEF[id].cond(G)) {
          G.ach[id] = true;
          log('【成就达成】' + ACH_DEF[id].title + '：' + ACH_DEF[id].desc);
        }
      } catch (e) { /* 条件异常忽略 */ }
    }
  }

  // 巅峰族人追踪：族人上升时记录峰值与达成时刻（轮回/饿死不降低）
  function peakUpdate() {
    if (G.kittens > G.peakKittens) {
      G.peakKittens = G.kittens;
      G.peakDay = G.day; G.peakSeason = G.season; G.peakYear = G.year;
    }
  }

  // 手动采集灵禾：点一下 +1（原版 catnip 点击），受灵禾上限约束；满仓返回 false
  function gather() {
    var max = getMax('linghe');
    var v = G.res.linghe || 0;
    if (v >= max) return false;
    G.res.linghe = v + 10;
    G.stat.gatherClicks = (G.stat.gatherClicks || 0) + 1;
    G.stat.lingheGathered = (G.stat.lingheGathered || 0) + 10;
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
    if (t.mutex && G.techs[t.mutex]) return;   // 互斥治国方略：已研对立项则不可研
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
      seen: G.seen, log: G.log.slice(-80),
      stat: G.stat, ach: G.ach, event: G.event,
      peakKittens: G.peakKittens, peakDay: G.peakDay, peakSeason: G.peakSeason, peakYear: G.peakYear
    });
  }
  function apply(d) {
    G.tick = d.tick || 0; G.day = d.day || 1; G.season = d.season || 0; G.year = d.year || 1;
    G.res = shallow(d.res); G.bld = shallow(d.bld); G.jobs = shallow(d.jobs);
    G.techs = shallow(d.techs); G.seen = shallow(d.seen);
    G.kittens = d.kittens || 0; G.kittenProgress = d.kittenProgress || 0;
    G.qiyun = d.qiyun || 0; G.log = (d.log || []).slice();
    G.stat = shallow(d.stat || {}); G.ach = shallow(d.ach || {}); G.event = d.event || null;
    G.peakKittens = d.peakKittens || 0; G.peakDay = d.peakDay || 1;
    G.peakSeason = d.peakSeason || 0; G.peakYear = d.peakYear || 1;
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
      eventUpdate();
      updateCaches();
      resourcesUpdate();
      villageUpdate();
      peakUpdate();
      if (G.tick % 10 === 0) achUpdate();
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
  DATA: { RES_ORDER: RES_ORDER, RES_DEF: RES_DEF, BLD_ORDER: BLD_ORDER, BLD_DEF: BLD_DEF, JOB_ORDER: JOB_ORDER, JOB_DEF: JOB_DEF, TECH_ORDER: TECH_ORDER, TECH_DEF: TECH_DEF, CRAFT_ORDER: CRAFT_ORDER, CRAFT_DEF: CRAFT_DEF, EVENT_ORDER: EVENT_ORDER, EVENT_DEF: EVENT_DEF, ACH_ORDER: ACH_ORDER, ACH_DEF: ACH_DEF, SEASONS: SEASONS, KITTEN_CONSUME: KITTEN_CONSUME }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHCore;
} else {
  (typeof globalThis !== 'undefined' ? globalThis : this).SHCore = SHCore;
}

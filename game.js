'use strict';
/* =====================================================================
 * 《山海经·洪荒开荒》 抖音小游戏入口 game.js
 * 运行环境：抖音小游戏（tt 运行时，Canvas 渲染，无 DOM）
 * 加载顺序：core(引擎) → adapter(平台抽象) → ui(Canvas UI)
 * ===================================================================== */
var SHCore = require('./js/core.js');
var SHPlatform = require('./js/adapter.js');
var SHUI = require('./js/ui.js');

var App = SHCore.createGame();
App.init();
/* 侧边栏复访（必接能力）：必须在 game.js 启动时机尽早监听 tt.onShow，
   否则用户从侧边栏热启动回游戏时收不到回调，无法领取复访奖励 */
if (SHPlatform.initSidebar) SHPlatform.initSidebar();
SHUI.boot(App, SHPlatform, { dev: false });

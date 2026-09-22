#!/bin/sh
# 抖音云托管要求：项目必须包含 run.sh，且打包到 /opt/application/ 目录
# 作用：以前台方式启动 Node 静态服务器（云托管靠该进程保活）
set -e
exec node /opt/application/server.js

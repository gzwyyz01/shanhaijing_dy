# 抖音云托管 - 静态站点镜像
# 抖音云构建环境无法访问 DockerHub，基础镜像改用火山引擎公共源（官方确认可达）
# 使用 Node 零依赖静态服务器（server.js）替代 nginx，监听 8000，入口 preview.html
FROM public-cn-beijing.cr.volces.com/public/node:18-alpine

WORKDIR /opt/application

# 项目全部静态文件拷入 /opt/application（抖音云托管约定的应用目录）
COPY . /opt/application

# 静态服务器 + 启动脚本
COPY server.js /opt/application/server.js
COPY run.sh /opt/application/run.sh
RUN chmod +x /opt/application/run.sh

EXPOSE 8000
CMD ["/opt/application/run.sh"]

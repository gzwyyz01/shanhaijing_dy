# 抖音云托管 - 静态站点镜像
# 构建方式：在项目根目录（shanhajing-douyin/）执行
#   docker build -f deploy/Dockerfile -t shanhajing-web .
# 本地验证：
#   docker run -p 8000:8000 shanhajing-web
#   浏览器打开 http://localhost:8000/preview.html
FROM nginx:alpine

# 项目全部静态文件拷入 /opt/application（抖音云托管约定的应用目录）
COPY . /opt/application

# Nginx 站点配置（监听 8000，入口 preview.html）
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# 启动脚本（抖音云托管要求 run.sh 位于 /opt/application/ 下）
COPY deploy/run.sh /opt/application/run.sh
RUN chmod +x /opt/application/run.sh

EXPOSE 8000
CMD ["/opt/application/run.sh"]

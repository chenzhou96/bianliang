# macOS / Windows 11 离线分发

运行 `npm run package:desktop`，构建生产网页并输出 `releases/v4-r6-20260913/` 下的两个 ZIP、独立玩法海报和 SHA256SUMS.txt。开发构建需要 Node.js 22.13+、Python 3、curl 与已安装的项目依赖；玩家无需安装这些工具。已有生产构建可运行 `python3 scripts/distribution/build.py --skip-build`。

macOS 包含 Apple Silicon / Intel 官方 Node 运行环境，由 `.app` 自动选择；Windows 11 包含 x64 / ARM64，由启动脚本选择。运行环境版本、官方下载地址和 SHA-256 固定在 `scripts/distribution/runtime-lock.json`；首次构建下载到忽略的 `.runtime/distribution-cache/`，每次打包校验哈希。包内附 Node 与依赖许可证、客户端、启动器、玩家说明与玩法海报，不含源码、node_modules 或开发服务器。

生产网页通过只监听本机的 127.0.0.1:41739 提供，启动默认浏览器。固定地址保留同一浏览器的自动存档；新包不迁移开发版或旧修订存档。停止入口校验服务身份和本机随机令牌，不能随意停止其他服务。日志和服务身份文件写入用户应用数据目录，不要求安装目录可写。

使用 `npm run test:distribution` 验证解压后的 Mac 启动器、中文空格路径、离线资源、桌面/手机、保存与重启、重复启动及停止鉴权，并检查 Windows 二进制架构和启动文件。此测试需要 macOS、Chrome 和已构建分发包；它不等同 Windows 真机测试。

当前未配置 Apple 开发者签名/公证，首次下载后可能需要系统“仍要打开”；不承诺无提示安装。支持范围暂定 macOS 13+、Windows 11。Apple Silicon 实机验证；Intel Mac 和 Windows 两种架构尚待真机验证。此版是双击启动的浏览器离线版，不是独立浏览器内核的安装器。

每个包的 manifest.json 记录源码提交、客户端内容摘要、运行环境及逐文件校验值。构建产物不进 Git，源脚本、说明、海报原图及提示词进入本地主分支；发布给玩家时分发 ZIP 与校验清单即可。

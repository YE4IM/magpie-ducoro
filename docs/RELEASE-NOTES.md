# Ducoro 0.4.9

0.4.9 将插件发布到 npm 注册表（[`magpie-ducoro`](https://www.npmjs.com/package/magpie-ducoro)），并修正安装包的 `bin` 入口路径（移除前导 `./`）：通过 npm 安装后，`magpie-ducoro-status` 诊断命令可正常调用。同步逻辑、页面行为与管理记录格式均无变化。

Version 0.4.9 publishes the plugin to the npm registry as [`magpie-ducoro`](https://www.npmjs.com/package/magpie-ducoro) and fixes the packaged `bin` entry path (dropping the leading `./`) so the `magpie-ducoro-status` diagnostic command works after an npm install. Synchronization logic, page behavior and management record formats are unchanged.

安装方式：`npm install magpie-ducoro@0.4.9`、在 Magpie 插件页面添加 `github:YE4IM/magpie-ducoro#v0.4.9`，或下载 GitHub Release 自动生成的 Source code 解压后添加绝对路径。升级沿用现有兼容设置与管理记录，无需重新配置。GitHub Release 仅提供自动生成的 Source code，不上传额外附件。

Installation: `npm install magpie-ducoro@0.4.9`, add `github:YE4IM/magpie-ducoro#v0.4.9` in Magpie's plugin settings, or download the GitHub Release's automatically generated Source code and add the extracted folder's absolute path. Compatible settings and management records carry forward without reconfiguration. GitHub Release provides only its automatically generated Source code, with no uploaded assets.

完整更新说明见 [CHANGELOG.md](CHANGELOG.md) · Full history: [CHANGELOG.md](CHANGELOG.md)

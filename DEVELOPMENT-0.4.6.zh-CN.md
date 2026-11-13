# 0.4.6 中文开发与验收记录

日期：2026-11-13（Asia/Shanghai）。从 `magpie-ducoro-0.4.5` 完整复制建立独立目录，产品修改仅发生于 `magpie-ducoro-0.4.6`。本阶段固定中文界面，原有英文词典与英文文档保留；新增英文国际化等待后续指令。

## 审查问题修复对照

下表编号对应 `review-0.4.5/UI审查报告.md`。28 项均已落实代码；实际宿主安装、真实账户写入和真人屏幕阅读器验收不包含在本次隔离验证中。

| 编号 | 实现 | 主要文件 |
|---|---|---|
| 01 | 方案编辑纳入工作区脏状态；保存和预览先完成方案暂存；取消范围确认保留编辑；重读、检查点回退与离开保护包含方案编辑 | ui/app.js、ui/control-center.js |
| 02 | 取消嵌套 label，独立搜索名称；共享 17px 复选框；按名称输入折叠到高级设置 | ui/control-center.js、ui/style.css |
| 03 | 持久恢复暂停条；只读 state-status 与继续同步分离；服务端校验成功预览凭据、配置和完整管理记录版本；凭据两分钟有效且仅用一次；桥接仅在明确批准后解除暂停 | page-service.mjs、bridge.mjs、ui/reliability.js |
| 04 | 名册读取与差异检查分开显示；检查失败/过期时不将零冲突当作结论；提供重新检查与筛选空态 | ui/resources.js |
| 05 | Bot 计数排除 global，确定变化、待核实 Bot、全局资源变化与资源操作项分别统计；默认只看确定变化 | ui/preview.js |
| 06 | 初始无核验任务只显示尚未核验；有明确完成证据后才显示完成；保留部分完成和失败 | ui/reliability.js |
| 07 | 方案错误就地呈现；字段 aria-invalid、错误关联与首个错误聚焦；其他错误跳到可见提示；预览立即打开可取消等待窗口 | ui/components.js、ui/app.js、ui/control-center.js、ui/preview.js |
| 08 | 独立 on-accent；按实际强调色选择对比更高的深/浅文字；主题更新时重新计算 | ui/components.js、ui/service-bridge.js、ui/style.css |
| 09 | Bot 列表置于主要内容；作用域折叠；管理方案移到列表之后并默认折叠 | ui/components.js、ui/control-center.js |
| 10 | 底部保留修改摘要与预览并保存；重读、预览、恢复草稿、批量撤销移到更多菜单；无撤销记录时禁用 | ui/app.js、ui/style.css |
| 11 | Bot 展开状态使用 ID + 资源种类，不再共用 class 键 | ui/resources.js |
| 12 | 筛选准确命名为有单项草稿；底栏展示修改设置类别并引导通过预览确认全局有效影响；全局修改使差异过期 | ui/resources.js、ui/app.js |
| 13 | 方案、资源库与账户工具共用搜索/只看已选/计数组件；保留不可用项；工具说明可见。没有新增批量全选动作 | ui/components.js、ui/control-center.js、ui/resources.js |
| 14 | Bot 显示单项草稿标志；资源展示有效数量、来源与同步开关状态；模型暂停标志和恢复草稿入口；账户独立来源标签保留 | ui/resources.js |
| 15 | 方案资源明确继承/指定/不分配；模型明确继承/指定；应用前单独确认全局范围变化并提示全部 Bot 可能受影响 | ui/control-center.js |
| 16 | 顶部统一最近同步、处理数量、运行状态与会话未确认结论；恢复暂停单独持续显示；任务需处理优先，技术信息保留在折叠区 | ui/app.js、ui/task-center.js、ui/control-center.js |
| 17 | 任务与进度失败保留旧内容并标记最后成功读取时间；任务用稳定 ID 复用节点，保留焦点；不同筛选有准确空态 | ui/task-center.js、ui/control-center.js |
| 18 | 诊断跳转携带原因，重读后聚焦、高亮 Bot 标题；映射跳转展开匹配依据与手动设置 | ui/app.js、ui/resources.js、ui/components.js |
| 19 | 备份名称/时间/保留标签优先；元信息编辑折叠；创建可填名称并定位新条目；检查点先显示可读变化，再展开 JSON | ui/backup-files.js、ui/control-center.js、ui/reliability.js |
| 20 | Native Dialog 统一标题关联、初始与返回焦点、通用样式；危险确认使用 danger；预览统一单层滚动与 sticky 操作 | ui/components.js、ui/style.css |
| 21 | 启动页增加 viewport、共享样式、连接阶段与十秒超时重试；语言等待期间保留可见加载状态 | ui/launch.html、ui/launch.js、ui/style.css |
| 22 | 目标 Bot 可从名册选择，显示并可编辑原有目标列表；子代理从资源库枚举，无法枚举时明确提示并保留名称输入 | page-service.mjs、ui/index.html、ui/control-center.js、ui/app.js |
| 23 | CSS 按主题、基础控件、布局、编辑器、底栏、弹窗、状态、响应式重新组织；统一 line/success/warning/danger/on-accent，移除历史版本叠加和未定义 border | ui/style.css |
| 24 | 主控件 14px、辅助正文 12px；压缩页头，减少嵌套卡片边框；保持原有低饱和风格 | ui/style.css |
| 25 | 保留原有 button 导航及 aria-pressed，增加方向键/Home/End；搜索独立命名、字段错误关联；轮询列表不整体放入 live region | ui/components.js、ui/control-center.js、ui/task-center.js |
| 26 | 滚动读取 reduced-motion；重建 Bot 控件按名称或 ID 归还焦点；保持展开状态；搜索与只看已选不再触发配置收集 | ui/components.js、ui/resources.js、ui/app.js |
| 27 | 模型卡片优先解释 gatewayStatus，区分尚未接入/信息不可读/目录待更新；不推断登录；进入资源页自动重读 | ui/resources.js、ui/app.js |
| 28 | 匹配记录增加独立时间与轮次，区分目录时间；诊断跳转携带原始问题，只读刷新并展开依据；没有记录明确说明待更新；重新匹配仍需主动同步目录 | bridge.mjs、ui/app.js |

## 验证结果

- 60 个 JavaScript / MJS 文件语法解析通过。
- `npm test`：2 个测试通过，覆盖方案继承三态，以及真实本地 HTTP 服务的恢复暂停/只读检查/普通重试拦截/未预览拦截/配置变化/增量记录变化/单次凭据/损坏记录。
- `tests/browser-scenarios.js`：24 项隔离浏览器回归通过，包含用户可见状态与预览实际请求体，不只检查内部函数。
- 补充浏览器检查：账户工具搜索与可见说明、Escape 返回账户按钮焦点、有效备份与检查点空状态通过。
- 390、768、1024、1440px 及 720px（1440px 在 200% 下的等效 CSS 可用宽度）均无整页横向溢出。720px 是布局等效检查，不等同于原生 WebView 实际缩放验收。
- 中文底栏在上述窗口约 58–65px。默认浅色主按钮对比度 6.18:1，深色 5.70:1；紫色宿主强调色选用白字。
- 测试数据由 `tests/ui-server.py` 模拟。未保存真实 Magpie 配置，未执行真实 Bot 同步、备份恢复、删除或账户权限变更。

`qa/` 包含机器可读结果和中文截图。启动模拟页面：`npm run test:ui:serve`，访问 `http://127.0.0.1:48766/`。使用浏览器执行 `tests/browser-scenarios.js`；测试仅可用于该模拟页面。服务测试需要允许监听本地回环地址。

## 后续验收边界

本轮完成中文源码与开发包。英文新增文案、英文长文本布局等待用户指令。真实 Magpie WebView 安装/重启、真实同步恢复流程、Windows、真人屏幕阅读器与大量 Bot 性能仍需专门联调；隔离验证不能替代这些结果。当前运行中的 0.4.5 未切换到开发版本。

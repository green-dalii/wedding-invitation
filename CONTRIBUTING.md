# 贡献指南

感谢你对 wedding-invitation 的关注！欢迎一切形式的贡献：Bug 报告、功能建议、文档改进、代码 PR 都非常欢迎。

## 本地开发

要求 **Node 20+**。

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（--host，局域网可访问）
npm run test       # 运行单元测试（25 项）
npm run e2e        # 运行端到端验证（15 项，需要本地 Chrome）
```

## 提交前必须通过

```bash
npx tsc --noEmit && npm run test
```

两项都通过再提交 PR。CI 会跑同样的检查（CI 不跑 e2e，因为需要本地 Chrome）。

## 代码风格

- 2 空格缩进
- 单引号
- 语句结尾加分号
- ESM（`import` / `export`），与现有 `type: "module"` 保持一致

请保持与周边代码一致的风格，PR 保持小而聚焦。

## 重要约定

### 真实个人信息绝不可提交到仓库

这是本仓库最重要的约定：

- 真实姓名、日期、地址、坐标、电话等**只能通过环境变量注入**（`.env` 已 gitignore，或部署平台的环境变量设置）。
- **`assets-src/` 照片目录已 gitignore**，个人照片不要放到其他任何被跟踪的目录。
- 如果你的 PR 中包含示例配置，请使用占位内容（如 `新郎` / `新娘` / `2026.10.18`），不要使用任何真实个人信息。

### 修改物理参数必须同步更新 docs/SPEC.md

Hero 软体物理的参数集中在 `src/hero/hero.config.ts`。**文档先行**：如果你调整了物理参数或交互行为，请在同一个 PR 中同步更新 `docs/SPEC.md`，让规格与实现保持一致。调参时可以用 `?tune` 打开调参面板实时预览。

## 提 Issue

- **Bug 报告**：请使用 [Bug Report 模板](.github/ISSUE_TEMPLATE/bug_report.yml)，附上浏览器 / 设备信息与复现步骤。
- **功能建议**：请使用 [Feature Request 模板](.github/ISSUE_TEMPLATE/feature_request.yml)，说明使用场景。

提交 PR 时请在描述里说明改了什么、为什么改，以及已经跑过哪些验证。再次感谢！

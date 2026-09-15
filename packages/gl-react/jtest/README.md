# jtest — @react-native-ohos/gl-react JS 白盒单元测试

基于 RNOH JS 白盒测试规范（jest + babel-jest，TS 源码经 `@babel/preset-typescript` 转译），
覆盖包内纯逻辑层与鸿蒙 WebGL1 代理的核心分支。

## 运行

```bash
# 在 packages/gl-react 目录下
npm run jtest            # 跑测试
npm run jtest:coverage   # 跑测试 + 覆盖率（当前 100%，阈值 60%）
```

> 用 `npm run` 走本地 jest 29；直接 `npx jest` 可能拉到 npx 缓存的 jest 30（CLI 不兼容）。

## 覆盖率

```text
All files | 100 | 100 | 100 | 100 |
```

注：`copyShader.ts` 未列入覆盖率报告——它是纯 `export default <表达式>` 文件，
istanbul 对此类文件不生成 statementMap（插桩盲区，恒报 0%）；其行为已由
copyShader-test.js 验证。

## 覆盖范围

| 套件 | 目标 |
|------|------|
| GLSL / genId / Uniform / Visitors / Visitor / copyShader | 声明式核心纯函数 |
| Shaders | 着色器注册表、GLSL 版本推断、SHADER_NAME 注入、错误路径 |
| webgl1-constants | 常量表与 GLES2 枚举值一致性 |
| invariantNoDependentsLoop | 渲染图环路检测（mock Node 类） |
| VisitorLogger (+nodes) | 绘制生命周期日志（spy console） |
| WebGLRenderingContextOHOS (+2) | JS↔C++ 命令批处理契约：操作码/token 编码、同步查询顺序、program 缓存、像素数据上传、readPixels、surface 状态翻转 |

## 已知契约缺陷（it.failing 记录，修复后 jest 会提示移除 .failing）

1. **`_taToken` 类型化数组 token 编码**（WebGLRenderingContextOHOS.ts）：
   JS 侧 `-(NULL_TOKEN + kind*100000 + idx)` 得到**正数** token，而 C++
   `tokenData()`（gl_webgl_context.cpp）对 `token >= 0` 一律按数值参数处理，
   数据被静默丢弃。正确编码为 `-(1000000 + kind*100000 + idx)`（见 gl_opcodes.h 注释）。
   影响：texImage2D/bufferData/bufferSubData/texSubImage2D/vertexAttrib*f v/uniform*v/matrix 的像素与数组载荷。
2. **`uniform*` 位置 0 被当作 null**（WebGLRenderingContextOHOS.ts `_uniformLoc`）：
   位置真值判断把合法的 location 0 静默跳过；原生契约 -1 才表示 null。
3. **`VisitorLogger.onNodeSyncDeps` 的 -deps 行**：错用 additions 的名字打印 deletions。

## 约束

- 不修改 `src/` 生产源码（C0），mock 全部位于测试文件 / jtest 目录内
- 所有 `.js` 文件带 MIT license header
- `testMatch` 仅匹配 `jtest/__tests__/*-test.js`

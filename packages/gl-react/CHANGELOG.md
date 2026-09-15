# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-beta.1] - 2026-09-15

### Added

- HarmonyOS (OpenHarmony) adaptation of gl-react (community baseline version 6.0.0): the declarative API (Shaders/GLSL/Node/Bus/LinearCopy/NearestCopy/Uniform/Surface) is consistent with upstream gl-react-native usage, and a single entry exports both the core API and the HarmonyOS Surface
- Self-built HarmonyOS native rendering layer (XComponent + EGL/OpenGL ES): GL commands are batched on the JS side and dispatched once per frame, synchronous queries are executed in order on the native side (consistent with WebGL ordering semantics), and the framebuffer always retains the last rendered frame
- Image textures support `require()` assets, `http(s)://`, `file://`, `data:`, `resource://RAWFILE/...` and NDArray, decoded via Image Kit before being uploaded
- Surface snapshot export: takeSnapshotAsync / captureAsDataURL / captureAsBlob / capture (NDArray pixel readback)
- Autolink support, plus Manual Link (har package / direct source linking) integration guidance
- RNOH verification project example (13 cases: scalar/array/multi-vec uniforms, raf animation, FBO cascading with local/remote textures, backbuffering, snapshot export and pixel readback, Bus, LinearCopy/NearestCopy, uniformsOptions, Uniform.Resolution, blendFunc/clear)
- JS white-box unit tests jtest (14 suites / 113 cases, 100% statement/branch/function/line coverage)
- Bilingual integration documents (README.md / README_EN.md), API documentation, HarmonyOS adaptation design specification and self-test report

### Changed

- example 示例统一按社区方式组织（`gl-react` + `gl-react-expo` + `expo-gl`），`gl-react` 经 metro 重定向至本包核心实现，并与本包共享同一核心模块实例
- 文档按 OpenHarmony 三方库文档模板 v0.4.1 提供中英文双语（README.md / README_EN.md），并补充接口文档、设计说明书与自测试报告

### Fixed

- 修复 example 与库分别持有独立核心模块实例的问题（Shaders/Visitors 全局注册表现在全局唯一）

### Removed

- 移除 example 内上游 gl-react 源码副本目录 `gl-react-patched`（由 metro 重定向至本包核心实现替代）

### Known Issues

- WebGL extensions are not bridged (`getExtension` returns null); capabilities such as float linear filtering rely on the built-in uint8 fallback path
- The `image/jpeg` snapshot format falls back to PNG (identical pixel content, only the container format differs)
- The six-argument DOM/ImageSource form of `gl.texImage2D` is not supported (textures are always uploaded in the full nine-argument form via the texture loader)
- Concurrent rendering of multiple Surfaces on the same screen is limited (the verification project keeps only 1 Surface on screen at a time)

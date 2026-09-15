/**
 * MIT License
 *
 * Copyright (C) 2026 Huawei Device Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * GLContext — 单个 XComponent surface 对应的 EGL/GLES 上下文与 WebGL 对象映射。
 *
 * 线程模型：
 *  - 所有 GL 命令在 RNOH 的 JS/TurboModule 线程执行（flush/同步查询/快照）；
 *  - XComponent surface 生命周期回调在 UI 线程到达，仅做 NativeWindow 引用与
 *    状态标记（mutex 保护），EGL surface 的创建/销毁延迟到 GL 线程的 ensureSurface。
 */
#pragma once

#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "gl_opcodes.h"

namespace glreact {

struct GLTokenData {
  int kind = op::DATA_NULL;
  const uint8_t *bytes = nullptr;
  size_t byteLength = 0;
};

class GLContext {
public:
  uint64_t id = 0;
  std::string xcomponentId;
  std::mutex mutex;

  // --- surface / EGL 状态（UI 线程写，GL 线程读，mutex 保护） ---
  void *nativeWindow = nullptr;      // OHNativeWindow*（已引用计数）
  void *windowPendingRelease = nullptr; // 等 GL 线程销毁 surface 后释放
  bool surfaceAvailable = false;
  bool surfaceNeedsRecreate = true;
  int surfaceWidth = 0;
  int surfaceHeight = 0;
  uint64_t surfaceGeneration = 0; // 每次 created 递增，供原生区分新旧 surface

  // --- WebGL 语义状态（仅 GL 线程访问） ---
  int unpackFlipY = 0;
  int unpackPremultiplyAlpha = 0;
  int unpackAlignment = 4;
  bool contextLost = false;
  uint64_t glErrorCount = 0;
  uint64_t opCount = 0;

  EGLDisplay display = EGL_NO_DISPLAY;
  EGLContext context = EGL_NO_CONTEXT;
  EGLSurface surface = EGL_NO_SURFACE;
  EGLConfig config = nullptr;
  bool eglInitialized = false;

  // JS 侧对象 id → GL 句柄
  std::unordered_map<int, GLuint> shaders;
  std::unordered_map<int, GLuint> programs;
  std::unordered_map<int, GLuint> buffers;
  std::unordered_map<int, GLuint> textures;
  std::unordered_map<int, GLuint> framebuffers;
  std::unordered_map<int, GLuint> renderbuffers;
  // JS 侧 location id → (program, 真实 location)
  std::unordered_map<int, std::pair<GLuint, GLint>> uniformLocations;
  int nextLocationId = 1;

  // 快照 FBO（endFrame 时 blit 保留最后一帧）
  GLuint snapshotFbo = 0;
  GLuint snapshotTex = 0;
  int snapshotW = 0;
  int snapshotH = 0;

  GLContext() = default;
  ~GLContext();

  /** 确保 EGL display/context/surface 就绪并 makeCurrent（仅 GL 线程调用）。
   *  同时从 NativeWindow 同步 surface 几何尺寸。
   *  调用方必须已持有 ctx->mutex。 */
  bool ensureCurrent();
  /** 从 NativeWindow 同步当前几何到 surfaceWidth/Height（GET_BUFFER_GEOMETRY
   *  出参 height 在前）。已建 EGL surface 时几何变化置 surfaceNeedsRecreate，
   *  否则 surface 钉死在旧（可能为 0×0）尺寸上 → 黑屏无报错。
   *  调用方必须已持有 ctx->mutex；任意线程可调。 */
  void refreshGeometryLocked();
  /** 释放当前绑定（GL 线程）。 */
  void releaseCurrent();
  /** 销毁全部 GL/EGL 资源；可在任意线程调用（内部处理线程绑定）。 */
  void destroyAll();

  GLuint ensureSnapshotFbo(int w, int h);

private:
  bool initEGL();
  bool createWindowSurface();
  void destroySurfaceLocked();
};

/** 全局注册表：xcomponentId ↔ GLContext */
class GLRegistry {
public:
  static GLRegistry &instance();

  // UI 线程：由 ArkTS XComponentController 回调经 napi 模块驱动
  void registerXComponent(const std::string &xcomponentId);
  /** 由 surfaceId 创建 NativeWindow 并接线到 xcomponentId（幂等）。返回 contextId（失败 0）。 */
  uint64_t attachSurface(const std::string &xcomponentId, void *window);
  /** surface 销毁：标记不可用，EGL 延迟到 GL 线程清理。 */
  void detachSurface(const std::string &xcomponentId);

  // GL/JS 线程
  std::shared_ptr<GLContext> findById(uint64_t id);
  std::shared_ptr<GLContext> findByXComponentId(const std::string &xcomponentId);
  void destroyContext(uint64_t id);

  uint64_t statsContextsCreated = 0;

private:
  std::mutex registryMutex;
  std::unordered_map<std::string, std::shared_ptr<GLContext>> byXComponentId;
  std::unordered_map<uint64_t, std::shared_ptr<GLContext>> byId;
  uint64_t nextContextId = 0;
};

/** WebGL1 命令执行器：执行一条 flush token 流。返回是否全程 surface 可用。 */
class GLExecutor {
public:
  struct Batch {
    const double *ops = nullptr;
    size_t opCount = 0;
    const std::vector<std::string> *strs = nullptr;
    const std::vector<GLTokenData> *datas = nullptr;
  };

  /** 执行整批命令。要求已 makeCurrent。 */
  void execute(GLContext &ctx, const Batch &batch);

  // 同步查询（要求已 makeCurrent）
  int getError(GLContext &ctx);
  int getShaderParameterBool(GLContext &ctx, int shaderId, int pname);
  std::string getShaderInfoLog(GLContext &ctx, int shaderId);
  std::string getShaderSource(GLContext &ctx, int shaderId);
  bool isShader(GLContext &ctx, int shaderId);
  int getProgramParameterBool(GLContext &ctx, int programId, int pname);
  int getProgramParameterInt(GLContext &ctx, int programId, int pname);
  std::string getProgramInfoLog(GLContext &ctx, int programId);
  bool isProgram(GLContext &ctx, int programId);
  GLint getUniformLocation(GLContext &ctx, int programId, const std::string &name);
  GLint getAttribLocation(GLContext &ctx, int programId, const std::string &name);
  std::vector<double> getUniform(GLContext &ctx, int programId, int locationId);
  bool getActiveResource(GLContext &ctx, int programId, int index, bool isUniform,
                         std::string &outName, int &outSize, int &outType);
  int getParameterInt(GLContext &ctx, int pname);
  int checkFramebufferStatus(GLContext &ctx, int target);
  void readPixelsInto(GLContext &ctx, int x, int y, int w, int h, uint8_t *out);

  struct SnapshotResult {
    bool ok = false;
    std::vector<uint8_t> png;
    int width = 0;
    int height = 0;
  };
  SnapshotResult takeSnapshot(GLContext &ctx, int quality, bool wantJpeg);

private:
  bool execOp(GLContext &ctx, const Batch &batch, size_t &i);
  const GLTokenData *tokenData(const Batch &batch, double token);
  const std::string *tokenStr(const Batch &batch, double token);
  double tokenNum(const Batch &batch, size_t i);
  void uploadTexImage2D(GLContext &ctx, bool isSub, const double *a,
                        const GLTokenData *data);
  void applyUnpack(GLContext &ctx, const GLTokenData *data, int width, int height,
                   int format, int type, std::vector<uint8_t> &scratch,
                   const uint8_t **outPtr, int &outStride);
};

} // namespace glreact

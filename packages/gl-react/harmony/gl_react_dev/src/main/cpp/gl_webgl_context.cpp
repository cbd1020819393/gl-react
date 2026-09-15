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

#include "gl_webgl_context.h"

#include <hilog/log.h>
#include <native_window/external_window.h>

#include <algorithm>
#include <cstring>
#include <memory>

#include "png_encoder.h"

namespace glreact {

namespace {
// 日志分级：常规 attach/detach 高频路径用 DEBUG，失败路径用 ERROR，
// 避免 hilog 过滤排障时错误被常规日志淹没
#define GLLOG(fmt, ...) \
  OH_LOG_Print(LOG_APP, LOG_INFO, 0x0000, "ExGL", fmt, ##__VA_ARGS__)
#define GLLOG_DEBUG(fmt, ...) \
  OH_LOG_Print(LOG_APP, LOG_DEBUG, 0x0000, "ExGL", fmt, ##__VA_ARGS__)
#define GLLOG_ERROR(fmt, ...) \
  OH_LOG_Print(LOG_APP, LOG_ERROR, 0x0000, "ExGL", fmt, ##__VA_ARGS__)

#ifndef EGL_OPENGL_ES3_BIT
#define EGL_OPENGL_ES3_BIT 0x0040
#endif

// 进程级共享 EGLDisplay（引用计数）：eglInitialize/eglTerminate 是 display 级
// 全局操作，多 Surface 并存时任一上下文销毁都不得 terminate 共享 display，
// 否则其余 Surface 的 context/surface 全部失效（黑屏）。仅在最后一个引用
// 释放时才 terminate。
std::mutex g_displayMutex;
EGLDisplay g_sharedDisplay = EGL_NO_DISPLAY;
int g_sharedDisplayRefs = 0;

/** 获取共享 display 引用（返回 EGL_NO_DISPLAY 表示失败）。 */
EGLDisplay acquireSharedDisplay() {
  std::lock_guard<std::mutex> lock(g_displayMutex);
  if (g_sharedDisplay == EGL_NO_DISPLAY) {
    EGLDisplay dpy = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (dpy == EGL_NO_DISPLAY) {
      return EGL_NO_DISPLAY;
    }
    EGLint major = 0, minor = 0;
    if (!eglInitialize(dpy, &major, &minor)) {
      return EGL_NO_DISPLAY;
    }
    g_sharedDisplay = dpy;
    g_sharedDisplayRefs = 0;
  }
  g_sharedDisplayRefs++;
  return g_sharedDisplay;
}

void releaseSharedDisplay() {
  std::lock_guard<std::mutex> lock(g_displayMutex);
  if (g_sharedDisplay == EGL_NO_DISPLAY) {
    return;
  }
  if (--g_sharedDisplayRefs <= 0) {
    eglTerminate(g_sharedDisplay);
    eglReleaseThread();
    g_sharedDisplay = EGL_NO_DISPLAY;
    g_sharedDisplayRefs = 0;
  }
}

int channelsOfFormat(GLenum format) {
  switch (format) {
  case GL_RED:
  case GL_ALPHA:
  case GL_LUMINANCE:
    return 1;
  case GL_LUMINANCE_ALPHA:
  case GL_RG:
    return 2;
  case GL_RGB:
    return 3;
  case GL_RGBA:
    return 4;
  default:
    return 4;
  }
}

int bytesPerChannelOfType(GLenum type) {
  switch (type) {
  case GL_UNSIGNED_BYTE:
  case GL_BYTE:
    return 1;
  case GL_UNSIGNED_SHORT_5_6_5:
  case GL_UNSIGNED_SHORT_4_4_4_4:
  case GL_UNSIGNED_SHORT_5_5_5_1:
  case GL_SHORT:
    return 2;
  case GL_HALF_FLOAT:
    return 2;
  case GL_UNSIGNED_INT:
  case GL_INT:
  case GL_FLOAT:
    return 4;
  default:
    return 1;
  }
}

bool typeIsPackedShort(GLenum type) {
  return type == GL_UNSIGNED_SHORT_5_6_5 || type == GL_UNSIGNED_SHORT_4_4_4_4 ||
         type == GL_UNSIGNED_SHORT_5_5_5_1;
}

} // namespace

// ---------------------------------------------------------------------------
// GLContext
// ---------------------------------------------------------------------------

GLContext::~GLContext() { destroyAll(); }

bool GLContext::initEGL() {
  if (eglInitialized && display != EGL_NO_DISPLAY) {
    return true;
  }
  display = acquireSharedDisplay();
  if (display == EGL_NO_DISPLAY) {
    GLLOG_ERROR("eglGetDisplay/eglInitialize failed");
    return false;
  }
  const EGLint configAttribs[] = {
      EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT, EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
      EGL_RED_SIZE, 8,       EGL_GREEN_SIZE,   8,
      EGL_BLUE_SIZE, 8,      EGL_ALPHA_SIZE,   8,
      EGL_DEPTH_SIZE, 0,     EGL_STENCIL_SIZE, 0,
      EGL_NONE};
  EGLint numConfigs = 0;
  if (!eglChooseConfig(display, configAttribs, &config, 1, &numConfigs) ||
      numConfigs < 1) {
    const EGLint fallbackAttribs[] = {
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_SURFACE_TYPE,
        EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE};
    if (!eglChooseConfig(display, fallbackAttribs, &config, 1, &numConfigs) ||
        numConfigs < 1) {
      GLLOG_ERROR("eglChooseConfig failed");
      return false;
    }
  }
  if (!eglBindAPI(EGL_OPENGL_ES_API)) {
    GLLOG_ERROR("eglBindAPI failed");
    return false;
  }
  const EGLint ctxAttribs3[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
  const EGLint ctxAttribs2[] = {EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE};
  context = eglCreateContext(display, config, EGL_NO_CONTEXT, ctxAttribs3);
  if (context == EGL_NO_CONTEXT) {
    context = eglCreateContext(display, config, EGL_NO_CONTEXT, ctxAttribs2);
  }
  if (context == EGL_NO_CONTEXT) {
    GLLOG_ERROR("eglCreateContext failed");
    return false;
  }
  eglInitialized = true;
  return true;
}

bool GLContext::createWindowSurface() {
  if (!nativeWindow) {
    return false;
  }
  destroySurfaceLocked();
  surface = eglCreateWindowSurface(display, config,
                                   (EGLNativeWindowType)nativeWindow, nullptr);
  if (surface == EGL_NO_SURFACE) {
    GLLOG_ERROR("eglCreateWindowSurface failed 0x%x", eglGetError());
    return false;
  }
  surfaceNeedsRecreate = false;
  return true;
}

void GLContext::destroySurfaceLocked() {
  if (surface != EGL_NO_SURFACE) {
    eglDestroySurface(display, surface);
    surface = EGL_NO_SURFACE;
  }
  if (windowPendingRelease) {
    // 窗口均来自 OH_NativeWindow_CreateNativeWindowFromSurfaceId（自持有引用），
    // 生命周期结束后用 Destroy 归还
    OH_NativeWindow_DestroyNativeWindow((OHNativeWindow *)windowPendingRelease);
    windowPendingRelease = nullptr;
  }
}

/** 调用方必须已持有 ctx->mutex。 */
void GLContext::refreshGeometryLocked() {
  if (!nativeWindow) {
    return;
  }
  // GET_BUFFER_GEOMETRY 可变参出参顺序：height 在前、width 在后（SDK 头文件约定）
  int32_t h = 0, w = 0;
  if (OH_NativeWindow_NativeWindowHandleOpt((OHNativeWindow *)nativeWindow,
                                            GET_BUFFER_GEOMETRY, &h,
                                            &w) == 0 && w > 0 && h > 0) {
    if ((w != surfaceWidth || h != surfaceHeight) &&
        surface != EGL_NO_SURFACE) {
      // 已建 EGL surface 后几何变化：必须重建 surface，否则钉死旧尺寸黑屏
      surfaceNeedsRecreate = true;
    }
    surfaceWidth = w;
    surfaceHeight = h;
  }
}

/** 调用方必须已持有 ctx->mutex。 */
bool GLContext::ensureCurrent() {
  if (contextLost || !surfaceAvailable || !nativeWindow) {
    return false;
  }
  // 每次从 NativeWindow 同步几何尺寸（surface 变更无需显式通知）
  refreshGeometryLocked();
  if (!initEGL()) {
    return false;
  }
  if (surfaceNeedsRecreate || surface == EGL_NO_SURFACE) {
    if (!createWindowSurface()) {
      return false;
    }
  }
  if (eglGetCurrentContext() != context) {
    if (!eglMakeCurrent(display, surface, surface, context)) {
      GLLOG_ERROR("eglMakeCurrent failed 0x%x", eglGetError());
      return false;
    }
  }
  return true;
}

void GLContext::releaseCurrent() {
  if (display != EGL_NO_DISPLAY) {
    eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
  }
}

void GLContext::destroyAll() {
  std::lock_guard<std::mutex> lock(mutex);
  if (display != EGL_NO_DISPLAY) {
    bool wasCurrent =
        (context != EGL_NO_CONTEXT && eglGetCurrentContext() == context);
    if (wasCurrent) {
      releaseCurrent();
    }
    destroySurfaceLocked();
    if (snapshotFbo) {
      glDeleteFramebuffers(1, &snapshotFbo);
      snapshotFbo = 0;
    }
    if (snapshotTex) {
      glDeleteTextures(1, &snapshotTex);
      snapshotTex = 0;
    }
    for (auto &kv : shaders)
      glDeleteShader(kv.second);
    for (auto &kv : programs)
      glDeleteProgram(kv.second);
    for (auto &kv : buffers)
      glDeleteBuffers(1, &kv.second);
    for (auto &kv : textures)
      glDeleteTextures(1, &kv.second);
    for (auto &kv : framebuffers)
      glDeleteFramebuffers(1, &kv.second);
    for (auto &kv : renderbuffers)
      glDeleteRenderbuffers(1, &kv.second);
    shaders.clear();
    programs.clear();
    buffers.clear();
    textures.clear();
    framebuffers.clear();
    renderbuffers.clear();
    uniformLocations.clear();
    if (context != EGL_NO_CONTEXT) {
      eglDestroyContext(display, context);
      context = EGL_NO_CONTEXT;
    }
    // 归还共享 display 引用；仅当最后一个上下文释放时才 eglTerminate
    releaseSharedDisplay();
    display = EGL_NO_DISPLAY;
    eglInitialized = false;
  }
  if (nativeWindow) {
    OH_NativeWindow_DestroyNativeWindow((OHNativeWindow *)nativeWindow);
    nativeWindow = nullptr;
  }
  surfaceAvailable = false;
  contextLost = true;
}

GLuint GLContext::ensureSnapshotFbo(int w, int h) {
  if (snapshotFbo && snapshotW == w && snapshotH == h) {
    return snapshotFbo;
  }
  if (snapshotFbo) {
    glDeleteFramebuffers(1, &snapshotFbo);
    snapshotFbo = 0;
  }
  if (snapshotTex) {
    glDeleteTextures(1, &snapshotTex);
    snapshotTex = 0;
  }
  glGenTextures(1, &snapshotTex);
  glBindTexture(GL_TEXTURE_2D, snapshotTex);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE,
               nullptr);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glGenFramebuffers(1, &snapshotFbo);
  glBindFramebuffer(GL_FRAMEBUFFER, snapshotFbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D,
                         snapshotTex, 0);
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
    GLLOG_ERROR("snapshot fbo incomplete");
    glDeleteFramebuffers(1, &snapshotFbo);
    glDeleteTextures(1, &snapshotTex);
    snapshotFbo = 0;
    snapshotTex = 0;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    return 0;
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  snapshotW = w;
  snapshotH = h;
  return snapshotFbo;
}

// ---------------------------------------------------------------------------
// GLRegistry
// ---------------------------------------------------------------------------

GLRegistry &GLRegistry::instance() {
  static GLRegistry inst;
  return inst;
}

void GLRegistry::registerXComponent(const std::string &xcomponentId) {
  std::lock_guard<std::mutex> lock(registryMutex);
  if (byXComponentId.count(xcomponentId) > 0) {
    return;
  }
  auto ctx = std::make_shared<GLContext>();
  ctx->id = ++nextContextId;
  ctx->xcomponentId = xcomponentId;
  byXComponentId[xcomponentId] = ctx;
  byId[ctx->id] = ctx;
  statsContextsCreated++;
}

std::shared_ptr<GLContext> GLRegistry::findByXComponentId(const std::string &xcId) {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto it = byXComponentId.find(xcId);
  return it != byXComponentId.end() ? it->second : nullptr;
}

std::shared_ptr<GLContext> GLRegistry::findById(uint64_t id) {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto it = byId.find(id);
  return it != byId.end() ? it->second : nullptr;
}

uint64_t GLRegistry::attachSurface(const std::string &xcomponentId, void *window) {
  if (!window) {
    return 0;
  }
  registerXComponent(xcomponentId);
  auto ctx = findByXComponentId(xcomponentId);
  if (!ctx) {
    return 0;
  }
  std::lock_guard<std::mutex> lock(ctx->mutex);
  if (ctx->surfaceAvailable && ctx->nativeWindow == window) {
    // 兜底防御：每次 FromSurfaceId 均产生新 window 指针，等值几乎不可命中；
    // 真实去重由 UI/JS 侧避免重复 attach 保证，此处保留防重复接线
    return ctx->id;
  }
  if (ctx->nativeWindow && ctx->nativeWindow != window) {
    // surface 销毁后重建（新 surfaceId/window）：旧窗口延迟到 GL 线程释放
    ctx->windowPendingRelease = ctx->nativeWindow;
    ctx->surfaceAvailable = false;
  }
  ctx->nativeWindow = window;
  ctx->surfaceWidth = 0;
  ctx->surfaceHeight = 0;
  ctx->surfaceAvailable = true;
  ctx->surfaceNeedsRecreate = true;
  ctx->surfaceGeneration++;
  ctx->contextLost = false;
  GLLOG_DEBUG("attachSurface xc=%{public}s ctx=%{public}llu", xcomponentId.c_str(),
        (unsigned long long)ctx->id);
  return ctx->id;
}

void GLRegistry::detachSurface(const std::string &xcomponentId) {
  auto ctx = findByXComponentId(xcomponentId);
  if (!ctx) {
    return;
  }
  std::lock_guard<std::mutex> lock(ctx->mutex);
  ctx->surfaceAvailable = false;
  GLLOG_DEBUG("detachSurface xc=%{public}s ctx=%{public}llu", xcomponentId.c_str(),
        (unsigned long long)ctx->id);
}

void GLRegistry::destroyContext(uint64_t id) {
  std::shared_ptr<GLContext> ctx = findById(id);
  if (!ctx) {
    return;
  }
  std::string xcId = ctx->xcomponentId;
  {
    std::lock_guard<std::mutex> lock(registryMutex);
    byId.erase(id);
    byXComponentId.erase(xcId);
  }
  ctx->destroyAll();
}

// ---------------------------------------------------------------------------
// GLExecutor
// ---------------------------------------------------------------------------

double GLExecutor::tokenNum(const Batch &batch, size_t i) {
  return (i < batch.opCount) ? batch.ops[i] : 0;
}

const std::string *GLExecutor::tokenStr(const Batch &batch, double token) {
  long k = (long)(-token - 1) / 2;
  if (k >= 0 && batch.strs && (size_t)k < batch.strs->size()) {
    return &(*batch.strs)[(size_t)k];
  }
  return nullptr;
}

const GLTokenData *GLExecutor::tokenData(const Batch &batch, double token) {
  if (token >= 0 || token == (double)op::kNullToken) {
    return nullptr;
  }
  long enc = (long)(-token);
  if (enc <= 1000000L) {
    return nullptr;
  }
  long idx = (enc - 1000000L) % 100000L;
  if (!batch.datas || idx < 0 || (size_t)idx >= batch.datas->size()) {
    return nullptr;
  }
  return &(*batch.datas)[(size_t)idx];
}

void GLExecutor::applyUnpack(GLContext &ctx, const GLTokenData *data, int width,
                             int height, int format, int type,
                             std::vector<uint8_t> &scratch,
                             const uint8_t **outPtr, int &outStride) {
  if (!data || data->byteLength == 0) {
    *outPtr = nullptr;
    outStride = 0;
    return;
  }
  bool flip = ctx.unpackFlipY != 0;
  bool premultiply = ctx.unpackPremultiplyAlpha != 0;
  int channels = channelsOfFormat((GLenum)format);
  int bpc = bytesPerChannelOfType((GLenum)type);
  int bpp = typeIsPackedShort((GLenum)type) ? 2 : channels * bpc;
  size_t rowBytes = (size_t)(width > 0 ? width : 1) * (size_t)bpp;
  int align = ctx.unpackAlignment > 0 ? ctx.unpackAlignment : 1;
  size_t stride = (rowBytes + align - 1) / align * align;

  const uint8_t *src = data->bytes;
  if (!flip && !premultiply) {
    *outPtr = src;
    outStride = (int)stride;
    return;
  }
  scratch.resize(stride * (size_t)(height > 0 ? height : 1));
  for (int y = 0; y < height; y++) {
    int sy = flip ? (height - 1 - y) : y;
    const uint8_t *srow = src + (size_t)sy * stride;
    uint8_t *drow = scratch.data() + (size_t)y * stride;
    if (premultiply && format == GL_RGBA && type == GL_UNSIGNED_BYTE) {
      for (int x = 0; x < width; x++) {
        const uint8_t *s = srow + (size_t)x * 4;
        uint8_t *d = drow + (size_t)x * 4;
        uint16_t a = s[3];
        d[0] = (uint8_t)((uint16_t)s[0] * a / 255);
        d[1] = (uint8_t)((uint16_t)s[1] * a / 255);
        d[2] = (uint8_t)((uint16_t)s[2] * a / 255);
        d[3] = s[3];
      }
    } else {
      std::memcpy(drow, srow, rowBytes);
    }
  }
  *outPtr = scratch.data();
  outStride = (int)stride;
}

void GLExecutor::uploadTexImage2D(GLContext &ctx, bool isSub, const double *a,
                                  const GLTokenData *data) {
  if (isSub) {
    // (target, level, xoff, yoff, w, h, format, type, data)
    GLenum target = (GLenum)a[0];
    GLint level = (GLint)a[1];
    GLint xoff = (GLint)a[2];
    GLint yoff = (GLint)a[3];
    GLint width = (GLint)a[4];
    GLint height = (GLint)a[5];
    GLenum format = (GLenum)a[6];
    GLenum type = (GLenum)a[7];
    std::vector<uint8_t> scratch;
    const uint8_t *ptr = nullptr;
    int stride = 0;
    applyUnpack(ctx, data, width, height, format, type, scratch, &ptr, stride);
    if (ptr && (size_t)stride != (size_t)width * 4 &&
        type == GL_UNSIGNED_BYTE) {
      // GLES 按 UNPACK_ALIGNMENT 行进上传；当 stride 与紧凑布局不一致时展开，
      // 避免依赖额外扩展（WebGL1 无 UNPACK_ROW_LENGTH）
      size_t rowBytes = (size_t)width * (size_t)channelsOfFormat(format);
      std::vector<uint8_t> tight(rowBytes * (size_t)height);
      for (int y = 0; y < height; y++) {
        std::memcpy(tight.data() + rowBytes * (size_t)y,
                    ptr + (size_t)stride * (size_t)y, rowBytes);
      }
      glTexSubImage2D(target, level, xoff, yoff, width, height, format, type,
                      tight.data());
      return;
    }
    glTexSubImage2D(target, level, xoff, yoff, width, height, format, type, ptr);
    return;
  }
  // (target, level, internalformat, w, h, border, format, type, data)
  GLenum target = (GLenum)a[0];
  GLint level = (GLint)a[1];
  GLint internalformat = (GLint)a[2];
  GLint width = (GLint)a[3];
  GLint height = (GLint)a[4];
  GLint border = (GLint)a[5];
  GLenum format = (GLenum)a[6];
  GLenum type = (GLenum)a[7];
  std::vector<uint8_t> scratch;
  const uint8_t *ptr = nullptr;
  int stride = 0;
  applyUnpack(ctx, data, width, height, format, type, scratch, &ptr, stride);
  if (ptr && (size_t)stride != (size_t)width * (size_t)channelsOfFormat(format) &&
      type == GL_UNSIGNED_BYTE) {
    size_t rowBytes = (size_t)width * (size_t)channelsOfFormat(format);
    std::vector<uint8_t> tight(rowBytes * (size_t)height);
    for (int y = 0; y < height; y++) {
      std::memcpy(tight.data() + rowBytes * (size_t)y,
                  ptr + (size_t)stride * (size_t)y, rowBytes);
    }
    glTexImage2D(target, level, internalformat, width, height, border, format,
                 type, tight.data());
    return;
  }
  glTexImage2D(target, level, internalformat, width, height, border, format,
               type, ptr);
}

bool GLExecutor::execOp(GLContext &ctx, const Batch &batch, size_t &i) {
  double opc = batch.ops[i++];
  if (i >= batch.opCount) {
    return false;
  }
  i++; // JS 编码为 [opcode, argc, args...]：跳过 argc token
  const double *a = batch.ops + i; // 参数起始
  auto dataAt = [&](size_t idx) -> const GLTokenData * {
    return tokenData(batch, a[idx]);
  };
  auto locIt = [&](size_t idx) { return ctx.uniformLocations.find((int)a[idx]); };
  auto texAt = [&](size_t idx) -> GLuint {
    auto it = ctx.textures.find((int)a[idx]);
    return it != ctx.textures.end() ? it->second : 0;
  };
  switch ((int)opc) {
  case op::CREATE_SHADER:
    ctx.shaders[(int)a[0]] = glCreateShader((GLenum)a[1]);
    i += 2;
    break;
  case op::DELETE_SHADER: {
    auto it = ctx.shaders.find((int)a[0]);
    if (it != ctx.shaders.end()) {
      glDeleteShader(it->second);
      ctx.shaders.erase(it);
    }
    i += 1;
    break;
  }
  case op::SHADER_SOURCE: {
    auto it = ctx.shaders.find((int)a[0]);
    auto str = tokenStr(batch, a[1]);
    if (it != ctx.shaders.end() && str) {
      const GLchar *src = str->c_str();
      GLint len = (GLint)str->size();
      glShaderSource(it->second, 1, &src, &len);
    }
    i += 2;
    break;
  }
  case op::COMPILE_SHADER: {
    auto it = ctx.shaders.find((int)a[0]);
    if (it != ctx.shaders.end())
      glCompileShader(it->second);
    i += 1;
    break;
  }
  case op::CREATE_PROGRAM:
    ctx.programs[(int)a[0]] = glCreateProgram();
    i += 1;
    break;
  case op::DELETE_PROGRAM: {
    auto it = ctx.programs.find((int)a[0]);
    if (it != ctx.programs.end()) {
      glDeleteProgram(it->second);
      ctx.programs.erase(it);
    }
    i += 1;
    break;
  }
  case op::ATTACH_SHADER: {
    auto p = ctx.programs.find((int)a[0]);
    auto s = ctx.shaders.find((int)a[1]);
    if (p != ctx.programs.end() && s != ctx.shaders.end())
      glAttachShader(p->second, s->second);
    i += 2;
    break;
  }
  case op::DETACH_SHADER: {
    auto p = ctx.programs.find((int)a[0]);
    auto s = ctx.shaders.find((int)a[1]);
    if (p != ctx.programs.end() && s != ctx.shaders.end())
      glDetachShader(p->second, s->second);
    i += 2;
    break;
  }
  case op::BIND_ATTRIB_LOCATION: {
    auto p = ctx.programs.find((int)a[0]);
    auto str = tokenStr(batch, a[2]);
    if (p != ctx.programs.end() && str)
      glBindAttribLocation(p->second, (GLuint)a[1], str->c_str());
    i += 3;
    break;
  }
  case op::LINK_PROGRAM: {
    auto p = ctx.programs.find((int)a[0]);
    if (p != ctx.programs.end())
      glLinkProgram(p->second);
    i += 1;
    break;
  }
  case op::USE_PROGRAM: {
    auto p = ctx.programs.find((int)a[0]);
    if (p != ctx.programs.end())
      glUseProgram(p->second);
    i += 1;
    break;
  }
  case op::CREATE_BUFFER: {
    GLuint b = 0;
    glGenBuffers(1, &b);
    ctx.buffers[(int)a[0]] = b;
    i += 1;
    break;
  }
  case op::DELETE_BUFFER: {
    auto it = ctx.buffers.find((int)a[0]);
    if (it != ctx.buffers.end()) {
      glDeleteBuffers(1, &it->second);
      ctx.buffers.erase(it);
    }
    i += 1;
    break;
  }
  case op::BIND_BUFFER: {
    GLuint b = 0;
    auto it = ctx.buffers.find((int)a[1]);
    if (it != ctx.buffers.end())
      b = it->second;
    glBindBuffer((GLenum)a[0], b);
    i += 2;
    break;
  }
  case op::BUFFER_DATA: {
    const GLTokenData *d = dataAt(1);
    if (d) {
      glBufferData((GLenum)a[0], (GLsizeiptr)d->byteLength, d->bytes,
                   (GLenum)a[2]);
    } else {
      // null 数据：按 0 长度分配空存储（等价 WebGL null 上传前的占位）
      glBufferData((GLenum)a[0], 0, nullptr, (GLenum)a[2]);
    }
    i += 3;
    break;
  }
  case op::BUFFER_DATA_SIZE:
    glBufferData((GLenum)a[0], (GLsizeiptr)a[1], nullptr, (GLenum)a[2]);
    i += 3;
    break;
  case op::BUFFER_SUB_DATA: {
    const GLTokenData *d = dataAt(2);
    if (d) {
      glBufferSubData((GLenum)a[0], (GLintptr)a[1], (GLsizeiptr)d->byteLength,
                      d->bytes);
    }
    i += 3;
    break;
  }
  case op::CREATE_TEXTURE: {
    GLuint t = 0;
    glGenTextures(1, &t);
    ctx.textures[(int)a[0]] = t;
    i += 1;
    break;
  }
  case op::DELETE_TEXTURE: {
    auto it = ctx.textures.find((int)a[0]);
    if (it != ctx.textures.end()) {
      glDeleteTextures(1, &it->second);
      ctx.textures.erase(it);
    }
    i += 1;
    break;
  }
  case op::BIND_TEXTURE:
    glBindTexture((GLenum)a[0], texAt(1));
    i += 2;
    break;
  case op::ACTIVE_TEXTURE:
    glActiveTexture((GLenum)a[0]);
    i += 1;
    break;
  case op::PIXEL_STOREI: {
    GLenum pname = (GLenum)a[0];
    GLint param = (GLint)a[1];
    if (pname == op::UNPACK_FLIP_Y_WEBGL) {
      ctx.unpackFlipY = param;
    } else if (pname == op::UNPACK_PREMULTIPLY_ALPHA_WEBGL) {
      ctx.unpackPremultiplyAlpha = param;
    } else if (pname == op::UNPACK_COLORSPACE_CONVERSION_WEBGL) {
      // WebGL 专属语义，GLES 无对应概念，忽略
    } else {
      if (pname == GL_UNPACK_ALIGNMENT) {
        ctx.unpackAlignment = param;
      }
      glPixelStorei(pname, param);
    }
    i += 2;
    break;
  }
  case op::TEX_IMAGE_2D:
    uploadTexImage2D(ctx, false, a, dataAt(8));
    i += 9;
    break;
  case op::TEX_SUB_IMAGE_2D:
    uploadTexImage2D(ctx, true, a, dataAt(8));
    i += 9;
    break;
  case op::TEX_PARAMETERI:
    glTexParameteri((GLenum)a[0], (GLenum)a[1], (GLint)a[2]);
    i += 3;
    break;
  case op::TEX_PARAMETERF:
    glTexParameterf((GLenum)a[0], (GLenum)a[1], (GLfloat)a[2]);
    i += 3;
    break;
  case op::GENERATE_MIPMAP:
    glGenerateMipmap((GLenum)a[0]);
    i += 1;
    break;
  case op::CREATE_FRAMEBUFFER: {
    GLuint f = 0;
    glGenFramebuffers(1, &f);
    ctx.framebuffers[(int)a[0]] = f;
    i += 1;
    break;
  }
  case op::DELETE_FRAMEBUFFER: {
    auto it = ctx.framebuffers.find((int)a[0]);
    if (it != ctx.framebuffers.end()) {
      glDeleteFramebuffers(1, &it->second);
      ctx.framebuffers.erase(it);
    }
    i += 1;
    break;
  }
  case op::BIND_FRAMEBUFFER: {
    GLuint f = 0;
    auto it = ctx.framebuffers.find((int)a[1]);
    if (it != ctx.framebuffers.end())
      f = it->second;
    glBindFramebuffer((GLenum)a[0], f);
    i += 2;
    break;
  }
  case op::FRAMEBUFFER_TEXTURE_2D:
    glFramebufferTexture2D((GLenum)a[0], (GLenum)a[1], (GLenum)a[2], texAt(3),
                           (GLint)a[4]);
    i += 5;
    break;
  case op::CHECK_FRAMEBUFFER_STATUS:
    glCheckFramebufferStatus((GLenum)a[0]);
    i += 1;
    break;
  case op::CREATE_RENDERBUFFER: {
    GLuint r = 0;
    glGenRenderbuffers(1, &r);
    ctx.renderbuffers[(int)a[0]] = r;
    i += 1;
    break;
  }
  case op::DELETE_RENDERBUFFER: {
    auto it = ctx.renderbuffers.find((int)a[0]);
    if (it != ctx.renderbuffers.end()) {
      glDeleteRenderbuffers(1, &it->second);
      ctx.renderbuffers.erase(it);
    }
    i += 1;
    break;
  }
  case op::BIND_RENDERBUFFER: {
    GLuint r = 0;
    auto it = ctx.renderbuffers.find((int)a[1]);
    if (it != ctx.renderbuffers.end())
      r = it->second;
    glBindRenderbuffer((GLenum)a[0], r);
    i += 2;
    break;
  }
  case op::FRAMEBUFFER_RENDERBUFFER: {
    GLuint r = 0;
    auto it = ctx.renderbuffers.find((int)a[3]);
    if (it != ctx.renderbuffers.end())
      r = it->second;
    glFramebufferRenderbuffer((GLenum)a[0], (GLenum)a[1], (GLenum)a[2], r);
    i += 4;
    break;
  }
  case op::VIEWPORT:
    glViewport((GLint)a[0], (GLint)a[1], (GLsizei)a[2], (GLsizei)a[3]);
    i += 4;
    break;
  case op::ENABLE:
    glEnable((GLenum)a[0]);
    i += 1;
    break;
  case op::DISABLE:
    glDisable((GLenum)a[0]);
    i += 1;
    break;
  case op::CLEAR_COLOR:
    glClearColor((GLclampf)a[0], (GLclampf)a[1], (GLclampf)a[2], (GLclampf)a[3]);
    i += 4;
    break;
  case op::CLEAR:
    glClear((GLbitfield)a[0]);
    i += 1;
    break;
  case op::BLEND_FUNC:
    glBlendFunc((GLenum)a[0], (GLenum)a[1]);
    i += 2;
    break;
  case op::BLEND_COLOR:
    glBlendColor((GLclampf)a[0], (GLclampf)a[1], (GLclampf)a[2], (GLclampf)a[3]);
    i += 4;
    break;
  case op::BLEND_EQUATION:
    glBlendEquation((GLenum)a[0]);
    i += 1;
    break;
  case op::DRAW_ARRAYS:
    glDrawArrays((GLenum)a[0], (GLint)a[1], (GLsizei)a[2]);
    i += 3;
    break;
  case op::FLUSH:
    glFlush();
    break;
  case op::FINISH:
    glFinish();
    break;
  case op::END_FRAME: {
    int w = ctx.surfaceWidth;
    int h = ctx.surfaceHeight;
    // 将默认帧缓冲的最后一帧 blit 到快照 FBO（供快照导出/capture 使用）
    if (w > 0 && h > 0) {
      GLuint snapFbo = ctx.ensureSnapshotFbo(w, h);
      if (snapFbo) {
        glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
        glBindFramebuffer(GL_DRAW_FRAMEBUFFER, snapFbo);
        glBlitFramebuffer(0, 0, w, h, 0, 0, w, h, GL_COLOR_BUFFER_BIT,
                          GL_NEAREST);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
      }
    }
    glFlush();
    if (ctx.surface != EGL_NO_SURFACE) {
      eglSwapBuffers(ctx.display, ctx.surface);
    }
    break;
  }
  case op::VERTEX_ATTRIB_POINTER:
    glVertexAttribPointer((GLuint)a[0], (GLint)a[1], (GLenum)a[2],
                          (GLboolean)(unsigned)a[3], (GLsizei)a[4],
                          (const void *)(uintptr_t)(int)a[5]);
    i += 6;
    break;
  case op::ENABLE_VERTEX_ATTRIB_ARRAY:
    glEnableVertexAttribArray((GLuint)a[0]);
    i += 1;
    break;
  case op::DISABLE_VERTEX_ATTRIB_ARRAY:
    glDisableVertexAttribArray((GLuint)a[0]);
    i += 1;
    break;
  case op::VERTEX_ATTRIB_1F:
    glVertexAttrib1f((GLuint)a[0], (GLfloat)a[1]);
    i += 2;
    break;
  case op::VERTEX_ATTRIB_2F:
    glVertexAttrib2f((GLuint)a[0], (GLfloat)a[1], (GLfloat)a[2]);
    i += 3;
    break;
  case op::VERTEX_ATTRIB_3F:
    glVertexAttrib3f((GLuint)a[0], (GLfloat)a[1], (GLfloat)a[2], (GLfloat)a[3]);
    i += 4;
    break;
  case op::VERTEX_ATTRIB_4F:
    glVertexAttrib4f((GLuint)a[0], (GLfloat)a[1], (GLfloat)a[2], (GLfloat)a[3],
                     (GLfloat)a[4]);
    i += 5;
    break;
  case op::VERTEX_ATTRIB_1FV:
  case op::VERTEX_ATTRIB_2FV:
  case op::VERTEX_ATTRIB_3FV:
  case op::VERTEX_ATTRIB_4FV: {
    int n = (int)opc - op::VERTEX_ATTRIB_1FV + 1;
    const GLTokenData *d = dataAt(1);
    if (d && d->byteLength >= (size_t)n * 4) {
      const GLfloat *v = (const GLfloat *)d->bytes;
      switch (n) {
      case 1:
        glVertexAttrib1fv((GLuint)a[0], v);
        break;
      case 2:
        glVertexAttrib2fv((GLuint)a[0], v);
        break;
      case 3:
        glVertexAttrib3fv((GLuint)a[0], v);
        break;
      case 4:
        glVertexAttrib4fv((GLuint)a[0], v);
        break;
      }
    }
    i += 2;
    break;
  }
  case op::UNIFORM_1I: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform1i(it->second.second, (GLint)a[1]);
    i += 2;
    break;
  }
  case op::UNIFORM_2I: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform2i(it->second.second, (GLint)a[1], (GLint)a[2]);
    i += 3;
    break;
  }
  case op::UNIFORM_3I: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform3i(it->second.second, (GLint)a[1], (GLint)a[2], (GLint)a[3]);
    i += 4;
    break;
  }
  case op::UNIFORM_4I: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform4i(it->second.second, (GLint)a[1], (GLint)a[2], (GLint)a[3],
                  (GLint)a[4]);
    i += 5;
    break;
  }
  case op::UNIFORM_1F: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform1f(it->second.second, (GLfloat)a[1]);
    i += 2;
    break;
  }
  case op::UNIFORM_2F: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform2f(it->second.second, (GLfloat)a[1], (GLfloat)a[2]);
    i += 3;
    break;
  }
  case op::UNIFORM_3F: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform3f(it->second.second, (GLfloat)a[1], (GLfloat)a[2],
                  (GLfloat)a[3]);
    i += 4;
    break;
  }
  case op::UNIFORM_4F: {
    auto it = locIt(0);
    if (it != ctx.uniformLocations.end())
      glUniform4f(it->second.second, (GLfloat)a[1], (GLfloat)a[2],
                  (GLfloat)a[3], (GLfloat)a[4]);
    i += 5;
    break;
  }
  case op::UNIFORM_1IV:
  case op::UNIFORM_2IV:
  case op::UNIFORM_3IV:
  case op::UNIFORM_4IV: {
    int n = (int)opc - op::UNIFORM_1IV + 1;
    auto it = locIt(0);
    const GLTokenData *d = dataAt(1);
    if (it != ctx.uniformLocations.end() && d &&
        d->byteLength >= (size_t)n * 4) {
      GLsizei count = (GLsizei)(d->byteLength / ((size_t)n * 4));
      const GLint *v = (const GLint *)d->bytes;
      switch (n) {
      case 1:
        glUniform1iv(it->second.second, count, v);
        break;
      case 2:
        glUniform2iv(it->second.second, count, v);
        break;
      case 3:
        glUniform3iv(it->second.second, count, v);
        break;
      case 4:
        glUniform4iv(it->second.second, count, v);
        break;
      }
    }
    i += 2;
    break;
  }
  case op::UNIFORM_1FV:
  case op::UNIFORM_2FV:
  case op::UNIFORM_3FV:
  case op::UNIFORM_4FV: {
    int n = (int)opc - op::UNIFORM_1FV + 1;
    auto it = locIt(0);
    const GLTokenData *d = dataAt(1);
    if (it != ctx.uniformLocations.end() && d &&
        d->byteLength >= (size_t)n * 4) {
      GLsizei count = (GLsizei)(d->byteLength / ((size_t)n * 4));
      const GLfloat *v = (const GLfloat *)d->bytes;
      switch (n) {
      case 1:
        glUniform1fv(it->second.second, count, v);
        break;
      case 2:
        glUniform2fv(it->second.second, count, v);
        break;
      case 3:
        glUniform3fv(it->second.second, count, v);
        break;
      case 4:
        glUniform4fv(it->second.second, count, v);
        break;
      }
    }
    i += 2;
    break;
  }
  case op::UNIFORM_MATRIX_2FV:
  case op::UNIFORM_MATRIX_3FV:
  case op::UNIFORM_MATRIX_4FV: {
    int n = (int)opc - op::UNIFORM_MATRIX_2FV + 2;
    auto it = locIt(0);
    GLboolean transpose = (GLboolean)(unsigned)a[1];
    const GLTokenData *d = dataAt(2);
    if (it != ctx.uniformLocations.end() && d &&
        d->byteLength >= (size_t)n * n * 4) {
      GLsizei count = (GLsizei)(d->byteLength / ((size_t)n * n * 4));
      const GLfloat *v = (const GLfloat *)d->bytes;
      switch (n) {
      case 2:
        glUniformMatrix2fv(it->second.second, count, transpose, v);
        break;
      case 3:
        glUniformMatrix3fv(it->second.second, count, transpose, v);
        break;
      case 4:
        glUniformMatrix4fv(it->second.second, count, transpose, v);
        break;
      }
    }
    i += 3;
    break;
  }
  default:
    GLLOG_ERROR("unknown opcode %{public}d", (int)opc);
    return false; // 未知操作码无法推算参数长度，终止本批
  }
  return true;
}

void GLExecutor::execute(GLContext &ctx, const Batch &batch) {
  size_t i = 0;
  while (i < batch.opCount) {
    if (!execOp(ctx, batch, i)) {
      break;
    }
  }
  // 批末统一查询一次 GL 错误：原逐命令查询（一帧上百 op 时每条一次同步
  // 驱动往返）是高频渲染路径的主要开销；glErrorCount 计数语义保留，
  // 逐调用错误跟踪仅调试需要（本库实际只消费编译/链接/FBO 状态查询）
  if (glGetError() != GL_NO_ERROR) {
    ctx.glErrorCount++;
  }
}

int GLExecutor::getError(GLContext &ctx) {
  GLenum err = glGetError();
  if (err != GL_NO_ERROR)
    ctx.glErrorCount++;
  return (int)err;
}

int GLExecutor::getShaderParameterBool(GLContext &ctx, int shaderId, int pname) {
  auto it = ctx.shaders.find(shaderId);
  if (it == ctx.shaders.end())
    return 0;
  GLint v = 0;
  glGetShaderiv(it->second, (GLenum)pname, &v);
  return v;
}

std::string GLExecutor::getShaderInfoLog(GLContext &ctx, int shaderId) {
  auto it = ctx.shaders.find(shaderId);
  if (it == ctx.shaders.end())
    return "";
  GLint len = 0;
  glGetShaderiv(it->second, GL_INFO_LOG_LENGTH, &len);
  if (len <= 1)
    return "";
  std::string log((size_t)len, '\0');
  GLsizei written = 0;
  glGetShaderInfoLog(it->second, len, &written, log.data());
  log.resize(written > 0 ? (size_t)(written - 1) : 0);
  return log;
}

std::string GLExecutor::getShaderSource(GLContext &ctx, int shaderId) {
  auto it = ctx.shaders.find(shaderId);
  if (it == ctx.shaders.end())
    return "";
  GLint len = 0;
  glGetShaderiv(it->second, GL_SHADER_SOURCE_LENGTH, &len);
  if (len <= 1)
    return "";
  std::string src((size_t)len, '\0');
  GLsizei written = 0;
  glGetShaderSource(it->second, len, &written, src.data());
  src.resize(written > 0 ? (size_t)(written - 1) : 0);
  return src;
}

bool GLExecutor::isShader(GLContext &ctx, int shaderId) {
  auto it = ctx.shaders.find(shaderId);
  return it != ctx.shaders.end() && glIsShader(it->second);
}

int GLExecutor::getProgramParameterBool(GLContext &ctx, int programId, int pname) {
  auto it = ctx.programs.find(programId);
  if (it == ctx.programs.end())
    return 0;
  GLint v = 0;
  glGetProgramiv(it->second, (GLenum)pname, &v);
  return v;
}

int GLExecutor::getProgramParameterInt(GLContext &ctx, int programId, int pname) {
  auto it = ctx.programs.find(programId);
  if (it == ctx.programs.end())
    return 0;
  GLint v = 0;
  glGetProgramiv(it->second, (GLenum)pname, &v);
  return v;
}

std::string GLExecutor::getProgramInfoLog(GLContext &ctx, int programId) {
  auto it = ctx.programs.find(programId);
  if (it == ctx.programs.end())
    return "";
  GLint len = 0;
  glGetProgramiv(it->second, GL_INFO_LOG_LENGTH, &len);
  if (len <= 1)
    return "";
  std::string log((size_t)len, '\0');
  GLsizei written = 0;
  glGetProgramInfoLog(it->second, len, &written, log.data());
  log.resize(written > 0 ? (size_t)(written - 1) : 0);
  return log;
}

bool GLExecutor::isProgram(GLContext &ctx, int programId) {
  auto it = ctx.programs.find(programId);
  return it != ctx.programs.end() && glIsProgram(it->second);
}

GLint GLExecutor::getUniformLocation(GLContext &ctx, int programId,
                                     const std::string &name) {
  auto p = ctx.programs.find(programId);
  if (p == ctx.programs.end())
    return -1;
  GLint loc = glGetUniformLocation(p->second, name.c_str());
  if (loc < 0)
    return -1;
  int id = ctx.nextLocationId++;
  ctx.uniformLocations[id] = {p->second, loc};
  return id;
}

GLint GLExecutor::getAttribLocation(GLContext &ctx, int programId,
                                    const std::string &name) {
  auto p = ctx.programs.find(programId);
  if (p == ctx.programs.end())
    return -1;
  return glGetAttribLocation(p->second, name.c_str());
}

std::vector<double> GLExecutor::getUniform(GLContext &ctx, int programId,
                                           int locationId) {
  std::vector<double> out;
  auto p = ctx.programs.find(programId);
  auto loc = ctx.uniformLocations.find(locationId);
  if (p == ctx.programs.end() || loc == ctx.uniformLocations.end())
    return out;
  GLfloat buf[16] = {0};
  glGetUniformfv(p->second, loc->second.second, buf);
  // 由 uniform 类型决定返回分量数
  GLint count = 0;
  glGetProgramiv(p->second, GL_ACTIVE_UNIFORMS, &count);
  int comps = 1;
  for (GLint i = 0; i < count; i++) {
    char name[256];
    GLsizei length = 0;
    GLint size = 0;
    GLenum type = 0;
    glGetActiveUniform(p->second, (GLuint)i, sizeof(name), &length, &size,
                       &type, name);
    if (length == 0)
      continue;
    GLint probe = glGetUniformLocation(p->second, name);
    if (probe != loc->second.second)
      continue;
    switch (type) {
    case GL_FLOAT_VEC2:
    case GL_INT_VEC2:
    case GL_BOOL_VEC2:
      comps = 2;
      break;
    case GL_FLOAT_VEC3:
    case GL_INT_VEC3:
    case GL_BOOL_VEC3:
      comps = 3;
      break;
    case GL_FLOAT_VEC4:
    case GL_INT_VEC4:
    case GL_BOOL_VEC4:
    case GL_FLOAT_MAT2:
      comps = 4;
      break;
    case GL_FLOAT_MAT3:
      comps = 9;
      break;
    case GL_FLOAT_MAT4:
      comps = 16;
      break;
    default:
      comps = 1;
      break;
    }
    break;
  }
  out.assign(buf, buf + comps);
  return out;
}

bool GLExecutor::getActiveResource(GLContext &ctx, int programId, int index,
                                   bool isUniform, std::string &outName,
                                   int &outSize, int &outType) {
  auto p = ctx.programs.find(programId);
  if (p == ctx.programs.end())
    return false;
  char name[256];
  GLsizei length = 0;
  GLenum type = 0;
  GLint size = 0;
  if (isUniform) {
    glGetActiveUniform(p->second, (GLuint)index, sizeof(name), &length, &size,
                       &type, name);
  } else {
    glGetActiveAttrib(p->second, (GLuint)index, sizeof(name), &length, &size,
                      &type, name);
  }
  if (length == 0)
    return false;
  outName.assign(name, (size_t)length);
  outSize = size;
  outType = (int)type;
  return true;
}

int GLExecutor::getParameterInt(GLContext &ctx, int pname) {
  GLint v = 0;
  glGetIntegerv((GLenum)pname, &v);
  return v;
}

int GLExecutor::checkFramebufferStatus(GLContext &ctx, int target) {
  return (int)glCheckFramebufferStatus((GLenum)target);
}

void GLExecutor::readPixelsInto(GLContext &ctx, int x, int y, int w, int h,
                                uint8_t *out) {
  glReadPixels(x, y, w, h, GL_RGBA, GL_UNSIGNED_BYTE, out);
}

GLExecutor::SnapshotResult GLExecutor::takeSnapshot(GLContext &ctx,
                                                    [[maybe_unused]] int quality,
                                                    [[maybe_unused]] bool wantJpeg) {
  SnapshotResult res;
  int w = ctx.snapshotW;
  int h = ctx.snapshotH;
  if (w <= 0 || h <= 0 || !ctx.snapshotFbo) {
    return res;
  }
  std::vector<uint8_t> pixels((size_t)w * h * 4);
  glBindFramebuffer(GL_FRAMEBUFFER, ctx.snapshotFbo);
  glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  // PNG 编码器内部按 GL 行序（左下原点）翻转为图像行序
  res.png = encodePngRgba8(pixels.data(), w, h, w * 4);
  res.ok = !res.png.empty();
  res.width = w;
  res.height = h;
  return res;
}

} // namespace glreact

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

#include "ExGLCppTurboModule.h"

#include <hilog/log.h>
#include <native_window/external_window.h>
#include <sys/stat.h>
#include <sys/types.h>

#include <dirent.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <vector>

#include "png_encoder.h"

namespace glreact {

using namespace facebook;

const std::string ExGLCppTurboModule::NAME = "ExGL";

namespace {

constexpr const char *kSnapshotDirName = "gl-react";

#define HOSTFN(cls, method, argc)                                              \
  methodMap_[#method] = react::TurboModule::MethodMetadata{                     \
      argc, [](jsi::Runtime &rt, react::TurboModule &tm, const jsi::Value *args, \
               size_t count) -> jsi::Value {                                    \
        return static_cast<cls &>(tm).method(rt, args, count);                   \
      }}

double num(const jsi::Value &v) { return v.asNumber(); }

std::string str(jsi::Runtime &rt, const jsi::Value &v) {
  return v.asString(rt).utf8(rt);
}

std::shared_ptr<GLContext> ctxById(const jsi::Value &v) {
  return GLRegistry::instance().findById((uint64_t)num(v));
}

// 快照轮转上限：每个 context 仅保留最近 N 张 snap_*.png，防止 cache 无限累积
constexpr size_t kSnapshotKeepCount = 16;

// --- 同步查询方法的兜底返回值 ---
jsi::Value fallbackFalse(jsi::Runtime &) { return jsi::Value(false); }
jsi::Value fallbackZero(jsi::Runtime &) { return jsi::Value(0); }
jsi::Value fallbackNull(jsi::Runtime &) { return jsi::Value::null(); }
jsi::Value fallbackUndefined(jsi::Runtime &) { return jsi::Value::undefined(); }
jsi::Value fallbackEmptyString(jsi::Runtime &rt) {
  return jsi::String::createFromAscii(rt, "");
}
jsi::Value fallbackEmptyArray(jsi::Runtime &rt) {
  return jsi::Value(jsi::Array(rt, 0));
}

jsi::Value makeActiveResourceInfo(jsi::Runtime &rt, const std::string &name,
                                  int size, int type) {
  jsi::Object out(rt);
  out.setProperty(rt, "name", jsi::String::createFromUtf8(rt, name));
  out.setProperty(rt, "size", jsi::Value(size));
  out.setProperty(rt, "type", jsi::Value(type));
  return out;
}

/** 同步查询方法的公共骨架：
 *  1) count 守卫——TurboModuleRegistry 直调缺参时不再越界读 args（UB），
 *     直接返回兜底值（JS 代理恒传全参，正常路径行为不变）；
 *  2) 取 ctx 并判空；
 *  3) 持 ctx->mutex 并 ensureCurrent。
 *  任一步失败返回 fallback(rt)，成功则执行 run(ctx) 并返回其结果。
 *  原先 15 个方法重复的"取 ctx→判空→lock→ensureCurrent→兜底"样板由此收敛。 */
template <typename Fallback, typename Run>
jsi::Value withGLContext(jsi::Runtime &rt, const jsi::Value *args, size_t count,
                         size_t argc, Fallback fallback, Run run) {
  if (count < argc) {
    return fallback(rt);
  }
  std::shared_ptr<GLContext> ctx = ctxById(args[0]);
  if (!ctx) {
    return fallback(rt);
  }
  std::lock_guard<std::mutex> lock(ctx->mutex);
  if (!ctx->ensureCurrent()) {
    return fallback(rt);
  }
  return run(*ctx);
}

/** 快照轮转：删除当前 context 较旧的 snap_{ctxId}_{seq}.png，仅保留最近
 *  kSnapshotKeepCount 张（含刚写入的 latestSeq）。清理失败静默——不影响快照结果。 */
void pruneSnapshots(const std::string &dir, uint64_t ctxId, uint64_t latestSeq) {
  std::string prefix = "snap_" + std::to_string(ctxId) + "_";
  std::vector<uint64_t> seqs;
  DIR *d = opendir(dir.c_str());
  if (!d) {
    return;
  }
  while (dirent *e = readdir(d)) {
    std::string name = e->d_name;
    if (name.size() <= prefix.size() + 4 ||
        name.compare(0, prefix.size(), prefix) != 0 ||
        name.compare(name.size() - 4, 4, ".png") != 0) {
      continue;
    }
    seqs.push_back(strtoull(name.c_str() + prefix.size(), nullptr, 10));
  }
  closedir(d);
  if (seqs.size() <= kSnapshotKeepCount) {
    return;
  }
  std::sort(seqs.begin(), seqs.end());
  size_t drop = seqs.size() - kSnapshotKeepCount;
  for (size_t i = 0; i < drop; i++) {
    if (seqs[i] == latestSeq) {
      continue; // 防御：不删刚写入的文件
    }
    std::string path = dir + "/" + prefix + std::to_string(seqs[i]) + ".png";
    remove(path.c_str());
  }
}

} // namespace

ExGLCppTurboModule::ExGLCppTurboModule(rnoh::TurboModule::Context ctx,
                                       const std::string name)
    : rnoh::TurboModule(ctx, name) {
  HOSTFN(ExGLCppTurboModule, getContextFor, 1);
  HOSTFN(ExGLCppTurboModule, getSurfaceInfo, 1);
  HOSTFN(ExGLCppTurboModule, attachSurface, 2);
  HOSTFN(ExGLCppTurboModule, detachSurface, 1);
  HOSTFN(ExGLCppTurboModule, flush, 4);
  HOSTFN(ExGLCppTurboModule, getError, 1);
  HOSTFN(ExGLCppTurboModule, getShaderParameter, 3);
  HOSTFN(ExGLCppTurboModule, getShaderInfoLog, 2);
  HOSTFN(ExGLCppTurboModule, getShaderSource, 2);
  HOSTFN(ExGLCppTurboModule, isShader, 2);
  HOSTFN(ExGLCppTurboModule, getProgramParameterBool, 3);
  HOSTFN(ExGLCppTurboModule, getProgramParameterInt, 3);
  HOSTFN(ExGLCppTurboModule, getProgramInfoLog, 2);
  HOSTFN(ExGLCppTurboModule, isProgram, 2);
  HOSTFN(ExGLCppTurboModule, getUniformLocation, 3);
  HOSTFN(ExGLCppTurboModule, getAttribLocation, 3);
  HOSTFN(ExGLCppTurboModule, getUniform, 3);
  HOSTFN(ExGLCppTurboModule, getActiveUniform, 3);
  HOSTFN(ExGLCppTurboModule, getActiveAttrib, 3);
  HOSTFN(ExGLCppTurboModule, getParameter, 2);
  HOSTFN(ExGLCppTurboModule, checkFramebufferStatus, 2);
  HOSTFN(ExGLCppTurboModule, readPixels, 5);
  HOSTFN(ExGLCppTurboModule, readPixelsInto, 6);
  HOSTFN(ExGLCppTurboModule, snapshotToFile, 4);
  HOSTFN(ExGLCppTurboModule, snapshotAsDataURL, 3);
  HOSTFN(ExGLCppTurboModule, destroyContext, 1);
  HOSTFN(ExGLCppTurboModule, getStats, 0);
}

jsi::Value ExGLCppTurboModule::makeSurfaceInfo(
    jsi::Runtime &rt, const std::shared_ptr<GLContext> &ctx) {
  // 共享字段在锁内快照为局部值后再构造返回对象，避免与 UI 线程的
  // surface 状态写并发（attach/detach 在 UI/JS 线程持 mutex 写入）
  uint64_t id = 0;
  bool ok = false;
  int width = 0, height = 0;
  if (ctx) {
    std::lock_guard<std::mutex> lock(ctx->mutex);
    id = ctx->id;
    // ok 必须含非 0 尺寸：attach 早期几何未就绪时 JS 拿 0×0 建上下文会整屏黑
    ok = ctx->surfaceAvailable && !ctx->contextLost && ctx->surfaceWidth > 0 &&
         ctx->surfaceHeight > 0;
    width = ctx->surfaceWidth;
    height = ctx->surfaceHeight;
  }
  jsi::Object obj(rt);
  obj.setProperty(rt, "contextId", jsi::Value((double)id));
  obj.setProperty(rt, "ok", jsi::Value(ok));
  obj.setProperty(rt, "width", jsi::Value((double)width));
  obj.setProperty(rt, "height", jsi::Value((double)height));
  return obj;
}

std::vector<double> ExGLCppTurboModule::readNumberArray(
    jsi::Runtime &rt, const jsi::Value &value) {
  std::vector<double> out;
  if (!value.isObject()) {
    return out;
  }
  jsi::Array arr = value.getObject(rt).asArray(rt);
  size_t len = arr.size(rt);
  out.reserve(len);
  for (size_t i = 0; i < len; i++) {
    out.push_back(arr.getValueAtIndex(rt, i).asNumber());
  }
  return out;
}

std::vector<std::string> ExGLCppTurboModule::readStringArray(
    jsi::Runtime &rt, const jsi::Value &value) {
  std::vector<std::string> out;
  if (!value.isObject()) {
    return out;
  }
  jsi::Array arr = value.getObject(rt).asArray(rt);
  size_t len = arr.size(rt);
  out.reserve(len);
  for (size_t i = 0; i < len; i++) {
    out.push_back(arr.getValueAtIndex(rt, i).asString(rt).utf8(rt));
  }
  return out;
}

std::vector<GLTokenData> ExGLCppTurboModule::readDataArray(
    jsi::Runtime &rt, const jsi::Value &value,
    std::vector<jsi::ArrayBuffer> &keepAlive) {
  std::vector<GLTokenData> out;
  if (!value.isObject()) {
    return out;
  }
  jsi::Array arr = value.getObject(rt).asArray(rt);
  size_t len = arr.size(rt);
  out.reserve(len);
  keepAlive.reserve(len);
  for (size_t i = 0; i < len; i++) {
    jsi::Value item = arr.getValueAtIndex(rt, i);
    if (item.isObject()) {
      keepAlive.push_back(item.getObject(rt).getArrayBuffer(rt));
      jsi::ArrayBuffer &ab = keepAlive.back();
      out.push_back(GLTokenData{op::DATA_UINT8, ab.data(rt), ab.size(rt)});
    } else {
      out.push_back(GLTokenData{op::DATA_NULL, nullptr, 0});
    }
  }
  return out;
}

jsi::Value ExGLCppTurboModule::getContextFor(jsi::Runtime &rt, Args args,
                                             size_t count) {
  if (count < 1)
    return jsi::Value::undefined();
  auto ctx = GLRegistry::instance().findByXComponentId(str(rt, args[0]));
  if (ctx) {
    // JS 轮询时同步刷新几何：attach 早期 buffer geometry 可能还是 0×0，
    // ArkTS onSurfaceChanged 显式 SET 后由此读回，JS 才能拿到非 0 尺寸建上下文
    std::lock_guard<std::mutex> lock(ctx->mutex);
    ctx->refreshGeometryLocked();
  }
  return makeSurfaceInfo(rt, ctx);
}

jsi::Value ExGLCppTurboModule::getSurfaceInfo(jsi::Runtime &rt, Args args,
                                              size_t count) {
  if (count < 1)
    return jsi::Value::undefined();
  return makeSurfaceInfo(rt, ctxById(args[0]));
}

jsi::Value ExGLCppTurboModule::attachSurface(jsi::Runtime &rt, Args args,
                                             size_t count) {
  if (count < 2)
    return jsi::Value::undefined();
  std::string xcomponentId = str(rt, args[0]);
  std::string surfaceIdStr = str(rt, args[1]);
  uint64_t surfaceId = strtoull(surfaceIdStr.c_str(), nullptr, 10);
  uint64_t contextId = 0;
  OHNativeWindow *window = nullptr;
  if (surfaceId != 0 &&
      OH_NativeWindow_CreateNativeWindowFromSurfaceId(surfaceId, &window) ==
          0 &&
      window != nullptr) {
    contextId = GLRegistry::instance().attachSurface(xcomponentId, window);
    if (contextId == 0) {
      OH_NativeWindow_DestroyNativeWindow(window);
    }
  }
  auto ctx = contextId ? GLRegistry::instance().findById(contextId) : nullptr;
  return makeSurfaceInfo(rt, ctx);
}

jsi::Value ExGLCppTurboModule::detachSurface(jsi::Runtime &rt, Args args,
                                             size_t count) {
  if (count >= 1) {
    GLRegistry::instance().detachSurface(str(rt, args[0]));
  }
  return jsi::Value::undefined();
}

jsi::Value ExGLCppTurboModule::flush(jsi::Runtime &rt, Args args, size_t count) {
  if (count < 4)
    return jsi::Value::undefined();
  auto ctx = ctxById(args[0]);
  if (!ctx) {
    return makeSurfaceInfo(rt, nullptr);
  }
  GLExecutor::Batch batch;
  std::vector<double> ops = readNumberArray(rt, args[1]);
  std::vector<std::string> strs = readStringArray(rt, args[2]);
  std::vector<jsi::ArrayBuffer> keepAlive;
  std::vector<GLTokenData> datas = readDataArray(rt, args[3], keepAlive);
  batch.ops = ops.data();
  batch.opCount = ops.size();
  batch.strs = &strs;
  batch.datas = &datas;

  {
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (ctx->ensureCurrent()) {
      executor_.execute(*ctx, batch);
    }
  }
  // 锁已释放；makeSurfaceInfo 内部自持锁快照
  return makeSurfaceInfo(rt, ctx);
}

jsi::Value ExGLCppTurboModule::getError(jsi::Runtime &rt, Args args,
                                        size_t count) {
  return withGLContext(
      rt, args, count, 1,
      // GL_INVALID_OPERATION when lost
      [](jsi::Runtime &) { return jsi::Value((int)0x0006); },
      [&](GLContext &ctx) { return jsi::Value(executor_.getError(ctx)); });
}

jsi::Value ExGLCppTurboModule::getShaderParameter(jsi::Runtime &rt, Args args,
                                                  size_t count) {
  return withGLContext(
      rt, args, count, 3, fallbackFalse,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.getShaderParameterBool(
                              ctx, (int)num(args[1]), (int)num(args[2])) != 0);
      });
}

jsi::Value ExGLCppTurboModule::getShaderInfoLog(jsi::Runtime &rt, Args args,
                                                size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackEmptyString,
      [&](GLContext &ctx) {
        return jsi::String::createFromUtf8(
            rt, executor_.getShaderInfoLog(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::getShaderSource(jsi::Runtime &rt, Args args,
                                               size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackEmptyString,
      [&](GLContext &ctx) {
        return jsi::String::createFromUtf8(
            rt, executor_.getShaderSource(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::isShader(jsi::Runtime &rt, Args args,
                                        size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackFalse,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.isShader(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::getProgramParameterBool(jsi::Runtime &rt,
                                                       Args args, size_t count) {
  return withGLContext(
      rt, args, count, 3, fallbackFalse,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.getProgramParameterBool(
                              ctx, (int)num(args[1]), (int)num(args[2])) != 0);
      });
}

jsi::Value ExGLCppTurboModule::getProgramParameterInt(jsi::Runtime &rt,
                                                      Args args, size_t count) {
  return withGLContext(
      rt, args, count, 3, fallbackZero,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.getProgramParameterInt(
            ctx, (int)num(args[1]), (int)num(args[2])));
      });
}

jsi::Value ExGLCppTurboModule::getProgramInfoLog(jsi::Runtime &rt, Args args,
                                                 size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackEmptyString,
      [&](GLContext &ctx) {
        return jsi::String::createFromUtf8(
            rt, executor_.getProgramInfoLog(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::isProgram(jsi::Runtime &rt, Args args,
                                         size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackFalse,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.isProgram(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::getUniformLocation(jsi::Runtime &rt, Args args,
                                                  size_t count) {
  return withGLContext(
      rt, args, count, 3, fallbackNull,
      [&](GLContext &ctx) {
        GLint id = executor_.getUniformLocation(ctx, (int)num(args[1]),
                                                str(rt, args[2]));
        if (id < 0) {
          return jsi::Value::null();
        }
        return jsi::Value((double)id);
      });
}

jsi::Value ExGLCppTurboModule::getAttribLocation(jsi::Runtime &rt, Args args,
                                                 size_t count) {
  return withGLContext(
      rt, args, count, 3,
      [](jsi::Runtime &) { return jsi::Value(-1); },
      [&](GLContext &ctx) {
        return jsi::Value(
            (double)executor_.getAttribLocation(ctx, (int)num(args[1]),
                                                str(rt, args[2])));
      });
}

jsi::Value ExGLCppTurboModule::getUniform(jsi::Runtime &rt, Args args,
                                          size_t count) {
  return withGLContext(
      rt, args, count, 3, fallbackEmptyArray,
      [&](GLContext &ctx) {
        auto vals = executor_.getUniform(ctx, (int)num(args[1]), (int)num(args[2]));
        jsi::Array arr(rt, vals.size());
        for (size_t i = 0; i < vals.size(); i++) {
          arr.setValueAtIndex(rt, i, jsi::Value(vals[i]));
        }
        return arr;
      });
}

jsi::Value ExGLCppTurboModule::getActiveUniform(jsi::Runtime &rt, Args args,
                                                size_t count) {
  std::string name;
  int size = 0, type = 0;
  withGLContext(
      rt, args, count, 3, fallbackUndefined,
      [&](GLContext &ctx) {
        executor_.getActiveResource(ctx, (int)num(args[1]), (int)num(args[2]),
                                    true, name, size, type);
        return jsi::Value::undefined();
      });
  return makeActiveResourceInfo(rt, name, size, type);
}

jsi::Value ExGLCppTurboModule::getActiveAttrib(jsi::Runtime &rt, Args args,
                                               size_t count) {
  std::string name;
  int size = 0, type = 0;
  withGLContext(
      rt, args, count, 3, fallbackUndefined,
      [&](GLContext &ctx) {
        executor_.getActiveResource(ctx, (int)num(args[1]), (int)num(args[2]),
                                    false, name, size, type);
        return jsi::Value::undefined();
      });
  return makeActiveResourceInfo(rt, name, size, type);
}

jsi::Value ExGLCppTurboModule::getParameter(jsi::Runtime &rt, Args args,
                                            size_t count) {
  return withGLContext(
      rt, args, count, 2,
      [](jsi::Runtime &) { return jsi::Value(-1); },
      [&](GLContext &ctx) {
        return jsi::Value(executor_.getParameterInt(ctx, (int)num(args[1])));
      });
}

jsi::Value ExGLCppTurboModule::checkFramebufferStatus(jsi::Runtime &rt,
                                                      Args args, size_t count) {
  return withGLContext(
      rt, args, count, 2, fallbackZero,
      [&](GLContext &ctx) {
        return jsi::Value(executor_.checkFramebufferStatus(ctx, (int)num(args[1])));
      });
}

// 兼容面：逐字节转 JS number 数组（w*h*4 次 setValueAtIndex），大分辨率下开销显著；
// 大数据场景请改用快路径 readPixelsInto（Spec 声明面，直接写入 ArrayBuffer）
jsi::Value ExGLCppTurboModule::readPixels(jsi::Runtime &rt, Args args,
                                          size_t count) {
  if (count < 5)
    return jsi::Array(rt, 0);
  auto ctx = ctxById(args[0]);
  if (!ctx)
    return jsi::Array(rt, 0);
  int x = (int)num(args[1]), y = (int)num(args[2]);
  int w = (int)num(args[3]), h = (int)num(args[4]);
  if (w <= 0 || h <= 0)
    return jsi::Array(rt, 0);
  std::vector<uint8_t> pixels((size_t)w * h * 4);
  {
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (!ctx->ensureCurrent())
      return jsi::Array(rt, 0);
    executor_.readPixelsInto(*ctx, x, y, w, h, pixels.data());
  }
  jsi::Array arr(rt, pixels.size());
  for (size_t i = 0; i < pixels.size(); i++) {
    arr.setValueAtIndex(rt, i, jsi::Value((double)pixels[i]));
  }
  return arr;
}

jsi::Value ExGLCppTurboModule::readPixelsInto(jsi::Runtime &rt, Args args,
                                              size_t count) {
  if (count < 6)
    return jsi::Value::undefined();
  auto ctx = ctxById(args[0]);
  if (!ctx)
    return jsi::Value::undefined();
  jsi::ArrayBuffer out = args[5].getObject(rt).getArrayBuffer(rt);
  std::lock_guard<std::mutex> lock(ctx->mutex);
  if (!ctx->ensureCurrent())
    return jsi::Value::undefined();
  executor_.readPixelsInto(*ctx, (int)num(args[1]), (int)num(args[2]),
                           (int)num(args[3]), (int)num(args[4]), out.data(rt));
  return jsi::Value::undefined();
}

std::string ExGLCppTurboModule::ensureSnapshotDir(const std::string &cacheDir) {
  std::string dir = cacheDir;
  while (!dir.empty() && (dir.back() == '/' || dir.back() == '\\')) {
    dir.pop_back();
  }
  std::string full = dir + "/" + kSnapshotDirName;
  mkdir(dir.c_str(), 0770);
  mkdir(full.c_str(), 0770);
  return full;
}

jsi::Value ExGLCppTurboModule::snapshotInternal(jsi::Runtime &rt, Args args,
                                                size_t count, bool asDataURL) {
  if (count < 1) {
    throw jsi::JSError(rt, "ExGL: snapshot on unknown context");
  }
  auto ctx = ctxById(args[0]);
  if (!ctx) {
    throw jsi::JSError(rt, "ExGL: snapshot on unknown context");
  }
  std::string format = count > 2 ? str(rt, args[2]) : "image/png";
  double quality = count > 3 ? num(args[3]) : 0.92;
  bool wantJpeg = format.find("jpeg") != std::string::npos ||
                  format.find("jpg") != std::string::npos;
  if (wantJpeg) {
    // 原生路径无 JPEG 编码器（鸿蒙 NDK Image Kit 编码 API 需 napi/ArkTS 层），
    // 回退 PNG：内容一致，仅封装格式不同（差异在报告中说明）
    OH_LOG_Print(LOG_APP, LOG_WARN, 0x0000, "ExGL",
                 "snapshot: JPEG encoder unavailable on OHOS, falling back to PNG");
    wantJpeg = false;
  }
  GLExecutor::SnapshotResult snap;
  {
    std::lock_guard<std::mutex> lock(ctx->mutex);
    if (!ctx->ensureCurrent()) {
      throw jsi::JSError(rt, "ExGL: surface is not available for snapshot");
    }
    snap = executor_.takeSnapshot(*ctx, (int)(quality * 100), wantJpeg);
  }
  if (!snap.ok) {
    throw jsi::JSError(rt, "ExGL: snapshot failed (no frame captured yet)");
  }
  jsi::Object out(rt);
  if (asDataURL) {
    std::string b64 = base64Encode(snap.png.data(), snap.png.size());
    out.setProperty(rt, "dataUrl", jsi::String::createFromUtf8(
                                        rt, "data:image/png;base64," + b64));
  } else {
    std::string cacheDir = count > 1 ? str(rt, args[1]) : "";
    std::string dir = ensureSnapshotDir(cacheDir);
    uint64_t seq = ++snapshotCounter_;
    std::string path = dir + "/snap_" + std::to_string(ctx->id) + "_" +
                       std::to_string(seq) + ".png";
    FILE *f = fopen(path.c_str(), "wb");
    if (!f) {
      throw jsi::JSError(rt, "ExGL: cannot write snapshot file: " + path);
    }
    fwrite(snap.png.data(), 1, snap.png.size(), f);
    fclose(f);
    // 轮转：仅保留本 context 最近 kSnapshotKeepCount 张，防 cache 无限累积
    pruneSnapshots(dir, ctx->id, seq);
    out.setProperty(rt, "uri", jsi::String::createFromUtf8(rt, "file://" + path));
  }
  out.setProperty(rt, "width", jsi::Value((double)snap.width));
  out.setProperty(rt, "height", jsi::Value((double)snap.height));
  return out;
}

jsi::Value ExGLCppTurboModule::snapshotToFile(jsi::Runtime &rt, Args args,
                                              size_t count) {
  return snapshotInternal(rt, args, count, false);
}

jsi::Value ExGLCppTurboModule::snapshotAsDataURL(jsi::Runtime &rt, Args args,
                                                 size_t count) {
  return snapshotInternal(rt, args, count, true);
}

jsi::Value ExGLCppTurboModule::destroyContext(jsi::Runtime &rt, Args args,
                                              size_t count) {
  if (count >= 1) {
    GLRegistry::instance().destroyContext((uint64_t)num(args[0]));
  }
  return jsi::Value::undefined();
}

jsi::Value ExGLCppTurboModule::getStats(jsi::Runtime &rt, Args args,
                                        size_t count) {
  jsi::Object out(rt);
  out.setProperty(rt, "contextsCreated", jsi::Value(
      (double)GLRegistry::instance().statsContextsCreated));
  return out;
}

} // namespace glreact

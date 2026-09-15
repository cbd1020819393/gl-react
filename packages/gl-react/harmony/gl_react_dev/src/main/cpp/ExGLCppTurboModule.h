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
 * ExGL C++ TurboModule — JSI 直达的 WebGL1 命令执行器。
 *
 * 不走 codegen 生成的 ArkTSTurboModule 代理（那会把每个 GL 调转发进 ArkTS
 * 再折回 native，一帧上百次调用不可接受），而是直接在 JSI 层解析参数并在
 * 当前线程执行 EGL/GLES。运行时实际参数/返回形状以本文件为准（Spec 仅用于
 * codegen 通过与文档），datas 元素为 ArrayBuffer。
 */
#pragma once

#include "RNOH/TurboModule.h"
#include "gl_webgl_context.h"

namespace glreact {

class ExGLCppTurboModule : public rnoh::TurboModule {
public:
  ExGLCppTurboModule(rnoh::TurboModule::Context ctx, const std::string name);

  static const std::string NAME;

private:
  GLExecutor executor_;
  uint64_t snapshotCounter_ = 0;

  using JsiValue = facebook::jsi::Value;
  using Runtime = facebook::jsi::Runtime;
  using Args = const facebook::jsi::Value *;

  JsiValue getContextFor(Runtime &rt, Args args, size_t count);
  JsiValue getSurfaceInfo(Runtime &rt, Args args, size_t count);
  JsiValue attachSurface(Runtime &rt, Args args, size_t count);
  JsiValue detachSurface(Runtime &rt, Args args, size_t count);
  JsiValue flush(Runtime &rt, Args args, size_t count);
  JsiValue getError(Runtime &rt, Args args, size_t count);
  JsiValue getShaderParameter(Runtime &rt, Args args, size_t count);
  JsiValue getShaderInfoLog(Runtime &rt, Args args, size_t count);
  JsiValue getShaderSource(Runtime &rt, Args args, size_t count);
  JsiValue isShader(Runtime &rt, Args args, size_t count);
  JsiValue getProgramParameterBool(Runtime &rt, Args args, size_t count);
  JsiValue getProgramParameterInt(Runtime &rt, Args args, size_t count);
  JsiValue getProgramInfoLog(Runtime &rt, Args args, size_t count);
  JsiValue isProgram(Runtime &rt, Args args, size_t count);
  JsiValue getUniformLocation(Runtime &rt, Args args, size_t count);
  JsiValue getAttribLocation(Runtime &rt, Args args, size_t count);
  JsiValue getUniform(Runtime &rt, Args args, size_t count);
  JsiValue getActiveUniform(Runtime &rt, Args args, size_t count);
  JsiValue getActiveAttrib(Runtime &rt, Args args, size_t count);
  JsiValue getParameter(Runtime &rt, Args args, size_t count);
  JsiValue checkFramebufferStatus(Runtime &rt, Args args, size_t count);
  JsiValue readPixels(Runtime &rt, Args args, size_t count);
  JsiValue readPixelsInto(Runtime &rt, Args args, size_t count);
  JsiValue snapshotToFile(Runtime &rt, Args args, size_t count);
  JsiValue snapshotAsDataURL(Runtime &rt, Args args, size_t count);
  JsiValue destroyContext(Runtime &rt, Args args, size_t count);
  JsiValue getStats(Runtime &rt, Args args, size_t count);

  JsiValue makeSurfaceInfo(Runtime &rt, const std::shared_ptr<GLContext> &ctx);
  std::vector<double> readNumberArray(Runtime &rt,
                                      const facebook::jsi::Value &value);
  std::vector<std::string> readStringArray(Runtime &rt,
                                           const facebook::jsi::Value &value);
  std::vector<GLTokenData> readDataArray(Runtime &rt,
                                         const facebook::jsi::Value &value,
                                         std::vector<
                                             facebook::jsi::ArrayBuffer> &
                                             keepAlive);
  JsiValue snapshotInternal(Runtime &rt, Args args, size_t count, bool asDataURL);
  static std::string ensureSnapshotDir(const std::string &cacheDir);
};

} // namespace glreact

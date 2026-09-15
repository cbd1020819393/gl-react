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

#ifndef GLREACTDEVPACKAGE_H
#define GLREACTDEVPACKAGE_H

#pragma once

#include "generated/RNOHGeneratedPackage.h"

#include "ExGLCppTurboModule.h"

namespace rnoh {

/**
 * TurboModule 工厂：
 *  - "ExGL" → 纯 C++ JSI 模块（GL 命令执行器，高频路径不走 ArkTS）；
 *  - "ExGLImageLoader" → codegen 生成的 ArkTSTurboModule 代理（Image Kit 解码）。
 *
 * 覆盖关系说明：父类 RNOHGeneratedPackage 内的 codegen delegate 同样把 "ExGL"
 * 映射到 ArkTS 代理；RNOH 先查询本包 delegate（自定义注册先于 codegen 生成），
 * 故 C++ 模块生效（03 阶段集成验证确认）。升级 RNOH 若查询顺序反转会静默
 * 回退 ArkTS 代理，升级后需回归验证 flush 高频路径仍走 C++。
 */
class GlReactDevTurboModuleFactoryDelegate : public TurboModuleFactoryDelegate {
  public:
    SharedTurboModule createTurboModule(Context ctx, const std::string &name) const override {
        if (name == glreact::ExGLCppTurboModule::NAME) {
            return std::make_shared<glreact::ExGLCppTurboModule>(ctx, name);
        }
        if (name == "ExGLImageLoader") {
            return std::make_shared<ExGLImageLoader>(ctx, name);
        }
        return nullptr;
    }
};

class GlReactDevPackage : public RNOHGeneratedPackage {
  public:
    using Super = RNOHGeneratedPackage;
    using Super::Super;

    std::unique_ptr<TurboModuleFactoryDelegate> createTurboModuleFactoryDelegate() override {
        return std::make_unique<GlReactDevTurboModuleFactoryDelegate>();
    }
};
} // namespace rnoh
#endif //GLREACTDEVPACKAGE_H

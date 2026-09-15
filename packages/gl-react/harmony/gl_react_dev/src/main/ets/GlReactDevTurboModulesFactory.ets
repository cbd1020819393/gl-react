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
 * GlReactDev ArkTS Package — 自动链接入口（index.ets default 导出）。
 *
 * 注册三类能力：
 *  1. ExGLView 组件的 DescriptorWrapper 工厂（Fabric 路由必需）；
 *  2. ExGLImageLoader ArkTS TurboModule（Image Kit 图片解码）；
 *  3. ExGLView 组件的 WrappedBuilder（ArkUI 构建）。
 * "ExGL"（C++ TurboModule）由 cpp 侧 GlReactDevPackage 注册，不在此处。
 */
import { RNOHPackage, ComponentBuilderContext } from '@rnoh/react-native-openharmony';
import type {
  UITurboModule,
  UITurboModuleContext,
  DescriptorWrapperFactoryByDescriptorType,
  DescriptorWrapperFactoryByDescriptorTypeCtx
} from '@rnoh/react-native-openharmony/ts';
import { RNC } from './generated';
import { GlReactView } from './GlReactView';
import { GlImageLoaderModule } from './GlImageLoaderModule';

@Builder
function buildGlReactView(ctx: ComponentBuilderContext) {
  GlReactView({
    ctx: ctx.rnComponentContext,
    tag: ctx.tag
  })
}

export class GlReactDevPackage extends RNOHPackage {
  createDescriptorWrapperFactoryByDescriptorType(ctx: DescriptorWrapperFactoryByDescriptorTypeCtx):
    DescriptorWrapperFactoryByDescriptorType {
    const result: DescriptorWrapperFactoryByDescriptorType = {};
    result[RNC.ExGLView.NAME] = (descriptorCtx) =>
      new RNC.ExGLView.DescriptorWrapper(descriptorCtx.descriptor);
    return result;
  }

  getUITurboModuleFactoryByNameMap(): Map<string, (ctx: UITurboModuleContext) => UITurboModule | null> {
    return new Map<string, (ctx: UITurboModuleContext) => UITurboModule | null>()
      .set(GlImageLoaderModule.NAME, (ctx: UITurboModuleContext) => new GlImageLoaderModule(ctx));
  }

  createWrappedCustomRNComponentBuilderByComponentNameMap(): Map<string, WrappedBuilder<[ComponentBuilderContext]>> {
    return new Map().set(GlReactView.NAME, wrapBuilder(buildGlReactView));
  }
}

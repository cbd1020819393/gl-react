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
 * GlReactView — expo-gl GLView 的鸿蒙等价组件。
 *
 * 内嵌 XComponent(type=SURFACE)，通过 XComponentController 子类覆写
 * onSurfaceCreated/onSurfaceDestroyed 拿到 surfaceId，经 DeviceEvent
 * ('exglSurface') 通知 JS 侧，由 JS 调 ExGL.attachSurface(xcomponentId,
 * surfaceId)（C++ TurboModule，OH_NativeWindow_CreateNativeWindowFromSurfaceId
 * 建窗）接线 GL 执行器。JS 侧同时轮询 getContextFor 兜底。
 *
 * 说明：当前 SDK 已移除经典 libraryname 流程依赖的
 * OH_NativeXComponent_GetNativeXComponent(env, exports, ...) 声明，
 * 故采用 controller 回调 + surfaceId 建窗（API 12 能力）。
 */
import { RNComponentContext, RNViewBase } from '@rnoh/react-native-openharmony';
import { RNC } from './generated';

class GlXComponentController extends XComponentController {
  public view?: GlReactView;

  onSurfaceCreated(surfaceId: string): void {
    this.view?.handleSurfaceCreated(surfaceId);
  }

  onSurfaceChanged(surfaceId: string, rect: SurfaceRect): void {
    // 坑（lessons）：surface 建立初期 buffer geometry 可能为 0×0，必须显式 SET
    // 布局尺寸，否则 GL 执行器 GET 到 0 → EGL surface 按 0 尺寸创建 → 黑屏且无
    // 任何报错。SET 后发 changed 事件，JS 轮询据此拿到非 0 尺寸建上下文。
    this.setXComponentSurfaceRect(rect);
    this.view?.handleSurfaceChanged(rect);
  }

  onSurfaceDestroyed(surfaceId: string): void {
    this.view?.handleSurfaceDestroyed();
  }
}

@Component
export struct GlReactView {
  public static readonly NAME = RNC.ExGLView.NAME;
  public ctx!: RNComponentContext;
  public tag: number = 0;
  @State descriptorWrapper: RNC.ExGLView.DescriptorWrapper =
    {} as RNC.ExGLView.DescriptorWrapper;
  @State xcomponentId: string = '';
  private cleanUpCallbacks: (() => void)[] = [];
  private mXComponentController: GlXComponentController = new GlXComponentController();

  aboutToAppear() {
    this.mXComponentController.view = this;
    this.onDescriptorWrapperChange(
      this.ctx.descriptorRegistry.findDescriptorWrapperByTag<RNC.ExGLView.DescriptorWrapper>(this.tag)!);
    this.cleanUpCallbacks.push(this.ctx.descriptorRegistry.subscribeToDescriptorChanges(
      this.tag,
      (descriptor) => {
        this.onDescriptorWrapperChange(new RNC.ExGLView.DescriptorWrapper(descriptor!));
      }));
  }

  aboutToDisappear() {
    this.handleSurfaceDestroyed();
    this.cleanUpCallbacks.forEach((cb) => cb());
    this.cleanUpCallbacks = [];
  }

  private onDescriptorWrapperChange(descriptorWrapper: RNC.ExGLView.DescriptorWrapper) {
    this.descriptorWrapper = descriptorWrapper;
    const newId = descriptorWrapper.props?.xcomponentId;
    if (typeof newId === 'string' && newId !== '' && newId !== this.xcomponentId) {
      this.xcomponentId = newId;
    }
  }

  handleSurfaceCreated(surfaceId: string): void {
    if (this.xcomponentId === '') {
      return;
    }
    this.ctx.rnInstance.emitDeviceEvent('exglSurface', {
      xcomponentId: this.xcomponentId,
      surfaceId: surfaceId,
      type: 'created'
    });
  }

  handleSurfaceDestroyed(): void {
    if (this.xcomponentId === '') {
      return;
    }
    this.ctx.rnInstance.emitDeviceEvent('exglSurface', {
      xcomponentId: this.xcomponentId,
      type: 'destroyed'
    });
  }

  handleSurfaceChanged(rect: SurfaceRect): void {
    if (this.xcomponentId === '') {
      return;
    }
    this.ctx.rnInstance.emitDeviceEvent('exglSurface', {
      xcomponentId: this.xcomponentId,
      type: 'changed',
      width: rect.surfaceWidth,
      height: rect.surfaceHeight
    });
  }

  build() {
    RNViewBase({
      ctx: this.ctx,
      tag: this.tag
    }) {
      Stack() {
        if (this.xcomponentId !== '') {
          XComponent({
            id: 'exgl-' + this.tag,
            type: XComponentType.SURFACE,
            controller: this.mXComponentController
          })
            .width('100%')
            .height('100%')
            .onLoad(() => {
              // surface 回调由 GlXComponentController 覆写接管
            })
        }
      }
      .width('100%')
      .height('100%')
    }
  }
}

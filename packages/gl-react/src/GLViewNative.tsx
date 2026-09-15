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
 * GLViewNative — gl-react-expo/lib/GLViewNative 的鸿蒙等价实现。
 *
 * 对 gl-react Surface 暴露与 expo-gl GLView 相同的契约：
 *  - props: onContextCreate(gl) / onContextFailure(e) / onContextLost() / onContextRestored(gl) / debug / style
 *  - ref 方法: captureAsDataURL / captureAsBlob / capture 委托
 *  - beforeDraw/afterDraw 钩子（afterDraw 里 gl.flush() + gl.endFrameEXP()）
 *
 * 与原生层的关系：渲染 <ExGLView xcomponentId>（ArkTS XComponent 容器），
 * JS 侧轮询 ExGL.getContextFor 拿 contextId 后构建 WebGLRenderingContextOHOS。
 * surface 因页面切换被销毁时 flush 返回 ok=false → 上报 onContextLost；
 * 重新创建（同一 contextId）→ 上报 onContextRestored。
 */
import React, { Component } from "react";
import { DeviceEventEmitter, View } from "react-native";
import ExGL, { type Spec as ExGLSpec } from "./specs/v1/NativeExGL";
import ExGLImageLoader from "./specs/v1/NativeExGLImageLoader";
import { WebGLRenderingContextOHOS } from "./WebGLRenderingContextOHOS";
import ExGLViewNative from "./specs/v1/ExGLViewNativeComponent";

let xcSeq = 0;

type Props = {
  onContextCreate: (gl: WebGLRenderingContext) => void;
  onContextFailure?: (e: Error) => void;
  onContextLost?: () => void;
  onContextRestored?: (gl: WebGLRenderingContext) => void;
  style?: any;
  children?: any;
  debug?: boolean;
  [key: string]: any;
};

type GLViewInfo = {
  contextId: number;
  ok: boolean;
  width: number;
  height: number;
};

export default class GLViewNative extends Component<Props> {
  static displayName = "GLViewNative";

  _xcId: string = `exgl-${++xcSeq}-${Math.floor(Math.random() * 1e9)}`;
  // codegen 的 TurboModule 类型为 Spec | null（运行时已就绪，见 prepareGLRuntime 同类模式）
  _exgl: ExGLSpec = ExGL as ExGLSpec;
  _gl: WebGLRenderingContextOHOS | null = null;
  _glW: number = 0;
  _glH: number = 0;
  _pollTimer: any = null;
  _pollTries = 0;
  _unmounted = false;
  _reportedLost = false;
  _surfaceEventSub: { remove: () => void } | null = null;
  ref: any = null;

  componentDidMount() {
    // ArkTS GlReactView 在 XComponent surface 创建/销毁时经 DeviceEvent 通知，
    // 由这里调用 attachSurface（幂等）完成原生接线
    this._surfaceEventSub = DeviceEventEmitter.addListener(
      "exglSurface",
      (e: any) => {
        if (!e || e.xcomponentId !== this._xcId || this._unmounted) {
          return;
        }
        if (e.type === "created" && typeof e.surfaceId === "string") {
          try {
            this._exgl.attachSurface(this._xcId, e.surfaceId);
          } catch (err) {
            // 轮询兜底会在 surface 就绪后继续工作
          }
        } else if (e.type === "destroyed") {
          // 标记 surface 不可用：下一次 flush 返回 ok=false → onContextLost；
          // surface 重建后 attachSurface 以新 window 重新接线 → onContextRestored
          try {
            this._exgl.detachSurface(this._xcId);
          } catch (err) {
            // ignore
          }
        } else if (e.type === "changed" && e.width > 0 && e.height > 0) {
          // ArkTS onSurfaceChanged 显式 SET 几何后通知：无 context 时唤醒轮询
          // （getContextFor 会同步刷新几何，tick 据此拿到非 0 尺寸）；已有 context
          // 且尺寸变化 → 销毁重建（旧 EGL surface 钉死旧尺寸会黑屏）
          if (this._gl && (e.width !== this._glW || e.height !== this._glH)) {
            try {
              this._exgl.destroyContext(this._gl._contextId);
            } catch (err) {
              // ignore
            }
            this._gl = null;
            this._pollTries = 0;
            this._pollForContext();
          } else if (!this._gl && !this._pollTimer) {
            this._pollTries = 0;
            this._pollForContext();
          }
        }
      }
    );
  }

  componentWillUnmount() {
    this._unmounted = true;
    this._surfaceEventSub?.remove();
    this._surfaceEventSub = null;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._gl) {
      try {
        this._exgl.destroyContext(this._gl._contextId);
      } catch (e) {
        // ignore
      }
      this._gl = null;
    }
  }

  _tick = () => {
    if (this._unmounted) return;
    let info: GLViewInfo | null = null;
    try {
      info = this._exgl.getContextFor(this._xcId);
    } catch (e) {
      // TurboModule 尚未就绪时可能抛错，稍后重试
    }
    if (info && info.contextId > 0 && info.ok && info.width > 0 && info.height > 0) {
      // 尺寸必须非 0 才建上下文：attach 早期几何未就绪时 ok 可能已为 true，
      // 拿 0×0 建上下文会让 gl-react 全部 FBO 按 0 渲染 → 整屏黑且无报错
      const gl = new WebGLRenderingContextOHOS(
        this._exgl,
        info.contextId,
        info.width,
        info.height
      );
      gl._onSurfaceStateChange = (ok) => this._onSurfaceState(ok);
      this._gl = gl;
      this._glW = info.width;
      this._glH = info.height;
      this._reportedLost = false;
      this.props.onContextCreate(gl as any);
      return;
    }
    if (++this._pollTries > 375) {
      this.props.onContextFailure?.(
        new Error(
          `ExGL: timeout waiting for GL surface (xcomponentId=${this._xcId})`
        )
      );
      return;
    }
    this._pollTimer = setTimeout(this._tick, 32);
  };

  _pollForContext() {
    if (this._pollTimer) return;
    this._pollTries = 0;
    // ArkTS 视图需要先收到 xcomponentId prop 才能 mount XComponent，稍作让位
    this._pollTimer = setTimeout(() => {
      this._pollTimer = null;
      this._tick();
    }, 32);
  }

  _onSurfaceState(ok: boolean) {
    if (this._unmounted || !this._gl) return;
    if (!ok && !this._reportedLost) {
      this._reportedLost = true;
      this.props.onContextLost?.();
    } else if (ok && this._reportedLost) {
      this._reportedLost = false;
      this.props.onContextRestored?.(this._gl as any);
    }
  }

  afterDraw(gl: WebGLRenderingContext) {
    // flush 是 GL 扩展（WebGL 上下文由原生层提供），标准 lib.dom 类型未声明
    (gl as any).flush();
    (gl as any).endFrameEXP();
  }

  beforeDraw(_gl: WebGLRenderingContext) {}

  debugError(e: any) {
    console.error(e.longMessage || e.message || e);
  }

  onRef = (ref: any) => {
    this.ref = ref;
  };

  /** expo-gl takeSnapshotAsync 等价：返回 { uri, width, height } */
  takeSnapshotAsync = async (opt: any = {}): Promise<{
    uri: string;
    localUri: string;
    width: number;
    height: number;
  }> => {
    const gl = this._gl;
    if (!gl) return Promise.reject(new Error("glView is unmounted"));
    const format = opt.format || "image/png";
    const quality = opt.quality != null ? opt.quality : 0.92;
    // 先提交当前排队命令并确保已 endFrame（快照读最近一帧）
    gl._submit();
    const res: any = this._exgl.snapshotToFile(
      gl._contextId,
      this._getCacheDir(),
      format,
      quality
    );
    return {
      uri: res.uri,
      localUri: res.uri,
      width: res.width,
      height: res.height,
    };
  };

  _cacheDir: string | null = null;
  _getCacheDir(): string {
    if (this._cacheDir == null) {
      try {
        this._cacheDir = ExGLImageLoader?.getCacheDir() ?? "";
      } catch (e) {
        this._cacheDir = "";
      }
    }
    return this._cacheDir || "";
  }

  /** gl-react Surface#captureAsDataURL 委托目标 */
  captureAsDataURL = async (opt: any = {}): Promise<string> => {
    const gl = this._gl;
    if (!gl) return Promise.reject(new Error("glView is unmounted"));
    gl._submit();
    const format = opt.format || "image/png";
    const quality = opt.quality != null ? opt.quality : 0.92;
    const res: any = this._exgl.snapshotAsDataURL(
      gl._contextId,
      format,
      quality
    );
    return res.dataUrl;
  };

  /** gl-react Surface#captureAsBlob 委托目标 */
  captureAsBlob = async (opt: any = {}): Promise<Blob> => {
    const dataUrl = await this.captureAsDataURL(opt);
    // RN 环境无 atob/Blob 构造，用 fetch 把 data URL 转 Blob
    const resp = await fetch(dataUrl);
    return resp.blob();
  };

  render() {
    const { style, children, ...rest } = this.props;
    if (__DEV__) {
      if ("width" in rest || "height" in rest) {
        console.warn(
          "gl-react <Surface>: no such width/height prop. instead you must use the style prop like for a <View>."
        );
      }
    }
    // 首次挂载后启动上下文轮询
    if (!this._gl && !this._pollTimer && !this._unmounted) {
      this._pollForContext();
    }
    return (
      <View
        {...rest}
        style={[{ position: "relative", overflow: "hidden" }, style]}
      >
        <ExGLViewNative
          style={[
            style,
            {
              flex: 1,
              position: "absolute",
              top: 0,
              left: 0,
            },
          ]}
          xcomponentId={this._xcId}
        />
        <View style={{ opacity: 0 }}>{children}</View>
      </View>
    );
  }
}

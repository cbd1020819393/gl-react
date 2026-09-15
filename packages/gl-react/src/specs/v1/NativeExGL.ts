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
 * ExGL TurboModule Spec — WebGL1 命令执行器（OHOS 原生层）。
 *
 * gl-react 的 JS 侧通过 flush() 批量下发 GL 命令（整数操作码 token 流），
 * 同步查询方法（getShaderParameter/getUniformLocation/readPixels 等）会先
 * 执行完已排队的命令再在原生侧同步执行并返回结果。
 *
 * 侧重点：这是本库自建 expo-gl 等价物的原生执行核心，
 * 映射到 libEGL.so + libGLESv3.so（OpenGL ES 3.x，向下覆盖 WebGL1 子集）。
 */
import { TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

export interface GLSurfaceInfo {
  /** 绑定的 contextId（查询失败为 0） */
  contextId: number;
  /** surface 是否可用（created 且未 destroyed） */
  ok: boolean;
  /** surface 物理像素宽 */
  width: number;
  /** surface 物理像素高 */
  height: number;
}

export interface SnapshotResult {
  uri: string;
  width: number;
  height: number;
}

export interface SnapshotDataURL {
  dataUrl: string;
  width: number;
  height: number;
}

export interface ActiveResourceInfo {
  name: string;
  size: number;
  type: number;
}

export interface Spec extends TurboModule {
  /**
   * 轮询 XComponent surface 是否已创建。
   * 返回 contextId > 0 表示 GL 上下文就绪；0 表示尚未创建。
   */
  getContextFor(xcomponentId: string): GLSurfaceInfo;
  /** 查询上下文当前 surface 状态 */
  getSurfaceInfo(contextId: number): GLSurfaceInfo;
  /**
   * 由 surfaceId（XComponentController.getXComponentSurfaceId）接线 GL surface，
   * 幂等；返回接线后的 surface 状态（contextId 0 = 失败）。
   * 主路径由 ArkTS 侧经 libgl_react_dev.so 的同名 napi 导出调用；
   * 此方法作为 JS 兜底路径。
   */
  attachSurface(xcomponentId: string, surfaceId: string): GLSurfaceInfo;
  /** surface 销毁时解绑（幂等） */
  detachSurface(xcomponentId: string): void;

  /**
   * 执行一批 GL 命令（token 流，整数操作码）。
   *
   * ops token 流格式：
   *   [OPCODE, nTokens, tok...]*
   * tok 编码：
   *   t >= 0            → 数值参数
   *   -1-2*k            → 字符串参数 strs[k]
   *   -1000000          → null 参数
   *   -(1000000 + kind*100000 + idx) → 类型化数组 datas[idx]，kind: 1=Uint8 2=Uint8Clamped 3=Int16 4=Uint16 5=Int32 6=Uint32 7=Float32 8=Float64
   *
   * 返回执行后的 surface 状态（JS 侧据此更新 drawingBufferWidth/Height 与 context lost）。
   * datas 元素实为 ArrayBuffer（token 编码见 gl_opcodes.h）。
   */
  flush(contextId: number, ops: Array<number>, strs: Array<string>, datas: Array<UnsafeObject>): GLSurfaceInfo;

  // ---- 同步查询（先 flush 排队命令再执行）----
  getError(contextId: number): number;
  getShaderParameter(contextId: number, shaderId: number, pname: number): boolean;
  getShaderInfoLog(contextId: number, shaderId: number): string;
  getShaderSource(contextId: number, shaderId: number): string;
  isShader(contextId: number, shaderId: number): boolean;
  getProgramParameterBool(contextId: number, programId: number, pname: number): boolean;
  getProgramParameterInt(contextId: number, programId: number, pname: number): number;
  getProgramInfoLog(contextId: number, programId: number): string;
  isProgram(contextId: number, programId: number): boolean;
  /** 返回 location；-1 表示 null（未使用/不存在） */
  getUniformLocation(contextId: number, programId: number, name: string): number;
  /** 返回 location；-1 表示 null */
  getAttribLocation(contextId: number, programId: number, name: string): number;
  /** 返回 uniform 当前值（长度 1..16 的数组） */
  getUniform(contextId: number, programId: number, locationId: number): Array<number>;
  getActiveUniform(contextId: number, programId: number, index: number): ActiveResourceInfo;
  getActiveAttrib(contextId: number, programId: number, index: number): ActiveResourceInfo;
  /** 仅支持数值型 pname（MAX_TEXTURE_SIZE 等）；不支持时返回 -1 */
  getParameter(contextId: number, pname: number): number;
  /** 同步查询当前 FBO 完整性（FRAMEBUFFER_COMPLETE 等 GL 枚举值） */
  checkFramebufferStatus(contextId: number, target: number): number;
  /** 同步读回 RGBA 像素（长度 w*h*4），行序与 GL 一致（原点左下） */
  readPixels(contextId: number, x: number, y: number, width: number, height: number): Array<number>;
  /**
   * readPixels 的零拷贝变体：把 RGBA 像素直接写入 pixels（ArrayBuffer，
   * 长度须 ≥ w*h*4）；gl-react capture 路径使用。
   */
  readPixelsInto(contextId: number, x: number, y: number, width: number, height: number, pixels: UnsafeObject): void;

  // ---- 快照导出 ----
  /** 读取最近一帧（endFrame 时保留的快照 FBO）并编码为图片写入 cacheDir，返回 file:// URI */
  snapshotToFile(contextId: number, cacheDir: string, format: string, quality: number): SnapshotResult;
  /** 同上但返回 { dataUrl: 'data:image/png;base64,...', width, height } */
  snapshotAsDataURL(contextId: number, format: string, quality: number): SnapshotDataURL;

  /** 主动销毁上下文（视图卸载时调用；surface 销毁时原生也会自动清理） */
  destroyContext(contextId: number): void;
  /** 调试直读原生注册表状态（命令执行错误计数） */
  getStats(): UnsafeObject;
}

export default TurboModuleRegistry.get<Spec>('ExGL');

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
 * @react-native-ohos/gl-react — gl-react 的 React Native（HarmonyOS）实现（核心 + 鸿蒙绑定单包）。
 *
 * 等价于 gl-react-native + gl-react-expo + expo-gl 的组合：
 *  - 核心（Shaders/GLSL/Node/Bus/LinearCopy/NearestCopy/createSurface…）
 *    即本包 src 下的平台无关实现；
 *  - GLView 用自建鸿蒙原生实现（ExGLView XComponent + EGL/GLES 执行器）；
 *  - 图片纹理经 Image Kit 解码（webgltexture-loader-ohos）。
 *
 * 用法与 gl-react-native 完全一致：
 *   import { Surface, Node, Shaders, GLSL } from '@react-native-ohos/gl-react';
 */
import { View } from "react-native";
import Bus from "./Bus";
import connectSize from "./connectSize";
import createSurface, { list as listSurfaces } from "./createSurface";
import GLSL from "./GLSL";
import LinearCopy from "./LinearCopy";
import NearestCopy from "./NearestCopy";
import Node from "./Node";
import Shaders from "./Shaders";
import Uniform from "./Uniform";
import Visitor from "./Visitor";
import VisitorLogger from "./VisitorLogger";
import Visitors from "./Visitors";

import "webgltexture-loader-ndarray";
import "./webgltexture-loader-ohos";

import GLView from "./GLViewNative";

export {
  Bus,
  connectSize,
  createSurface,
  listSurfaces,
  GLSL,
  LinearCopy,
  NearestCopy,
  Node,
  Shaders,
  Uniform,
  Visitor,
  VisitorLogger,
  Visitors,
};

// DEPRECATED
export const Backbuffer = "Backbuffer";

// HarmonyOS 绑定
export { default as WebGLRenderingContextOHOS } from "./WebGLRenderingContextOHOS";
export { GL as GLConstants } from "./webgl1-constants";

export const Surface = createSurface({
  GLView,
  RenderLessElement: View,
  // RN 全局 rAF 与库内 (f: Function) => number 形状一致，仅 lib.dom 类型更窄
  requestFrame: global.requestAnimationFrame as (f: Function) => number,
  cancelFrame: global.cancelAnimationFrame as (id: number) => void,
});

export type SurfaceType = ReturnType<typeof createSurface>;

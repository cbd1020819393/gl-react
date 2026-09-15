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
 * gl-react 核心入口 shim（替代原 gl-react-patched 副本）。
 *
 * 仅 re-export 平台无关核心，不引入 react-native / 鸿蒙绑定 / OHOS 纹理
 * loader——expo-gl 路径（gl-react-expo + @oh-rn/expo-gl）的演示行为与
 * patched 时期保持一致，同时与 @react-native-ohos/gl-react（meta 用例）共享同一份
 * 核心模块实例（Shaders/Visitors 全局注册表统一）。
 */
export { default as Bus } from '../../../src/Bus';
export { default as connectSize } from '../../../src/connectSize';
export { default as createSurface, list as listSurfaces } from '../../../src/createSurface';
export { default as GLSL } from '../../../src/GLSL';
export { default as LinearCopy } from '../../../src/LinearCopy';
export { default as NearestCopy } from '../../../src/NearestCopy';
export { default as Node } from '../../../src/Node';
export {
  default as Shaders,
  isShaderIdentifier,
  ensureShaderDefinition,
  shaderDefinitionToShaderInfo,
  shaderInfoEquals,
} from '../../../src/Shaders';
export { default as Uniform } from '../../../src/Uniform';
export { default as Visitor } from '../../../src/Visitor';
export { default as VisitorLogger } from '../../../src/VisitorLogger';
export { default as Visitors } from '../../../src/Visitors';

// DEPRECATED
export const Backbuffer = 'Backbuffer';

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
 * ExGLView — 鸿蒙 GL 渲染面（expo-gl GLView 的等价 Fabric/ArkTS 组件）。
 *
 * ArkTS 侧内嵌 XComponent(type=SURFACE)，XComponentController 子类回调
 * onSurfaceCreated/Destroyed 经 DeviceEvent('exglSurface') 通知 JS，
 * 由 JS 调 ExGL.attachSurface/detachSurface（C++ TurboModule，
 * OH_NativeWindow_CreateNativeWindowFromSurfaceId 建窗）接线 GL 执行器；
 * JS 侧同时轮询 getContextFor 拿 contextId 兜底。
 */
import React from 'react';
import type { ViewProps } from 'react-native/Libraries/Components/View/ViewPropTypes';
import type { HostComponent } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

export interface ExGLViewProps extends ViewProps {
  /** 唯一 id，用于关联 ArkTS XComponent 与原生 GL 上下文 */
  xcomponentId: string;
}

export default codegenNativeComponent<ExGLViewProps>(
  'ExGLView'
) as HostComponent<ExGLViewProps>;

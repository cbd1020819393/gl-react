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
 * ExGLImageLoader TurboModule Spec — ArkTS 侧图片解码（Image Kit）。
 *
 * 把 webgltexture-loader-expo 的图片解码路径替换为鸿蒙实现：
 * 支持 http(s)://、file://、data:、resource://RAWFILE/... 四类 URI，
 * 解码为 RGBA_8888 像素后由 JS 侧经 ExGL.flush(texImage2D) 上传纹理。
 */
import { TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA8888 像素（0..255 数值数组，长度 = width*height*4） */
  data: Array<number>;
}

export interface Spec extends TurboModule {
  /** 解码图片为 RGBA 像素；失败 reject Error */
  loadImage(uri: string): Promise<DecodedImage>;
  /** 应用沙箱 cache 目录绝对路径（快照导出用） */
  getCacheDir(): string;
}

export default TurboModuleRegistry.get<Spec>('ExGLImageLoader');

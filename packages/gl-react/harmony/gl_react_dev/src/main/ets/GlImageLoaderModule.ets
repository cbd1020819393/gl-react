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
 * GlImageLoaderModule — 图片纹理解码（ArkTS TurboModule，Image Kit）。
 *
 * 替代 webgltexture-loader-expo 的 expo 资产路径：
 *  - http(s)://                → @ohos.net.http 拉取字节
 *  - data:                     → base64 解码
 *  - resource://RAWFILE/<path> → resourceManager.getRawFileContent（RNOH
 *                                require() 本地资源在 rawfile 场景的实际 URI 形态）
 *  - file://<path> / 裸路径    → Image Kit 直接按路径创建 ImageSource
 * 解码统一为 RGBA_8888 像素，由 JS 侧经 ExGL.flush(texImage2D) 上传纹理。
 */
import { TurboModule } from '@rnoh/react-native-openharmony/ts';
import { TM } from './generated/ts';
import image from '@ohos.multimedia.image';
import http from '@ohos.net.http';
import util from '@ohos.util';
import fs from '@ohos.file.fs';

const RAWFILE_PREFIX = 'resource://RAWFILE/';

export class GlImageLoaderModule extends TurboModule implements TM.ExGLImageLoader.Spec {
  static readonly NAME = TM.ExGLImageLoader.NAME;

  getCacheDir(): string {
    return this.ctx.uiAbilityContext.cacheDir;
  }

  async loadImage(uri: string): Promise<TM.ExGLImageLoader.DecodedImage> {
    const imageSource = await this.createImageSource(uri);
    if (!imageSource) {
      throw new Error(`ExGLImageLoader: unsupported or unreadable uri: ${uri}`);
    }
    const pixelMap = await imageSource.createPixelMap({
      desiredPixelFormat: image.PixelMapFormat.RGBA_8888
    });
    try {
      const info = await pixelMap.getImageInfo();
      const width = info.size.width;
      const height = info.size.height;
      const buffer = new ArrayBuffer(width * height * 4);
      await pixelMap.readPixelsToBuffer(buffer);
      const u8 = new Uint8Array(buffer);
      const data: number[] = new Array<number>(u8.length);
      for (let i = 0; i < u8.length; i++) {
        data[i] = u8[i];
      }
      return { width: width, height: height, data: data };
    } finally {
      try {
        await pixelMap.release();
      } catch (e) {
        // ignore
      }
      try {
        await imageSource.release();
      } catch (e) {
        // ignore
      }
    }
  }

  private async createImageSource(uri: string): Promise<image.ImageSource | null> {
    try {
      if (uri.startsWith('data:')) {
        const commaIdx = uri.indexOf(',');
        if (commaIdx < 0) {
          return null;
        }
        const meta = uri.substring(5, commaIdx);
        const payload = uri.substring(commaIdx + 1);
        let bytes: Uint8Array;
        if (meta.includes('base64')) {
          const decoder = new util.Base64Helper();
          bytes = decoder.decodeSync(payload);
        } else {
          bytes = this.percentDecode(payload);
        }
        return image.createImageSource(bytes.buffer as ArrayBuffer);
      }
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const bytes = await this.fetchHttp(uri);
        return image.createImageSource(bytes);
      }
      if (uri.startsWith(RAWFILE_PREFIX)) {
        const rawPath = uri.substring(RAWFILE_PREFIX.length);
        const mgr = this.ctx.uiAbilityContext.resourceManager;
        const bytes = await mgr.getRawFileContent(rawPath);
        return image.createImageSource(bytes);
      }
      // file:// 与裸路径：Image Kit 支持沙箱路径
      const path = uri.startsWith('file://') ? uri.substring('file://'.length) : uri;
      if (fs.accessSync(path)) {
        return image.createImageSource(path);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  private async fetchHttp(uri: string): Promise<ArrayBuffer> {
    const httpRequest = http.createHttp();
    try {
      const resp = await httpRequest.request(uri, {
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 15000,
        readTimeout: 30000
      });
      if (resp.responseCode < 200 || resp.responseCode >= 300) {
        throw new Error(`HTTP ${resp.responseCode} for ${uri}`);
      }
      return resp.result as ArrayBuffer;
    } finally {
      httpRequest.destroy();
    }
  }

  private percentDecode(text: string): Uint8Array {
    const out = new Uint8Array(text.length);
    let n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charAt(i);
      if (c === '%' && i + 2 < text.length) {
        out[n++] = parseInt(text.substring(i + 1, i + 3), 16);
        i += 2;
      } else {
        out[n++] = text.charCodeAt(i);
      }
    }
    return out.slice(0, n);
  }
}

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
 * AssetFileBridge — 纹理资源桥接（ArkTS TurboModule）。
 *
 * expo-gl 原生 loadImage 只认 localUri === "file://<沙箱路径>"（stb_image
 * 直接读文件），而 RN 打包资源在 RNOH 里是 asset:// 方案（ArkUI $rawfile
 * 引用，非文件系统路径），远程图则需要 http 下载。本模块把两类 uri 统一
 * 落到应用 cacheDir 下的真实文件，返回 "file://..." 给 JS 纹理加载器：
 *  - exportRawFile(relPath)   rawfile 相对路径 → 缓存文件
 *  - downloadToFile(url)      http(s) 下载（需 ohos.permission.INTERNET）
 */
import {
  RNPackage,
  UITurboModule,
  UITurboModuleContext,
} from '@rnoh/react-native-openharmony/ts';
import { fileIo as fs } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';

// 与 RNOH 内部 TurboModuleFactory<T, C> 同形（该类型未从 ts 子路径导出）
type ModuleFactory = (ctx: UITurboModuleContext) => UITurboModule;

class AssetFileBridgeModule extends UITurboModule {
  static readonly NAME: string = 'AssetFileBridge';

  private async writeCacheFile(bytes: Uint8Array, ext: string): Promise<string> {
    const cacheDir: string = this.ctx.uiAbilityContext.cacheDir;
    const path: string =
      `${cacheDir}/gl_asset_${Date.now()}_${Math.floor(Math.random() * 1000000)}${ext}`;
    const file: fs.File = fs.openSync(
      path,
      fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC
    );
    try {
      const whole: ArrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      fs.writeSync(file.fd, whole);
    } finally {
      fs.closeSync(file);
    }
    return `file://${path}`;
  }

  public async exportRawFile(relPath: string): Promise<string> {
    const rm = this.ctx.uiAbilityContext.resourceManager;
    const bytes: Uint8Array = await rm.getRawFileContent(relPath);
    return this.writeCacheFile(bytes, '.bin');
  }

  public async downloadToFile(url: string): Promise<string> {
    const httpRequest = http.createHttp();
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 15000,
        readTimeout: 30000
      };
      const resp = await httpRequest.request(url, options);
      if (resp.responseCode < 200 || resp.responseCode >= 300) {
        throw new Error(`AssetFileBridge: HTTP ${resp.responseCode} for ${url}`);
      }
      const data = resp.result as ArrayBuffer;
      return this.writeCacheFile(new Uint8Array(data), '.bin');
    } finally {
      httpRequest.destroy();
    }
  }
}

export class AssetFileBridgePackage extends RNPackage {
  getUITurboModuleFactoryByNameMap(): Map<string, ModuleFactory> {
    console.error('[AssetFileBridge] package factory map registered');
    return new Map<string, ModuleFactory>()
      .set(AssetFileBridgeModule.NAME, (ctx: UITurboModuleContext): UITurboModule => {
        console.error('[AssetFileBridge] module instance created');
        return new AssetFileBridgeModule(ctx);
      });
  }
}

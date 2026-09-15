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
 * OHOS 图片纹理加载器 — webgltexture-loader-expo 的鸿蒙替代。
 *
 * 通过 ExGLImageLoader（ArkTS/Image Kit）把 URI 解码为 RGBA 像素，再经
 * WebGL 代理排队 texImage2D 上传。导入本模块即完成 globalRegistry 注册。
 * 支持：require() 资源（number → resolveAssetSource）、字符串/对象 URI
 * （http(s)://、file://、data:、resource://RAWFILE/...）。
 */
import { Image } from "react-native";
import {
  globalRegistry,
  createTexture,
  WebGLTextureLoaderAsyncHashCache,
} from "webgltexture-loader";
import ExGLImageLoader from "./specs/v1/NativeExGLImageLoader";

const neverEnding = new Promise(() => {});

/** 本加载器可处理的纹理输入：require() 资源号 / URI 字符串 / {uri} 对象 */
type LoaderInput = number | string | {uri: string};

class OHOSImageTextureLoader extends WebGLTextureLoaderAsyncHashCache<LoaderInput> {
  static priority = 10;

  canLoad(input: any): boolean {
    return (
      typeof input === "number" ||
      typeof input === "string" ||
      (typeof input === "object" &&
        input !== null &&
        typeof input.uri === "string")
    );
  }

  inputHash(input: any): string {
    if (typeof input === "number") return "asset:" + input;
    if (typeof input === "string") return "uri:" + input;
    return "uri:" + input.uri;
  }

  private resolveUri(input: any): string {
    if (typeof input === "number") {
      const source = Image.resolveAssetSource(input);
      if (!source || !source.uri) {
        throw new Error(
          "ExGL texture loader: cannot resolve asset module " + input
        );
      }
      return source.uri;
    }
    if (typeof input === "string") return input;
    return input.uri;
  }

  loadNoCache(input: LoaderInput): {
    promise: Promise<{ texture: any; width: number; height: number }>;
    dispose: () => void;
  } {
    let disposed = false;
    const decode = ExGLImageLoader
      ? ExGLImageLoader.loadImage(this.resolveUri(input))
      : Promise.reject(new Error("ExGLImageLoader turbo module not available"));
    const promise = decode.then(
      (decoded: { width: number; height: number; data: number[] }) => {
        if (disposed) return neverEnding as any;
        const gl = this.gl as any;
        const texture = createTexture(gl);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          decoded.width,
          decoded.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(decoded.data)
        );
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return { texture, width: decoded.width, height: decoded.height };
      }
    );
    return {
      promise,
      dispose: () => {
        disposed = true;
      },
    };
  }
}

globalRegistry.add(OHOSImageTextureLoader);

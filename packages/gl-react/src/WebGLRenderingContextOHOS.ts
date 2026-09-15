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
 * WebGLRenderingContextOHOS — WebGL1 API 的 JS 侧代理。
 *
 * 所有 GL 调用被记录为整数操作码 token 流（ops/strs/datas），整帧一次
 * ExGL.flush 下发到原生 EGL/GLES 执行器；同步查询（getShaderParameter 等）
 * 会先提交已排队命令再原生同步执行，保证与 WebGL 的顺序语义一致。
 *
 * 操作码与 token 编码需与 C++ 侧 gl_opcodes.h 严格一致。
 */
import ExGL, { type Spec as ExGLSpec } from "./specs/v1/NativeExGL";
import GL from "./webgl1-constants";

// ---- 操作码（镜像 C++ gl_opcodes.h） ----
const OP = {
  CREATE_SHADER: 1,
  DELETE_SHADER: 2,
  SHADER_SOURCE: 3,
  COMPILE_SHADER: 4,
  ATTACH_SHADER: 5,
  DETACH_SHADER: 6,
  BIND_ATTRIB_LOCATION: 7,
  LINK_PROGRAM: 8,
  CREATE_PROGRAM: 9,
  USE_PROGRAM: 10,
  DELETE_PROGRAM: 11,
  CREATE_BUFFER: 12,
  DELETE_BUFFER: 13,
  BIND_BUFFER: 14,
  BUFFER_DATA: 15,
  BUFFER_SUB_DATA: 16,
  BUFFER_DATA_SIZE: 17,
  CREATE_TEXTURE: 18,
  DELETE_TEXTURE: 19,
  BIND_TEXTURE: 20,
  ACTIVE_TEXTURE: 21,
  PIXEL_STOREI: 22,
  TEX_IMAGE_2D: 23,
  TEX_SUB_IMAGE_2D: 24,
  TEX_PARAMETERI: 25,
  TEX_PARAMETERF: 26,
  GENERATE_MIPMAP: 27,
  CREATE_FRAMEBUFFER: 28,
  DELETE_FRAMEBUFFER: 29,
  BIND_FRAMEBUFFER: 30,
  FRAMEBUFFER_TEXTURE_2D: 31,
  CHECK_FRAMEBUFFER_STATUS: 32,
  CREATE_RENDERBUFFER: 33,
  DELETE_RENDERBUFFER: 34,
  BIND_RENDERBUFFER: 35,
  FRAMEBUFFER_RENDERBUFFER: 36,
  VIEWPORT: 40,
  ENABLE: 41,
  DISABLE: 42,
  CLEAR_COLOR: 43,
  CLEAR: 44,
  BLEND_FUNC: 45,
  BLEND_COLOR: 46,
  BLEND_EQUATION: 47,
  DRAW_ARRAYS: 48,
  FLUSH: 49,
  FINISH: 50,
  END_FRAME: 51,
  VERTEX_ATTRIB_POINTER: 60,
  ENABLE_VERTEX_ATTRIB_ARRAY: 61,
  DISABLE_VERTEX_ATTRIB_ARRAY: 62,
  VERTEX_ATTRIB_1F: 63,
  VERTEX_ATTRIB_2F: 64,
  VERTEX_ATTRIB_3F: 65,
  VERTEX_ATTRIB_4F: 66,
  VERTEX_ATTRIB_1FV: 67,
  VERTEX_ATTRIB_2FV: 68,
  VERTEX_ATTRIB_3FV: 69,
  VERTEX_ATTRIB_4FV: 70,
  UNIFORM_1I: 80,
  UNIFORM_2I: 81,
  UNIFORM_3I: 82,
  UNIFORM_4I: 83,
  UNIFORM_1F: 84,
  UNIFORM_2F: 85,
  UNIFORM_3F: 86,
  UNIFORM_4F: 87,
  UNIFORM_1IV: 88,
  UNIFORM_2IV: 89,
  UNIFORM_3IV: 90,
  UNIFORM_4IV: 91,
  UNIFORM_1FV: 92,
  UNIFORM_2FV: 93,
  UNIFORM_3FV: 94,
  UNIFORM_4FV: 95,
  UNIFORM_MATRIX_2FV: 96,
  UNIFORM_MATRIX_3FV: 97,
  UNIFORM_MATRIX_4FV: 98,
} as const;

const NULL_TOKEN = -1000000;
const DATA_KIND: { [ctor: string]: number } = {
  Uint8Array: 1,
  Uint8ClampedArray: 2,
  Int16Array: 3,
  Uint16Array: 4,
  Int32Array: 5,
  Uint32Array: 6,
  Float32Array: 7,
  Float64Array: 8,
};

export type GLObject = { id: number };

const nextSurfaceId: { n: number } = { n: 0 };

export class WebGLRenderingContextOHOS {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  canvas = { width: 0, height: 0 };

  _exgl: ExGLSpec;
  _contextId: number;
  _ok: boolean = true;
  _ops: number[] = [];
  _strs: string[] = [];
  _datas: ArrayBuffer[] = [];
  _deleted: Set<number> = new Set();
  _programIntCache: Map<number, number> = new Map();
  _onSurfaceStateChange: ((ok: boolean) => void) | null = null;
  _idSeq: number = 0;

  constructor(
    exgl: ExGLSpec,
    contextId: number,
    width: number,
    height: number
  ) {
    this._exgl = exgl;
    this._contextId = contextId;
    this.drawingBufferWidth = width;
    this.drawingBufferHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    // 常量同时以数值属性与大写名称暴露（gl-react 的 blendFunc 别名解析
    // 通过 `name in gl` 查 'SRC_COLOR' 这类名字）
    Object.assign(this, GL);
  }

  // ------------------------------------------------------------------
  // 批处理内部
  // ------------------------------------------------------------------

  private _num(v: number): void {
    this._ops.push(v);
  }

  private _bool(v: any): void {
    this._ops.push(v ? 1 : 0);
  }

  private _strToken(s: string): void {
    this._strs.push(s);
    this._ops.push(-(1 + 2 * (this._strs.length - 1)));
  }

  private _taToken(ta: ArrayBufferView | ArrayBuffer | null): void {
    if (!ta) {
      this._ops.push(NULL_TOKEN);
      return;
    }
    const ctorName =
      (ta as any).constructor?.name || (ta instanceof ArrayBuffer ? "Uint8Array" : "Uint8Array");
    const kind = DATA_KIND[ctorName] || 1;
    let buffer: ArrayBuffer;
    if (ta instanceof ArrayBuffer) {
      buffer = ta;
    } else {
      const view = ta as ArrayBufferView;
      // ArrayBufferView.buffer 类型为 ArrayBufferLike，此处保证返回真正的 ArrayBuffer
      buffer =
        view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
          ? (view.buffer as ArrayBuffer)
          : (view.buffer.slice(
              view.byteOffset,
              view.byteOffset + view.byteLength,
            ) as ArrayBuffer);
    }
    const idx = this._datas.length;
    this._datas.push(buffer);
    this._ops.push(-(NULL_TOKEN + kind * 100000 + idx));
  }

  private _obj(o: GLObject | null | undefined): void {
    this._ops.push(o ? (o as { id: number }).id : 0);
  }

  private _updateInfo(info: {
    contextId: number;
    ok: boolean;
    width: number;
    height: number;
  }): void {
    if (info) {
      this.drawingBufferWidth = info.width;
      this.drawingBufferHeight = info.height;
      const wasOk = this._ok;
      this._ok = !!info.ok;
      if (wasOk !== this._ok && this._onSurfaceStateChange) {
        this._onSurfaceStateChange(this._ok);
      }
    }
  }

  /** 提交当前批（有排队命令才发送）。 */
  _submit(): void {
    if (this._ops.length === 0) {
      return;
    }
    if (this._ops.length > 8_000_000) {
      // 防御：surface 不可用期间命令无限堆积
      this._ops.length = 0;
      this._strs.length = 0;
      this._datas.length = 0;
      return;
    }
    const info = this._exgl.flush(
      this._contextId,
      this._ops,
      this._strs,
      this._datas
    );
    this._ops.length = 0;
    this._strs.length = 0;
    this._datas.length = 0;
    this._updateInfo(info);
  }

  /** gl-react Surface._draw 之后由 GLViewNative.afterDraw 调用（expo-gl 语义）。 */
  endFrameEXP(): void {
    this._ops.push(OP.END_FRAME, 0);
    const info = this._exgl.flush(
      this._contextId,
      this._ops,
      this._strs,
      this._datas
    );
    this._ops.length = 0;
    this._strs.length = 0;
    this._datas.length = 0;
    this._updateInfo(info);
  }

  flush(): void {
    this._submit();
  }

  isContextLost(): boolean {
    return !this._ok;
  }

  getContextAttributes() {
    return {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    };
  }

  getExtension(name: string): any {
    // 常规 WebGL1 扩展未实现；GLViewRef 由 GLViewNative 包装层处理
    console.warn(`ExGL: getExtension("${name}") is not supported on OHOS`);
    return null;
  }

  getSupportedExtensions(): string[] {
    return [];
  }

  // ------------------------------------------------------------------
  // shader / program
  // ------------------------------------------------------------------

  createShader(type: number): GLObject {
    const id = ++this._idSeq;
    this._ops.push(OP.CREATE_SHADER, 2);
    this._num(id);
    this._num(type);
    return { id };
  }

  shaderSource(shader: GLObject, source: string): void {
    this._ops.push(OP.SHADER_SOURCE, 2);
    this._obj(shader);
    this._strToken(source);
  }

  compileShader(shader: GLObject): void {
    this._ops.push(OP.COMPILE_SHADER, 1);
    this._obj(shader);
  }

  deleteShader(shader: GLObject): void {
    this._deleted.add(shader.id);
    this._ops.push(OP.DELETE_SHADER, 1);
    this._obj(shader);
  }

  getShaderParameter(shader: GLObject, pname: number): boolean {
    this._submit();
    return this._exgl.getShaderParameter(
      this._contextId,
      shader.id,
      pname
    );
  }

  getShaderInfoLog(shader: GLObject): string {
    this._submit();
    return this._exgl.getShaderInfoLog(this._contextId, shader.id);
  }

  getShaderSource(shader: GLObject): string {
    this._submit();
    return this._exgl.getShaderSource(this._contextId, shader.id);
  }

  isShader(shader: GLObject | null): boolean {
    return !!shader && !this._deleted.has(shader.id);
  }

  createProgram(): GLObject {
    const id = ++(this as any)._idSeq;
    this._ops.push(OP.CREATE_PROGRAM, 1);
    this._num(id);
    return { id };
  }

  deleteProgram(program: GLObject): void {
    this._deleted.add(program.id);
    this._programIntCache.delete(program.id);
    this._ops.push(OP.DELETE_PROGRAM, 1);
    this._obj(program);
  }

  attachShader(program: GLObject, shader: GLObject): void {
    this._ops.push(OP.ATTACH_SHADER, 2);
    this._obj(program);
    this._obj(shader);
  }

  detachShader(program: GLObject, shader: GLObject): void {
    this._ops.push(OP.DETACH_SHADER, 2);
    this._obj(program);
    this._obj(shader);
  }

  bindAttribLocation(program: GLObject, index: number, name: string): void {
    this._ops.push(OP.BIND_ATTRIB_LOCATION, 3);
    this._obj(program);
    this._num(index);
    this._strToken(name);
  }

  linkProgram(program: GLObject): void {
    this._ops.push(OP.LINK_PROGRAM, 1);
    this._obj(program);
  }

  useProgram(program: GLObject | null): void {
    this._ops.push(OP.USE_PROGRAM, 1);
    this._obj(program);
  }

  getProgramParameter(program: GLObject, pname: number): boolean | number {
    this._submit();
    if (pname === GL.ACTIVE_ATTRIBUTES || pname === GL.ACTIVE_UNIFORMS) {
      const cached = this._programIntCache.get(program.id * 16 + (pname === GL.ACTIVE_ATTRIBUTES ? 1 : 2));
      if (cached !== undefined) return cached;
      const v = this._exgl.getProgramParameterInt(
        this._contextId,
        program.id,
        pname
      );
      this._programIntCache.set(
        program.id * 16 + (pname === GL.ACTIVE_ATTRIBUTES ? 1 : 2),
        v
      );
      return v;
    }
    return this._exgl.getProgramParameterBool(
      this._contextId,
      program.id,
      pname
    );
  }

  getProgramInfoLog(program: GLObject): string {
    this._submit();
    return this._exgl.getProgramInfoLog(this._contextId, program.id);
  }

  isProgram(program: GLObject | null): boolean {
    return !!program && !this._deleted.has(program.id);
  }

  getUniformLocation(program: GLObject, name: string): number | null {
    this._submit();
    return this._exgl.getUniformLocation(this._contextId, program.id, name);
  }

  getAttribLocation(program: GLObject, name: string): number {
    this._submit();
    return this._exgl.getAttribLocation(this._contextId, program.id, name);
  }

  getUniform(program: GLObject, location: number): number[] {
    this._submit();
    return this._exgl.getUniform(this._contextId, program.id, location as number);
  }

  getActiveUniform(program: GLObject, index: number) {
    this._submit();
    return this._exgl.getActiveUniform(this._contextId, program.id, index);
  }

  getActiveAttrib(program: GLObject, index: number) {
    this._submit();
    return this._exgl.getActiveAttrib(this._contextId, program.id, index);
  }

  getParameter(pname: number): number {
    this._submit();
    return this._exgl.getParameter(this._contextId, pname);
  }

  getError(): number {
    this._submit();
    return this._exgl.getError(this._contextId);
  }

  // ------------------------------------------------------------------
  // buffers
  // ------------------------------------------------------------------

  createBuffer(): GLObject {
    const id = ++(this as any)._idSeq;
    this._ops.push(OP.CREATE_BUFFER, 1);
    this._num(id);
    return { id };
  }

  deleteBuffer(buffer: GLObject | null): void {
    if (!buffer) return;
    this._deleted.add(buffer.id);
    this._ops.push(OP.DELETE_BUFFER, 1);
    this._obj(buffer);
  }

  bindBuffer(target: number, buffer: GLObject | null): void {
    this._ops.push(OP.BIND_BUFFER, 2);
    this._num(target);
    this._obj(buffer);
  }

  bufferData(
    target: number,
    data: ArrayBufferView | ArrayBuffer | number | null,
    usage: number
  ): void {
    this._ops.push(
      typeof data === "number" ? OP.BUFFER_DATA_SIZE : OP.BUFFER_DATA,
      3
    );
    this._num(target);
    if (typeof data === "number") {
      this._num(data);
    } else {
      this._taToken(data);
    }
    this._num(usage);
  }

  bufferSubData(
    target: number,
    offset: number,
    data: ArrayBufferView | ArrayBuffer
  ): void {
    this._ops.push(OP.BUFFER_SUB_DATA, 3);
    this._num(target);
    this._num(offset);
    this._taToken(data);
  }

  // ------------------------------------------------------------------
  // textures
  // ------------------------------------------------------------------

  createTexture(): GLObject {
    const id = ++(this as any)._idSeq;
    this._ops.push(OP.CREATE_TEXTURE, 1);
    this._num(id);
    return { id };
  }

  deleteTexture(texture: GLObject | null): void {
    if (!texture) return;
    this._deleted.add(texture.id);
    this._ops.push(OP.DELETE_TEXTURE, 1);
    this._obj(texture);
  }

  bindTexture(target: number, texture: GLObject | null): void {
    this._ops.push(OP.BIND_TEXTURE, 2);
    this._num(target);
    this._obj(texture);
  }

  activeTexture(unit: number): void {
    this._ops.push(OP.ACTIVE_TEXTURE, 1);
    this._num(unit);
  }

  pixelStorei(pname: number, param: number): void {
    this._ops.push(OP.PIXEL_STOREI, 2);
    this._num(pname);
    this._num(param);
  }

  texImage2D(...args: any[]): void {
    // 全量形式: (target, level, internalformat, width, height, border, format, type, pixels)
    // DOM 源形式: (target, level, internalformat, format, type, source) — 图片纹理
    // 由 webgltexture-loader-ohos 走 ArkTS 解码后以全量形式上传，这里仅告警
    if (args.length >= 9) {
      this._ops.push(OP.TEX_IMAGE_2D, 9);
      for (let i = 0; i < 8; i++) this._num(args[i]);
      this._taToken(args[8] ?? null);
    } else if (args.length === 6) {
      console.warn(
        "ExGL: texImage2D with DOM/ImageSource is not supported; use webgltexture-loader-ohos (uri uniforms) instead"
      );
    }
  }

  texSubImage2D(...args: any[]): void {
    if (args.length >= 9) {
      this._ops.push(OP.TEX_SUB_IMAGE_2D, 9);
      for (let i = 0; i < 8; i++) this._num(args[i]);
      this._taToken(args[8] ?? null);
    }
  }

  texParameteri(target: number, pname: number, param: number): void {
    this._ops.push(OP.TEX_PARAMETERI, 3);
    this._num(target);
    this._num(pname);
    this._num(param);
  }

  texParameterf(target: number, pname: number, param: number): void {
    this._ops.push(OP.TEX_PARAMETERF, 3);
    this._num(target);
    this._num(pname);
    this._num(param);
  }

  generateMipmap(target: number): void {
    this._ops.push(OP.GENERATE_MIPMAP, 1);
    this._num(target);
  }

  // ------------------------------------------------------------------
  // framebuffer / renderbuffer
  // ------------------------------------------------------------------

  createFramebuffer(): GLObject {
    const id = ++(this as any)._idSeq;
    this._ops.push(OP.CREATE_FRAMEBUFFER, 1);
    this._num(id);
    return { id };
  }

  deleteFramebuffer(fbo: GLObject | null): void {
    if (!fbo) return;
    this._deleted.add(fbo.id);
    this._ops.push(OP.DELETE_FRAMEBUFFER, 1);
    this._obj(fbo);
  }

  bindFramebuffer(target: number, fbo: GLObject | null): void {
    this._ops.push(OP.BIND_FRAMEBUFFER, 2);
    this._num(target);
    this._obj(fbo);
  }

  framebufferTexture2D(
    target: number,
    attachment: number,
    textarget: number,
    texture: GLObject | null,
    level: number
  ): void {
    this._ops.push(OP.FRAMEBUFFER_TEXTURE_2D, 5);
    this._num(target);
    this._num(attachment);
    this._num(textarget);
    this._obj(texture);
    this._num(level);
  }

  checkFramebufferStatus(target: number): number {
    // 同步提交已排队命令后在原生侧真实查询（FRAMEBUFFER_COMPLETE=0x8cd5）
    this._submit();
    return this._exgl.checkFramebufferStatus(this._contextId, target);
  }

  createRenderbuffer(): GLObject {
    const id = ++(this as any)._idSeq;
    this._ops.push(OP.CREATE_RENDERBUFFER, 1);
    this._num(id);
    return { id };
  }

  deleteRenderbuffer(rbo: GLObject | null): void {
    if (!rbo) return;
    this._deleted.add(rbo.id);
    this._ops.push(OP.DELETE_RENDERBUFFER, 1);
    this._obj(rbo);
  }

  bindRenderbuffer(target: number, rbo: GLObject | null): void {
    this._ops.push(OP.BIND_RENDERBUFFER, 2);
    this._num(target);
    this._obj(rbo);
  }

  framebufferRenderbuffer(
    target: number,
    attachment: number,
    renderbuffertarget: number,
    rbo: GLObject | null
  ): void {
    this._ops.push(OP.FRAMEBUFFER_RENDERBUFFER, 4);
    this._num(target);
    this._num(attachment);
    this._num(renderbuffertarget);
    this._obj(rbo);
  }

  // ------------------------------------------------------------------
  // state & drawing
  // ------------------------------------------------------------------

  viewport(x: number, y: number, width: number, height: number): void {
    this._ops.push(OP.VIEWPORT, 4);
    this._num(x);
    this._num(y);
    this._num(width);
    this._num(height);
  }

  enable(cap: number): void {
    this._ops.push(OP.ENABLE, 1);
    this._num(cap);
  }

  disable(cap: number): void {
    this._ops.push(OP.DISABLE, 1);
    this._num(cap);
  }

  clearColor(r: number, g: number, b: number, a: number): void {
    this._ops.push(OP.CLEAR_COLOR, 4);
    this._num(r);
    this._num(g);
    this._num(b);
    this._num(a);
  }

  clear(mask: number): void {
    this._ops.push(OP.CLEAR, 1);
    this._num(mask);
  }

  blendFunc(src: number, dst: number): void {
    this._ops.push(OP.BLEND_FUNC, 2);
    this._num(src);
    this._num(dst);
  }

  blendColor(r: number, g: number, b: number, a: number): void {
    this._ops.push(OP.BLEND_COLOR, 4);
    this._num(r);
    this._num(g);
    this._num(b);
    this._num(a);
  }

  blendEquation(mode: number): void {
    this._ops.push(OP.BLEND_EQUATION, 1);
    this._num(mode);
  }

  drawArrays(mode: number, first: number, count: number): void {
    this._ops.push(OP.DRAW_ARRAYS, 3);
    this._num(mode);
    this._num(first);
    this._num(count);
  }

  flushGL(): void {
    this._ops.push(OP.FLUSH, 0);
  }

  finish(): void {
    this._ops.push(OP.FINISH, 0);
  }

  // ------------------------------------------------------------------
  // vertex attribs
  // ------------------------------------------------------------------

  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number
  ): void {
    this._ops.push(OP.VERTEX_ATTRIB_POINTER, 6);
    this._num(index);
    this._num(size);
    this._num(type);
    this._bool(normalized);
    this._num(stride);
    this._num(offset);
  }

  enableVertexAttribArray(index: number): void {
    this._ops.push(OP.ENABLE_VERTEX_ATTRIB_ARRAY, 1);
    this._num(index);
  }

  disableVertexAttribArray(index: number): void {
    this._ops.push(OP.DISABLE_VERTEX_ATTRIB_ARRAY, 1);
    this._num(index);
  }

  vertexAttrib1f(index: number, x: number): void {
    this._ops.push(OP.VERTEX_ATTRIB_1F, 2);
    this._num(index);
    this._num(x);
  }
  vertexAttrib2f(index: number, x: number, y: number): void {
    this._ops.push(OP.VERTEX_ATTRIB_2F, 3);
    this._num(index);
    this._num(x);
    this._num(y);
  }
  vertexAttrib3f(index: number, x: number, y: number, z: number): void {
    this._ops.push(OP.VERTEX_ATTRIB_3F, 4);
    this._num(index);
    this._num(x);
    this._num(y);
    this._num(z);
  }
  vertexAttrib4f(
    index: number,
    x: number,
    y: number,
    z: number,
    w: number
  ): void {
    this._ops.push(OP.VERTEX_ATTRIB_4F, 5);
    this._num(index);
    this._num(x);
    this._num(y);
    this._num(z);
    this._num(w);
  }
  vertexAttrib1fv(index: number, v: ArrayLike<number>): void {
    this._ops.push(OP.VERTEX_ATTRIB_1FV, 2);
    this._num(index);
    this._taToken(new Float32Array([v[0]]));
  }
  vertexAttrib2fv(index: number, v: ArrayLike<number>): void {
    this._ops.push(OP.VERTEX_ATTRIB_2FV, 2);
    this._num(index);
    this._taToken(new Float32Array([v[0], v[1]]));
  }
  vertexAttrib3fv(index: number, v: ArrayLike<number>): void {
    this._ops.push(OP.VERTEX_ATTRIB_3FV, 2);
    this._num(index);
    this._taToken(new Float32Array([v[0], v[1], v[2]]));
  }
  vertexAttrib4fv(index: number, v: ArrayLike<number>): void {
    this._ops.push(OP.VERTEX_ATTRIB_4FV, 2);
    this._num(index);
    this._taToken(new Float32Array([v[0], v[1], v[2], v[3]]));
  }

  // ------------------------------------------------------------------
  // uniforms（location 为 getUniformLocation 返回的 id）
  // ------------------------------------------------------------------

  private _uniformLoc(location: number | null): number | null {
    return location as number;
  }

  uniform1i(location: number | null, x: number): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_1I, 2);
    this._num(location as number);
    this._num(x);
  }
  uniform2i(location: number | null, x: number, y: number): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_2I, 3);
    this._num(location as number);
    this._num(x);
    this._num(y);
  }
  uniform3i(location: number | null, x: number, y: number, z: number): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_3I, 4);
    this._num(location as number);
    this._num(x);
    this._num(y);
    this._num(z);
  }
  uniform4i(
    location: number | null,
    x: number,
    y: number,
    z: number,
    w: number
  ): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_4I, 5);
    this._num(location as number);
    this._num(x);
    this._num(y);
    this._num(z);
    this._num(w);
  }
  uniform1f(location: number | null, x: number): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_1F, 2);
    this._num(location as number);
    this._num(x);
  }
  uniform2f(location: number | null, x: number, y: number): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_2F, 3);
    this._num(location as number);
    this._num(x);
    this._num(y);
  }
  uniform3f(
    location: number | null,
    x: number,
    y: number,
    z: number
  ): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_3F, 4);
    this._num(location as number);
    this._num(x);
    this._num(y);
    this._num(z);
  }
  uniform4f(
    location: number | null,
    x: number,
    y: number,
    z: number,
    w: number
  ): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(OP.UNIFORM_4F, 5);
    this._num(location as number);
    this._num(x);
    this._num(y);
    this._num(z);
    this._num(w);
  }

  private _pushIntVec(location: number | null, op: number, n: number, v: ArrayLike<number>): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(op, 2);
    this._num(location as number);
    this._taToken(new Int32Array([v[0], v[1], v[2], v[3]].slice(0, n)));
  }
  private _pushFloatVec(location: number | null, op: number, n: number, v: ArrayLike<number>): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(op, 2);
    this._num(location as number);
    this._taToken(new Float32Array([v[0], v[1], v[2], v[3]].slice(0, n)));
  }

  uniform1iv(location: number | null, v: ArrayLike<number>): void {
    this._pushIntVec(location, OP.UNIFORM_1IV, 1, v);
  }
  uniform2iv(location: number | null, v: ArrayLike<number>): void {
    this._pushIntVec(location, OP.UNIFORM_2IV, 2, v);
  }
  uniform3iv(location: number | null, v: ArrayLike<number>): void {
    this._pushIntVec(location, OP.UNIFORM_3IV, 3, v);
  }
  uniform4iv(location: number | null, v: ArrayLike<number>): void {
    this._pushIntVec(location, OP.UNIFORM_4IV, 4, v);
  }
  uniform1fv(location: number | null, v: ArrayLike<number>): void {
    this._pushFloatVec(location, OP.UNIFORM_1FV, 1, v);
  }
  uniform2fv(location: number | null, v: ArrayLike<number>): void {
    this._pushFloatVec(location, OP.UNIFORM_2FV, 2, v);
  }
  uniform3fv(location: number | null, v: ArrayLike<number>): void {
    this._pushFloatVec(location, OP.UNIFORM_3FV, 3, v);
  }
  uniform4fv(location: number | null, v: ArrayLike<number>): void {
    this._pushFloatVec(location, OP.UNIFORM_4FV, 4, v);
  }

  private _pushMatrix(location: number | null, op: number, n: number, transpose: boolean, v: ArrayLike<number>): void {
    if (!this._uniformLoc(location)) return;
    this._ops.push(op, 3);
    this._num(location as number);
    this._bool(transpose);
    const m = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) m[i] = v[i];
    this._taToken(m);
  }
  uniformMatrix2fv(location: number | null, transpose: boolean, v: ArrayLike<number>): void {
    this._pushMatrix(location, OP.UNIFORM_MATRIX_2FV, 2, transpose, v);
  }
  uniformMatrix3fv(location: number | null, transpose: boolean, v: ArrayLike<number>): void {
    this._pushMatrix(location, OP.UNIFORM_MATRIX_3FV, 3, transpose, v);
  }
  uniformMatrix4fv(location: number | null, transpose: boolean, v: ArrayLike<number>): void {
    this._pushMatrix(location, OP.UNIFORM_MATRIX_4FV, 4, transpose, v);
  }

  // ------------------------------------------------------------------
  // readPixels（gl-react Node#capture 使用，写入调用方 Uint8Array）
  // ------------------------------------------------------------------

  readPixels(
    x: number,
    y: number,
    width: number,
    height: number,
    format: number,
    type: number,
    pixels?: Uint8Array | null
  ): Uint8Array | void {
    this._submit();
    const buf = new ArrayBuffer(Math.max(0, width * height * 4));
    this._exgl.readPixelsInto(this._contextId, x, y, width, height, buf);
    const u8 = new Uint8Array(buf);
    if (pixels) {
      (pixels as any).set(u8);
      return;
    }
    return u8;
  }
}

export default WebGLRenderingContextOHOS;

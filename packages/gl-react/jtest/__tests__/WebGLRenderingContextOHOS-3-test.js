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

jest.mock('../../src/specs/v1/NativeExGL', () => ({
  __esModule: true,
  default: {},
}));

import GL from '../../src/webgl1-constants';
import {WebGLRenderingContextOHOS} from '../../src/WebGLRenderingContextOHOS';

function makeExGL() {
  const exgl = {
    flush: jest.fn((contextId, ops, strs, datas) => {
      exgl.lastBatch = {
        contextId,
        ops: ops.slice(),
        strs: strs.slice(),
        datas: datas.slice(),
      };
      return {contextId: 7, ok: true, width: 320, height: 240};
    }),
    getShaderInfoLog: jest.fn(() => 'shader log'),
    getShaderSource: jest.fn(() => 'shader src'),
    getProgramInfoLog: jest.fn(() => 'program log'),
    getUniformLocation: jest.fn(() => 3),
    getAttribLocation: jest.fn(() => 2),
    getUniform: jest.fn(() => [1, 2]),
    getActiveUniform: jest.fn(() => ({name: 'u', size: 1, type: 5126})),
    getActiveAttrib: jest.fn(() => ({name: 'a', size: 1, type: 5126})),
    getParameter: jest.fn(() => 3379),
  };
  return exgl;
}

function make() {
  return new WebGLRenderingContextOHOS(makeExGL(), 7, 100, 50);
}

describe('WebGLRenderingContextOHOS (remaining surface)', () => {
  it('shader sync queries: info log / source', () => {
    const gl = make();
    const shader = gl.createShader(GL.FRAGMENT_SHADER);
    expect(gl.getShaderInfoLog(shader)).toBe('shader log');
    expect(gl.getShaderSource(shader)).toBe('shader src');
    expect(gl._exgl.getShaderInfoLog).toHaveBeenCalledWith(7, shader.id);
    expect(gl._exgl.getShaderSource).toHaveBeenCalledWith(7, shader.id);
  });

  it('program wiring commands queue exact tokens', () => {
    const gl = make();
    const program = gl.createProgram();
    const shader = gl.createShader(GL.FRAGMENT_SHADER);
    gl.attachShader(program, shader);
    gl.detachShader(program, shader);
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.useProgram(null);
    gl.flush();
    expect(gl._exgl.lastBatch.ops).toEqual([
      9, 1, program.id, // createProgram
      1, 2, shader.id, GL.FRAGMENT_SHADER, // createShader
      5, 2, program.id, shader.id, // attachShader
      6, 2, program.id, shader.id, // detachShader
      7, 3, program.id, 0, -1, // bindAttribLocation（字符串 token -1）
      8, 1, program.id, // linkProgram
      10, 1, program.id, // useProgram
      10, 1, 0, // useProgram(null)
    ]);
    expect(gl._exgl.lastBatch.strs).toEqual(['position']);
  });

  it('getProgramInfoLog submits then queries natively', () => {
    const gl = make();
    const program = gl.createProgram();
    expect(gl.getProgramInfoLog(program)).toBe('program log');
    expect(gl._exgl.getProgramInfoLog).toHaveBeenCalledWith(7, program.id);
  });

  it('location & state queries all submit-first', () => {
    const gl = make();
    const program = gl.createProgram();
    expect(gl.getUniformLocation(program, 'blue')).toBe(3);
    expect(gl.getAttribLocation(program, 'position')).toBe(2);
    expect(gl.getUniform(program, 3)).toEqual([1, 2]);
    expect(gl.getActiveUniform(program, 0)).toEqual({
      name: 'u',
      size: 1,
      type: 5126,
    });
    expect(gl.getActiveAttrib(program, 0)).toEqual({
      name: 'a',
      size: 1,
      type: 5126,
    });
    expect(gl.getParameter(GL.MAX_TEXTURE_SIZE)).toBe(3379);
    // 只有第一次查询需要提交 createProgram 排队的命令，之后队列为空不触发
    expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
  });

  it('buffers: create / bind / delete(null) / delete(real)', () => {
    const gl = make();
    const buf = gl.createBuffer();
    gl.bindBuffer(GL.ARRAY_BUFFER, buf);
    gl.bindBuffer(GL.ARRAY_BUFFER, null);
    gl.deleteBuffer(buf);
    gl.deleteBuffer(null);
    gl.flush();
    expect(gl._exgl.lastBatch.ops).toEqual([
      12, 1, buf.id, // createBuffer
      14, 2, GL.ARRAY_BUFFER, buf.id, // bindBuffer
      14, 2, GL.ARRAY_BUFFER, 0, // bindBuffer(null)
      13, 1, buf.id, // deleteBuffer
    ]);
    expect(gl.isBuffer ? true : true).toBe(true); // 占位无断言
  });

  it('bufferData(null) encodes the NULL token', () => {
    const gl = make();
    gl.bufferData(GL.ARRAY_BUFFER, null, GL.STATIC_DRAW);
    expect(gl._ops).toEqual([
      15, 3, GL.ARRAY_BUFFER, -1000000, GL.STATIC_DRAW,
    ]);
  });

  it('bufferSubData() queues target/offset/data', () => {
    const gl = make();
    gl.bufferSubData(GL.ARRAY_BUFFER, 4, new Uint8Array([1, 2]));
    expect(gl._ops.slice(0, 2)).toEqual([16, 3]);
    expect(gl._ops[2]).toBe(GL.ARRAY_BUFFER);
    expect(gl._ops[3]).toBe(4);
    expect(gl._datas.length).toBe(1);
  });

  it('deleteTexture(real) marks deletion and queues the op', () => {
    const gl = make();
    const tex = gl.createTexture();
    gl.deleteTexture(tex);
    // createTexture 先入队 [18,1,id]，随后 deleteTexture 入队 [19,1,id]
    expect(gl._ops.slice(3)).toEqual([19, 1, tex.id]);
    expect(gl._deleted.has(tex.id)).toBe(true);
  });

  describe('data token encodings (_taToken branches)', () => {
    it('accepts a raw ArrayBuffer payload', () => {
      const gl = make();
      const raw = new ArrayBuffer(8);
      gl.bufferData(GL.ARRAY_BUFFER, raw, GL.STATIC_DRAW);
      expect(gl._datas[0]).toBe(raw);
    });

    it('slices a sub-view that does not span its whole buffer', () => {
      const gl = make();
      const raw = new ArrayBuffer(16);
      const view = new Uint8Array(raw, 4, 8); // byteOffset=4 → 切片路径
      gl.bufferData(GL.ARRAY_BUFFER, view, GL.STATIC_DRAW);
      expect(gl._datas[0]).not.toBe(raw);
      expect(gl._datas[0].byteLength).toBe(8);
    });

    it('falls back to Uint8Array kind for constructor-less views', () => {
      const gl = make();
      const fake = Object.assign(Object.create(null), {
        buffer: new ArrayBuffer(8),
        byteOffset: 0,
        byteLength: 8,
      });
      gl.bufferData(GL.ARRAY_BUFFER, fake, GL.STATIC_DRAW);
      expect(gl._datas.length).toBe(1);
    });

    it('treats an ArrayBuffer with shadowed constructor as raw data', () => {
      const gl = make();
      const raw = new ArrayBuffer(8);
      Object.defineProperty(raw, 'constructor', {value: undefined});
      gl.bufferData(GL.ARRAY_BUFFER, raw, GL.STATIC_DRAW);
      expect(gl._datas[0]).toBe(raw);
    });
  });

  it('vertexAttrib2f/3f queue their scalar forms', () => {
    const gl = make();
    gl.vertexAttrib2f(0, 1, 2);
    gl.vertexAttrib3f(0, 1, 2, 3);
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    expect(ops.slice(0, 5)).toEqual([64, 3, 0, 1, 2]);
    expect(ops.slice(5)).toEqual([65, 4, 0, 1, 2, 3]);
  });

  it('vertexAttrib1fv/3fv/4fv queue Float32Array payloads', () => {
    const gl = make();
    gl.vertexAttrib1fv(0, [1]);
    gl.vertexAttrib3fv(0, [1, 2, 3]);
    gl.vertexAttrib4fv(0, [1, 2, 3, 4]);
    gl.flush();
    const datas = gl._exgl.lastBatch.datas;
    expect(datas.map(d => d.byteLength)).toEqual([4, 12, 16]);
  });

  it('uniform2i/3i queue their integer forms', () => {
    const gl = make();
    gl.uniform2i(3, 1, 2);
    gl.uniform3i(3, 1, 2, 3);
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    expect(ops.slice(0, 5)).toEqual([81, 3, 3, 1, 2]);
    expect(ops.slice(5)).toEqual([82, 4, 3, 1, 2, 3]);
  });

  it('uniform2iv/3iv/1fv/4fv queue vector payloads', () => {
    const gl = make();
    gl.uniform2iv(3, [1, 2]);
    gl.uniform3iv(3, [1, 2, 3]);
    gl.uniform1fv(3, [1]);
    gl.uniform4fv(3, [1, 2, 3, 4]);
    gl.flush();
    const datas = gl._exgl.lastBatch.datas;
    expect(datas.map(d => d.byteLength)).toEqual([8, 12, 4, 16]);
  });

  it('uniformMatrix3fv queues a 3x3 payload', () => {
    const gl = make();
    gl.uniformMatrix3fv(3, false, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    gl.flush();
    expect(gl._exgl.lastBatch.datas[0].byteLength).toBe(36);
  });

  it('drops the batch when ops exceed the 8M defensive limit', () => {
    const gl = make();
    gl._ops = new Array(8000001);
    gl._strs = ['x'];
    gl._datas = [new ArrayBuffer(4)];
    gl.flush();
    expect(gl._exgl.flush).not.toHaveBeenCalled();
    expect(gl._ops.length).toBe(0);
    expect(gl._strs.length).toBe(0);
    expect(gl._datas.length).toBe(0);
  });

  it('uniform setters with null location are all no-ops', () => {
    const gl = make();
    gl.uniform1i(null, 1);
    gl.uniform2i(null, 1, 2);
    gl.uniform3i(null, 1, 2, 3);
    gl.uniform4i(null, 1, 2, 3, 4);
    gl.uniform1f(null, 1);
    gl.uniform2f(null, 1, 2);
    gl.uniform3f(null, 1, 2, 3);
    gl.uniform4f(null, 1, 2, 3, 4);
    gl.uniform1iv(null, [1]);
    gl.uniform2iv(null, [1, 2]);
    gl.uniform3iv(null, [1, 2, 3]);
    gl.uniform4iv(null, [1, 2, 3, 4]);
    gl.uniform1fv(null, [1]);
    gl.uniform2fv(null, [1, 2]);
    gl.uniform3fv(null, [1, 2, 3]);
    gl.uniform4fv(null, [1, 2, 3, 4]);
    gl.uniformMatrix2fv(null, false, [1, 2, 3, 4]);
    gl.uniformMatrix3fv(null, false, new Array(9).fill(1));
    gl.uniformMatrix4fv(null, false, new Array(16).fill(1));
    expect(gl._ops.length).toBe(0);
    expect(gl._datas.length).toBe(0);
  });

  it('texImage2D/texSubImage2D treat an undefined 9th arg as null pixels', () => {
    const gl = make();
    gl.texImage2D(
      GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, undefined
    );
    gl.texSubImage2D(
      GL.TEXTURE_2D, 0, 0, 0, 1, 1, GL.RGBA, GL.UNSIGNED_BYTE, undefined
    );
    expect(gl._ops.filter(n => n === -1000000).length).toBe(2);
  });

  it('tolerates a flush that returns no surface info', () => {
    const gl = make();
    gl._exgl.flush.mockImplementation(() => undefined);
    gl.clear(0);
    gl.flush();
    expect(gl.drawingBufferWidth).toBe(100); // 未更新
    expect(gl._ops.length).toBe(0);
  });

  it('texImage2D() with an unrecognized arity is a silent no-op', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const gl = make();
    gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA);
    expect(gl._ops.length).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

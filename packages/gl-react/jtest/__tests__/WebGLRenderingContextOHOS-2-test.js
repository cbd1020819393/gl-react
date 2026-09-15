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

function makeExGL(opts) {
  const exgl = {
    flush: jest.fn((contextId, ops, strs, datas) => {
      exgl.lastBatch = {
        contextId,
        ops: ops.slice(),
        strs: strs.slice(),
        datas: datas.slice(),
      };
      return {
        contextId: 7,
        ok: !opts || opts.ok !== false,
        width: 320,
        height: 240,
      };
    }),
    getShaderParameter: jest.fn(() => true),
    getProgramParameterInt: jest.fn(() => 4),
    getProgramParameterBool: jest.fn(() => true),
    getUniformLocation: jest.fn(() => 3),
    getError: jest.fn(() => 0),
    getParameter: jest.fn(() => -1),
    checkFramebufferStatus: jest.fn(() => 0x8cd5),
    readPixelsInto: jest.fn(),
  };
  return exgl;
}

function make(opts) {
  return new WebGLRenderingContextOHOS(makeExGL(opts), 7, 100, 50);
}

describe('WebGLRenderingContextOHOS (command surface)', () => {
  it('queues state & drawing commands with exact opcodes', () => {
    const gl = make();
    gl.viewport(1, 2, 3, 4);
    gl.enable(0x0be2);
    gl.disable(0x0be2);
    gl.clearColor(0.1, 0.2, 0.3, 0.4);
    gl.clear(GL.COLOR_BUFFER_BIT);
    gl.blendFunc(GL.SRC_COLOR, GL.ZERO);
    gl.blendColor(1, 1, 1, 1);
    gl.blendEquation(32774);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
    gl.flushGL();
    gl.finish();
    gl.flush();
    expect(gl._exgl.lastBatch.ops).toEqual([
      40, 4, 1, 2, 3, 4, // viewport
      41, 1, 0x0be2, // enable
      42, 1, 0x0be2, // disable
      43, 4, 0.1, 0.2, 0.3, 0.4, // clearColor
      44, 1, GL.COLOR_BUFFER_BIT, // clear
      45, 2, GL.SRC_COLOR, GL.ZERO, // blendFunc
      46, 4, 1, 1, 1, 1, // blendColor
      47, 1, 32774, // blendEquation
      48, 3, GL.TRIANGLES, 0, 3, // drawArrays
      49, 0, // flushGL
      50, 0, // finish
    ]);
  });

  it('manages framebuffers and renderbuffers', () => {
    const gl = make();
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(GL.FRAMEBUFFER, fbo);
    const tex = gl.createTexture();
    gl.framebufferTexture2D(
      GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, tex, 0
    );
    gl.bindFramebuffer(GL.FRAMEBUFFER, null); // null → id 0
    const rbo = gl.createRenderbuffer();
    gl.bindRenderbuffer(GL.RENDERBUFFER, rbo);
    gl.framebufferRenderbuffer(
      GL.FRAMEBUFFER, GL.DEPTH_ATTACHMENT, GL.RENDERBUFFER, rbo
    );
    gl.deleteFramebuffer(fbo);
    gl.deleteRenderbuffer(rbo);
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    expect(ops.slice(0, 2)).toEqual([28, 1]); // createFramebuffer
    expect(ops).toContain(31); // framebufferTexture2D
    expect(ops).toContain(36); // framebufferRenderbuffer
    expect(ops.filter(n => n === 29).length).toBe(1); // deleteFramebuffer
    expect(ops.filter(n => n === 34).length).toBe(1); // deleteRenderbuffer
  });

  it('deleteFramebuffer/deleteRenderbuffer/deleteTexture ignore null', () => {
    const gl = make();
    gl.deleteFramebuffer(null);
    gl.deleteRenderbuffer(null);
    gl.deleteTexture(null);
    expect(gl._ops.length).toBe(0);
  });

  it('checkFramebufferStatus() submits queue then queries natively', () => {
    const gl = make();
    gl.clear(0);
    expect(gl.checkFramebufferStatus(GL.FRAMEBUFFER)).toBe(0x8cd5);
    expect(gl._exgl.flush).toHaveBeenCalledTimes(1);
    expect(gl._exgl.checkFramebufferStatus).toHaveBeenCalledWith(
      7,
      GL.FRAMEBUFFER
    );
  });

  it('queues texture state commands', () => {
    const gl = make();
    gl.activeTexture(GL.TEXTURE0 || 0x84c0);
    gl.bindTexture(GL.TEXTURE_2D, null);
    gl.pixelStorei(GL.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    gl.texParameterf(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, 1);
    gl.generateMipmap(GL.TEXTURE_2D);
    const tex = gl.createTexture();
    gl.bindTexture(GL.TEXTURE_2D, tex);
    const pixels = new Uint8Array([9, 9, 9, 9]);
    gl.texSubImage2D(
      GL.TEXTURE_2D, 0, 0, 0, 1, 1, GL.RGBA, GL.UNSIGNED_BYTE, pixels
    );
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    expect(ops.slice(0, 2)).toEqual([21, 1]); // activeTexture
    expect(ops).toContain(22); // pixelStorei
    expect(ops).toContain(25); // texParameteri
    expect(ops).toContain(26); // texParameterf
    expect(ops).toContain(27); // generateMipmap
    expect(ops).toContain(24); // texSubImage2D
    expect(gl._exgl.lastBatch.datas.length).toBe(1);
  });

  it('texImage2D() with null pixels encodes the NULL token', () => {
    const gl = make();
    gl.texImage2D(
      GL.TEXTURE_2D, 0, GL.RGBA, 1, 1, 0, GL.RGBA, GL.UNSIGNED_BYTE, null
    );
    expect(gl._ops[0]).toBe(23);
    expect(gl._ops[gl._ops.length - 1]).toBe(-1000000);
  });

  it('texSubImage2D() short form is a no-op', () => {
    const gl = make();
    gl.texSubImage2D(GL.TEXTURE_2D, 0, 0, 0, GL.RGBA, new Uint8Array(4));
    expect(gl._ops.length).toBe(0);
  });

  it('queues vertex attrib commands (bool normalized → 1/0)', () => {
    const gl = make();
    gl.vertexAttribPointer(0, 4, GL.FLOAT, true, 16, 0);
    gl.enableVertexAttribArray(0);
    gl.disableVertexAttribArray(0);
    gl.vertexAttrib1f(0, 1);
    gl.vertexAttrib4f(0, 1, 2, 3, 4);
    gl.vertexAttrib2fv(0, [5, 6]);
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    const ptrIdx = ops.indexOf(60);
    expect(ops.slice(ptrIdx, ptrIdx + 8)).toEqual([
      60, 6, 0, 4, GL.FLOAT, 1, 16, 0,
    ]);
    expect(ops).toContain(61); // enableVertexAttribArray
    expect(ops).toContain(62); // disableVertexAttribArray
    expect(ops).toContain(63); // vertexAttrib1f
    expect(ops).toContain(66); // vertexAttrib4f
    expect(ops).toContain(68); // vertexAttrib2fv
    expect(gl._exgl.lastBatch.datas.length).toBe(1); // 2fv data
  });

  it('queues scalar uniforms for valid locations and skips null', () => {
    const gl = make();
    gl.uniform1f(3, 0.5);
    gl.uniform2f(3, 1, 2);
    gl.uniform3f(3, 1, 2, 3);
    gl.uniform4f(3, 1, 2, 3, 4);
    gl.uniform1i(3, 7);
    gl.uniform4i(3, 1, 2, 3, 4);
    gl.uniform1f(null, 1); // null → skipped
    gl.flush();
    const ops = gl._exgl.lastBatch.ops;
    expect(ops.slice(0, 2)).toEqual([84, 2]); // UNIFORM_1F
    expect(ops).toContain(85); // 2f
    expect(ops).toContain(86); // 3f
    expect(ops).toContain(87); // 4f
    expect(ops).toContain(80); // 1i
    expect(ops).toContain(83); // 4i
    // null location 完全不产生 ops
    // 各命令 token 数：1f=4, 2f=5, 3f=6, 4f=7, 1i=4, 4i=7（opcode+argc+参数）
    expect(ops.length).toBe(4 + 5 + 6 + 7 + 4 + 7);
  });

  it('queues vector & matrix uniforms as typed array payloads', () => {
    const gl = make();
    gl.uniform1iv(3, [1]);
    gl.uniform2fv(3, [1, 2]);
    gl.uniform4iv(3, [1, 2, 3, 4]);
    gl.uniform3fv(3, [1, 2, 3]);
    gl.uniformMatrix2fv(3, false, [1, 2, 3, 4]);
    gl.uniformMatrix4fv(3, true, new Array(16).fill(1));
    gl.flush();
    expect(gl._exgl.lastBatch.datas.length).toBe(6);
    const [iv1, fv2, iv4, fv3, m2, m4] = gl._exgl.lastBatch.datas;
    expect(iv1.byteLength).toBe(4); // Int32Array(1)
    expect(fv2.byteLength).toBe(8); // Float32Array(2)
    expect(iv4.byteLength).toBe(16);
    expect(fv3.byteLength).toBe(12);
    expect(m2.byteLength).toBe(16); // 2x2
    expect(m4.byteLength).toBe(64); // 4x4
  });

  it.failing(
    'treats location 0 as a valid uniform location (native returns -1 for null)',
    () => {
      // 现状：_uniformLoc 用真值判断，location 0（合法 GL location）被当成
      // null 而静默丢弃；契约上应以 location === null || location < 0 判定
      const gl = make();
      gl.uniform1f(0, 0.5);
      expect(gl._ops.length).toBe(4); // [84, 2, 0, 0.5]
    }
  );

  describe('readPixels', () => {
    it('returns a new Uint8Array when no target is given', () => {
      const gl = make();
      gl.clear(0);
      const out = gl.readPixels(0, 0, 2, 2, GL.RGBA, GL.UNSIGNED_BYTE);
      expect(out).toBeInstanceOf(Uint8Array);
      expect(out.length).toBe(16);
      expect(gl._exgl.readPixelsInto).toHaveBeenCalledTimes(1);
      const args = gl._exgl.readPixelsInto.mock.calls[0];
      expect(args[0]).toBe(7);
      expect(args[5]).toBeInstanceOf(ArrayBuffer);
    });

    it('writes into the provided pixels buffer and returns void', () => {
      const gl = make();
      const pixels = new Uint8Array(16);
      const out = gl.readPixels(
        0, 0, 2, 2, GL.RGBA, GL.UNSIGNED_BYTE, pixels
      );
      expect(out).toBeUndefined();
      expect(pixels.length).toBe(16);
    });
  });

  describe('surface state transitions', () => {
    it('notifies _onSurfaceStateChange when ok flips and marks context lost', () => {
      const exgl = makeExGL({ok: false});
      const gl = new WebGLRenderingContextOHOS(exgl, 7, 100, 50);
      const onChange = jest.fn();
      gl._onSurfaceStateChange = onChange;
      gl.clear(0);
      gl.flush();
      expect(gl.isContextLost()).toBe(true);
      expect(onChange).toHaveBeenCalledWith(false);
      // 恢复可用
      exgl.flush.mockImplementation((c, ops, strs, datas) => {
        exgl.lastBatch = {contextId: c, ops: ops.slice()};
        return {contextId: 7, ok: true, width: 320, height: 240};
      });
      gl.clear(0);
      gl.flush();
      expect(gl.isContextLost()).toBe(false);
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });
});

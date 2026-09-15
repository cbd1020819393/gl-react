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

import GLSL from '../../src/GLSL';
import {GLSLSymbol} from '../../src/GLSL';

describe('GLSL', () => {
  it('returns the raw string when there is no interpolation', () => {
    expect(GLSL`precision highp float;`).toBe('precision highp float;');
  });

  it('interpolates a value between template strings', () => {
    const v = '0.5';
    expect(GLSL`uniform float x = ${v};`).toBe('uniform float x = 0.5;');
  });

  it('concatenates multiple interpolations in order', () => {
    expect(GLSL`${'a'} + ${'b'};`).toBe('a + b;');
  });

  it('exports the GLSLSymbol constant', () => {
    expect(GLSLSymbol).toBe('GLSL');
  });
});

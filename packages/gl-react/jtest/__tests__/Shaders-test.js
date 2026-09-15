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
import Shaders, {
  ensureShaderDefinition,
  isShaderIdentifier,
  shaderDefinitionToShaderInfo,
  shaderInfoEquals,
} from '../../src/Shaders';

describe('Shaders', () => {
  it('create() returns a sheet of frozen shader identifiers', () => {
    const sheet = Shaders.create({hello: {frag: GLSL`void main() {}`}});
    const id = sheet.hello;
    expect(isShaderIdentifier(id)).toBe(true);
    expect(Object.isFrozen(id)).toBe(true);
    expect(typeof id.id).toBe('string');
  });

  it('each declared shader gets a unique id', () => {
    const s1 = Shaders.create({a: {frag: GLSL`void main() {}`}});
    const s2 = Shaders.create({a: {frag: GLSL`void main() {}`}});
    expect(s1.a.id).not.toBe(s2.a.id);
  });

  it('get() returns frag with a SHADER_NAME define and the static vert', () => {
    const sheet = Shaders.create({named: {frag: GLSL`void main() {}`}});
    const info = Shaders.get(sheet.named);
    expect(info.frag).toBe(
      'void main() {}\n#define SHADER_NAME named\n'
    );
    expect(info.vert).toContain('#define SHADER_NAME named');
    expect(info.vert).toContain('gl_Position');
  });

  it('get() throws for an unknown identifier', () => {
    expect(() => Shaders.get({type: 'ShaderID', id: 'nope'})).toThrow();
  });

  it('getName()/getShortName() resolve the declaration name', () => {
    const sheet = Shaders.create({myShader: {frag: GLSL`void main() {}`}});
    expect(Shaders.getShortName(sheet.myShader)).toBe('myShader');
    expect(Shaders.getName(sheet.myShader)).toBe(
      'myShader#' + sheet.myShader.id
    );
  });

  it('isShaderIdentifier rejects non identifiers', () => {
    expect(isShaderIdentifier(null)).toBe(false);
    expect(isShaderIdentifier(undefined)).toBe(false);
    expect(isShaderIdentifier('ShaderID')).toBe(false);
    expect(isShaderIdentifier({})).toBe(false);
    expect(isShaderIdentifier({type: 'ShaderID'})).toBe(false);
    expect(isShaderIdentifier({type: 'ShaderID', id: 42})).toBe(false);
  });

  describe('ensureShaderDefinition', () => {
    it('passes through a valid definition', () => {
      const def = {frag: 'void main() {}'};
      expect(ensureShaderDefinition(def)).toBe(def);
    });

    it('throws with the declaration context when frag is missing', () => {
      expect(() =>
        ensureShaderDefinition({}, ' in Shaders.create({ hello: ... })')
      ).toThrow('A `frag` GLSL code (string) is required');
    });
  });

  describe('shaderDefinitionToShaderInfo', () => {
    it('infers GLSL version 100 by default', () => {
      const info = shaderDefinitionToShaderInfo(
        {frag: 'void main() {}'},
        's'
      );
      expect(info.vert).toContain('_p');
      expect(info.frag).toContain('#define SHADER_NAME s');
    });

    it('infers the "#version 300 es" header', () => {
      const info = shaderDefinitionToShaderInfo(
        {frag: GLSL`#version 300 es
out vec4 c;
void main() { c = vec4(1.0); }`},
        's'
      );
      expect(info.vert).toContain('#version 300 es');
    });

    it('throws when vert and frag GLSL versions mismatch', () => {
      expect(() =>
        shaderDefinitionToShaderInfo(
          {
            frag: '#version 300 es\nvoid main() {}',
            vert: 'attribute vec2 _p;\nvoid main() {}',
          },
          's'
        )
      ).toThrow('GLSL shader vert and frag version must match');
    });

    it('throws for an unsupported version without a custom vert', () => {
      expect(() =>
        shaderDefinitionToShaderInfo(
          {frag: '#version 200\nvoid main() {}'},
          's'
        )
      ).toThrow(/could not find static vertex shader/);
    });
  });

  it('shaderInfoEquals compares frag and vert', () => {
    const info = {frag: 'f', vert: 'v'};
    expect(shaderInfoEquals(info, {frag: 'f', vert: 'v'})).toBe(true);
    expect(shaderInfoEquals(info, {frag: 'x', vert: 'v'})).toBe(false);
    expect(shaderInfoEquals(info, {frag: 'f', vert: 'x'})).toBe(false);
  });

  it('shaderDefinitionToShaderInfo skips the name define when name is empty', () => {
    const info = shaderDefinitionToShaderInfo({frag: 'void main() {}'}, '');
    expect(info.frag).toBe('void main() {}');
    expect(info.frag).not.toContain('SHADER_NAME');
  });

  it('uses a custom vert as-is when provided with matching version', () => {
    const info = shaderDefinitionToShaderInfo(
      {
        frag: 'void main() {}',
        vert: 'attribute vec2 _p;\nvoid main() {}',
      },
      's'
    );
    expect(info.vert).toBe(
      'attribute vec2 _p;\nvoid main() {}\n#define SHADER_NAME s\n'
    );
  });

  it('getName()/getShortName() fall back to "???" for unknown ids', () => {
    const unknown = {type: 'ShaderID', id: 'zz'};
    expect(Shaders.getShortName(unknown)).toBe('???');
    expect(Shaders.getName(unknown)).toBe('???#zz');
  });
});

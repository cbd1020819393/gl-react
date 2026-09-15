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

import VisitorLogger from '../../src/VisitorLogger';

function fakeNode(overrides) {
  return Object.assign(
    {
      getGLName: () => 'node1',
      getGLSize: () => [10, 20],
      props: {blendFunc: {src: 'SRC_COLOR'}, clear: null},
      context: {glSurface: {gl: {}}},
      _needsRedraw: true,
    },
    overrides
  );
}

function spyConsole() {
  const spies = ['log', 'error', 'group', 'groupCollapsed', 'groupEnd'].map(
    m => jest.spyOn(console, m).mockImplementation(() => {})
  );
  return {
    calls: m =>
      console[m].mock.calls.reduce(
        (acc, c) => acc.concat(c.map(x => String(x))),
        []
      ),
    restore: () => spies.forEach(s => s.mockRestore()),
  };
}

describe('VisitorLogger (node lifecycle)', () => {
  it('onNodeSyncDeps logs additions by name', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const node = fakeNode();
      const dep1 = {getGLName: () => 'dep1'};
      const dep2 = {getGLName: () => 'dep2'};
      v.onNodeSyncDeps(node, [dep1], [dep2]);
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('+deps dep1');
    } finally {
      consoleSpy.restore();
    }
  });

  // 已知缺陷：-deps 行错用 additions 的名字（VisitorLogger.onNodeSyncDeps
  // 内部 map 的是 additions 而非 deletions）。修复后 jest 会提示移除 .failing。
  it.failing('onNodeSyncDeps logs deletions by their own names', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const node = fakeNode();
      const dep1 = {getGLName: () => 'dep1'};
      const dep2 = {getGLName: () => 'dep2'};
      v.onNodeSyncDeps(node, [dep1], [dep2]);
      expect(consoleSpy.calls('log').join(' ')).toContain('-deps dep2');
    } finally {
      consoleSpy.restore();
    }
  });

  it('onNodeSyncDeps is silent for empty dep changes', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      v.onNodeSyncDeps(fakeNode(), [], []);
      expect(consoleSpy.calls('log')).toEqual([]);
    } finally {
      consoleSpy.restore();
    }
  });

  it('onNodeDrawSkipped explains why (no gl / no redraw needed)', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      v.onNodeDrawSkipped(
        fakeNode({context: {glSurface: {gl: null}}})
      );
      v.onNodeDrawSkipped(fakeNode({_needsRedraw: false}));
      v.onNodeDrawSkipped(fakeNode());
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('no gl context available!');
      expect(logged).toContain('no need to redraw');
    } finally {
      consoleSpy.restore();
    }
  });

  it('onNodeDraw logs size, clear, blendFunc and every prepared uniform', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const node = fakeNode();
      const textureOptions = {min: 'LINEAR'};
      const preparedUniforms = [
        {key: 'blue', type: 'float', value: 0.5},
        {key: 'colors', type: 'float[2]', value: [1, 2]},
        {key: 'tex', type: undefined, value: {uri: 'a.png'},
         getMetaInfo: () => ({
           dependency: {getGLName: () => 'texGL1'},
           textureOptions,
         })},
        {key: 'empty', type: null, value: undefined},
      ];
      v.onNodeDraw(node, preparedUniforms);
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('10');
      expect(logged).toContain('4 uniforms');
      expect(logged).toContain('blue');
      expect(logged).toContain('texGL1'); // aggregateInfo(dependency)
      // textureOptions 以对象形式展开进 console.log 参数
      const hasOptions = console.log.mock.calls
        .some(call => call.some(arg => arg === textureOptions));
      expect(hasOptions).toBe(true);
      expect(console.group).toHaveBeenCalled();
    } finally {
      consoleSpy.restore();
    }
  });

  it('onNodeDrawEnd pairs with onNodeDrawStart to close the node group', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const surface = {getGLName: () => 's', getGLSize: () => [1, 1]};
      v.onSurfaceDrawStart(surface); // lvl 1
      v.onNodeDrawStart(fakeNode()); // lvl 2
      v.onNodeDraw(fakeNode(), []); // lvl 3
      v.onNodeDrawEnd(); // lvl 1（成对关闭 node 组）
      expect(v.groupNestedLvl).toBe(1);
      v.onSurfaceDrawEnd(); // lvl 0
      expect(v.groupNestedLvl).toBe(0);
    } finally {
      consoleSpy.restore();
    }
  });

  it('onSurfaceDrawSkipped is a silent no-op hook', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      expect(v.onSurfaceDrawSkipped(fakeNode())).toBeUndefined();
      expect(consoleSpy.calls('log')).toEqual([]);
    } finally {
      consoleSpy.restore();
    }
  });

  it('onSurfaceDrawError with no nested groups just reports', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const handled = v.onSurfaceDrawError(new Error('nope'));
      expect(handled).toBe(true);
      expect(v.groupNestedLvl).toBe(0);
      expect(console.groupEnd).not.toHaveBeenCalled();
    } finally {
      consoleSpy.restore();
    }
  });

  it('aggregateInfo supports a list payload and initialObj fallback', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const preparedUniforms = [
        {key: 'arr', type: 'list', value: 1, getMetaInfo: () => [
          {dependency: {getGLName: () => 'glA'}},
          {initialObj: 'raw.tex'},
        ]},
        {key: 'plain', type: 'tex', value: 2,
         getMetaInfo: () => ({initialObj: 'plain.tex'})},
      ];
      v.onNodeDraw(fakeNode(), preparedUniforms);
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('glA');
      expect(logged).toContain('raw.tex');
      expect(logged).toContain('plain.tex');
    } finally {
      consoleSpy.restore();
    }
  });
});

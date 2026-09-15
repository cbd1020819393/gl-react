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

function fakeSurface(name) {
  return {
    getGLName: () => name,
    getGLSize: () => [100, 50],
  };
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

describe('VisitorLogger', () => {
  it('logs context acquisition and loss', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      const surface = fakeSurface('surface1');
      v.onSurfaceGLContextChange(surface, {});
      v.onSurfaceGLContextChange(surface, null);
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('surface1');
      expect(logged).toContain('context acquired');
      expect(logged).toContain('context lost');
    } finally {
      consoleSpy.restore();
    }
  });

  it('logs the surface size on draw start', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      v.onSurfaceDrawStart(fakeSurface('surface1'));
      const logged = consoleSpy.calls('log').join(' ');
      expect(logged).toContain('100');
      expect(logged).toContain('50');
    } finally {
      consoleSpy.restore();
    }
  });

  it('onSurfaceDrawError reports the error, closes groups and swallows', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      v.onSurfaceDrawStart(fakeSurface('surface1'));
      v.onNodeDrawStart(fakeSurface('n'));
      const handled = v.onSurfaceDrawError(new Error('draw failed'));
      expect(handled).toBe(true);
      expect(consoleSpy.calls('error').join(' ')).toContain('draw failed');
      expect(console.groupEnd).toHaveBeenCalled();
      expect(v.groupNestedLvl).toBe(0);
    } finally {
      consoleSpy.restore();
    }
  });

  it('onSurfaceDrawEnd closes the draw group', () => {
    const consoleSpy = spyConsole();
    try {
      const v = new VisitorLogger();
      v.onSurfaceDrawStart(fakeSurface('surface1'));
      const before = console.groupEnd.mock.calls.length;
      v.onSurfaceDrawEnd();
      expect(console.groupEnd.mock.calls.length).toBe(before + 1);
      expect(v.groupNestedLvl).toBe(0);
    } finally {
      consoleSpy.restore();
    }
  });
});

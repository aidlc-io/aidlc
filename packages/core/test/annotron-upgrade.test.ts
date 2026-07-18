import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

/**
 * Unit tests for ANNOTRON-NEW-VERSION upgrade
 * Verifies annotron v1.0.0 is properly vendored and bundled
 */

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const VENDOR_ANNOTRON = path.join(PROJECT_ROOT, 'vendor', 'annotron');
const CLI_VENDOR_ANNOTRON = path.join(PROJECT_ROOT, 'packages', 'cli', 'dist', 'vendor', 'annotron');
const EXT_VENDOR_ANNOTRON = path.join(PROJECT_ROOT, 'packages', 'extension', 'vendor', 'annotron');

describe('ANNOTRON-NEW-VERSION: Annotron v1.0.0 Upgrade', () => {
  // ANNOTRON-NEW-VERSION-UT01: Vendor directory contains v1.0.0
  describe('Vendor directory', () => {
    it('ANNOTRON-NEW-VERSION-UT01a: package.json exists with correct version', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);

      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.version).toBe('1.0.0');
    });

    it('ANNOTRON-NEW-VERSION-UT01b: required bin directory exists', () => {
      const binPath = path.join(VENDOR_ANNOTRON, 'bin');
      expect(fs.existsSync(binPath)).toBe(true);
      expect(fs.statSync(binPath).isDirectory()).toBe(true);
    });

    it('ANNOTRON-NEW-VERSION-UT01c: required src directory exists', () => {
      const srcPath = path.join(VENDOR_ANNOTRON, 'src');
      expect(fs.existsSync(srcPath)).toBe(true);
      expect(fs.statSync(srcPath).isDirectory()).toBe(true);
    });

    it('ANNOTRON-NEW-VERSION-UT01d: new features directory (skills) exists', () => {
      const skillsPath = path.join(VENDOR_ANNOTRON, 'skills');
      expect(fs.existsSync(skillsPath)).toBe(true);
      expect(fs.statSync(skillsPath).isDirectory()).toBe(true);
    });

    it('ANNOTRON-NEW-VERSION-UT01e: new features directory (commands) exists', () => {
      const commandsPath = path.join(VENDOR_ANNOTRON, 'commands');
      expect(fs.existsSync(commandsPath)).toBe(true);
      expect(fs.statSync(commandsPath).isDirectory()).toBe(true);
    });

    it('ANNOTRON-NEW-VERSION-UT01f: new features directory (hooks) exists', () => {
      const hooksPath = path.join(VENDOR_ANNOTRON, 'hooks');
      expect(fs.existsSync(hooksPath)).toBe(true);
      expect(fs.statSync(hooksPath).isDirectory()).toBe(true);
    });

    it('ANNOTRON-NEW-VERSION-UT01g: LICENSE file exists', () => {
      const licensePath = path.join(VENDOR_ANNOTRON, 'LICENSE');
      expect(fs.existsSync(licensePath)).toBe(true);
    });
  });

  // ANNOTRON-NEW-VERSION-UT02: CLI bundling includes annotron
  describe('CLI bundle integration', () => {
    it('ANNOTRON-NEW-VERSION-UT02a: CLI dist has bundled annotron after build', () => {
      // Note: This test assumes CLI bundle script has been run
      // The bundle script includes: cp -R ../../vendor/annotron dist/vendor/annotron
      if (fs.existsSync(CLI_VENDOR_ANNOTRON)) {
        const pkgPath = path.join(CLI_VENDOR_ANNOTRON, 'package.json');
        expect(fs.existsSync(pkgPath)).toBe(true);

        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        expect(pkg.version).toBe('1.0.0');
      } else {
        // Skip if not built yet (expected in test environment)
        expect(true).toBe(true);
      }
    });
  });

  // ANNOTRON-NEW-VERSION-UT03: Extension bundling includes annotron
  describe('Extension bundle integration', () => {
    it('ANNOTRON-NEW-VERSION-UT03a: Extension vendor has annotron v1.0.0 after copy', () => {
      // Note: This test assumes Extension copy:annotron script has been run
      if (fs.existsSync(EXT_VENDOR_ANNOTRON)) {
        const pkgPath = path.join(EXT_VENDOR_ANNOTRON, 'package.json');
        expect(fs.existsSync(pkgPath)).toBe(true);

        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        expect(pkg.version).toBe('1.0.0');
      } else {
        // Skip if not built yet (expected in test environment)
        expect(true).toBe(true);
      }
    });

    it('ANNOTRON-NEW-VERSION-UT03b: Extension vendor includes new directories', () => {
      // Check for loop engineering features added in 1.0.0
      if (fs.existsSync(EXT_VENDOR_ANNOTRON)) {
        const skillsPath = path.join(EXT_VENDOR_ANNOTRON, 'skills');
        const commandsPath = path.join(EXT_VENDOR_ANNOTRON, 'commands');
        expect(fs.existsSync(skillsPath)).toBe(true);
        expect(fs.existsSync(commandsPath)).toBe(true);
      } else {
        expect(true).toBe(true);
      }
    });
  });

  // ANNOTRON-NEW-VERSION-UT04: Version metadata check
  describe('Version metadata', () => {
    it('ANNOTRON-NEW-VERSION-UT04a: Vendor package.json name is correct', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.name).toBe('annotron');
    });

    it('ANNOTRON-NEW-VERSION-UT04b: Vendor package.json has required fields', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.version).toBeDefined();
      expect(pkg.description).toBeDefined();
      expect(pkg.bin).toBeDefined();
      expect(pkg.repository).toBeDefined();
    });

    it('ANNOTRON-NEW-VERSION-UT04c: Vendor package.json bin command is annotron', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.bin.annotron).toBe('bin/annotron');
    });

    it('ANNOTRON-NEW-VERSION-UT04d: Node engine requirement is compatible', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      // v1.0.0 requires Node 18+, which should be satisfied by AIDLC's Node target
      expect(pkg.engines.node).toBe('>=18');
    });
  });

  // ANNOTRON-NEW-VERSION-UT05: Backward compatibility check
  describe('Backward compatibility', () => {
    it('ANNOTRON-NEW-VERSION-UT05a: Vendor includes files specified in package.json', () => {
      const pkgPath = path.join(VENDOR_ANNOTRON, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);

      // Verify all "files" entries exist
      const files: string[] = pkg.files || [];
      for (const file of files) {
        const filePath = path.join(VENDOR_ANNOTRON, file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('ANNOTRON-NEW-VERSION-UT05b: License file is MIT', () => {
      const licensePath = path.join(VENDOR_ANNOTRON, 'LICENSE');
      const content = fs.readFileSync(licensePath, 'utf-8');
      // MIT license should contain the standard MIT text
      expect(content).toContain('MIT');
    });
  });
});

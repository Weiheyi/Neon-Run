#!/usr/bin/env node
'use strict';

/**
 * 构建期代码防护脚本
 *
 * 把 app/ 下的前端源码与主进程脚本做混淆压缩，输出到 build-protected/。
 * 打包（electron-builder）与网页部署（GitHub Pages）都只使用 build-protected/，
 * 因此发布出去的程序里不存在可读的原始源码。
 *
 *   node tools/protect.js
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.resolve(__dirname, '..');
const SRC_APP = path.join(ROOT, 'app');
const OUT = path.join(ROOT, 'build-protected');
const OUT_APP = path.join(OUT, 'app');

// 混淆强度和随机种子固定，保证同一份源码每次产物一致（便于更新包比对）
const SEED = 20260918;

const common = {
  compact: true,
  simplify: true,
  renameGlobals: false,          // 保留 window.menu / onclick 里用到的全局函数
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayThreshold: 0.85,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  splitStrings: true,
  splitStringsChunkLength: 12,
  numbersToExpressions: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,      // 体积膨胀明显，收益有限，关闭
  selfDefending: true,           // 二次格式化/改写后立即失效
  disableConsoleOutput: false,
  unicodeEscapeSequence: false,
  sourceMap: false,
  seed: SEED,
};

const browserOptions = { ...common, target: 'browser' };
const nodeOptions = { ...common, target: 'node' };

function obfuscate(code, options, label) {
  try {
    return JavaScriptObfuscator.obfuscate(code, options).getObfuscatedCode();
  } catch (error) {
    throw new Error('混淆 ' + label + ' 失败：' + (error && error.message ? error.message : error));
  }
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function report(label, before, after) {
  const from = (before / 1024).toFixed(1);
  const to = (after / 1024).toFixed(1);
  console.log('  ' + label.padEnd(18) + from.padStart(8) + ' KB  ->' + to.padStart(9) + ' KB');
}

function protectScript(sourceFile, targetFile, options, label) {
  const source = read(sourceFile);
  const output = obfuscate(source, options, label);
  write(targetFile, output);
  report(label, Buffer.byteLength(source), Buffer.byteLength(output));
  return output;
}

// 只混淆内联 <script>（带 src 的外链脚本单独处理），保留其余 HTML 不变
function protectHtml(sourceFile, targetFile, label) {
  const source = read(sourceFile);
  let count = 0;
  const output = source.replace(
    /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, code) => {
      if (!code.trim()) return match;
      count += 1;
      return '<script' + attrs + '>' + obfuscate(code, browserOptions, label) + '</script>';
    }
  );
  if (count === 0) throw new Error(label + ' 里没有找到可混淆的内联脚本');
  write(targetFile, output);
  report(label + ' (' + count + '段)', Buffer.byteLength(source), Buffer.byteLength(output));
}

function copyAppAssets() {
  fs.cpSync(SRC_APP, OUT_APP, {
    recursive: true,
    filter: (src) => path.basename(src) !== '.commandcode',
  });
}

// electron-builder 把 build-protected/ 当作应用根目录（directories.app），
// 所以这里要放一份精简的 package.json，只保留运行时需要的字段
function writeAppManifest() {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const manifest = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description,
    main: pkg.main,
    author: pkg.author,
    license: pkg.license,
  };
  write(path.join(OUT, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('  ' + 'package.json'.padEnd(18) + '已生成（应用根目录清单）');
}

function main() {
  if (!fs.existsSync(path.join(ROOT, 'main.js'))) {
    throw new Error('请在项目根目录运行：找不到 main.js');
  }
  console.log('开始生成受保护的构建产物 -> ' + path.relative(ROOT, OUT));
  fs.rmSync(OUT, { recursive: true, force: true });

  copyAppAssets();
  writeAppManifest();

  protectScript(path.join(ROOT, 'main.js'), path.join(OUT, 'main.js'), nodeOptions, 'main.js');
  protectScript(path.join(ROOT, 'preload.js'), path.join(OUT, 'preload.js'), nodeOptions, 'preload.js');
  protectScript(path.join(SRC_APP, 'pc.js'), path.join(OUT_APP, 'pc.js'), browserOptions, 'app/pc.js');
  protectHtml(path.join(SRC_APP, 'index.html'), path.join(OUT_APP, 'index.html'), 'app/index.html');
  protectHtml(path.join(SRC_APP, 'account.html'), path.join(OUT_APP, 'account.html'), 'app/account.html');

  console.log('完成，受保护代码在 ' + path.relative(ROOT, OUT));
}

main();

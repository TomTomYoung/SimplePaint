#!/usr/bin/env node
// スクリプト: 全ツールファイルにプロパティ定義を追加する

const fs = require('fs');
const path = require('path');

// tool-props.jsからプロパティ定義を抽出
const toolPropsContent = fs.readFileSync(
  path.join(__dirname, '../src/gui/tool-props.js'),
  'utf-8'
);

// toolPropDefsオブジェクトを解析（簡易的な正規表現ベース）
const toolPropDefsMatch = toolPropsContent.match(
  /export const toolPropDefs = \{([\s\S]*?)\n\};/
);
if (!toolPropDefsMatch) {
  console.error('toolPropDefsが見つかりません');
  process.exit(1);
}

const toolPropDefsText = toolPropDefsMatch[1];

// 各ツールIDとそのプロパティ定義をマッピング
const toolProperties = {};

// ツールごとのプロパティ定義を抽出（行ベース）
const lines = toolPropDefsText.split('\n');
let currentTool = null;
let currentValue = '';
let bracketDepth = 0;

lines.forEach((line) => {
  const toolMatch = line.match(/^\s*(['\"]?)([a-z0-9-]+)\1:\s*(\[.*)/);
  if (toolMatch) {
    if (currentTool && currentValue) {
      toolProperties[currentTool] = currentValue.trim();
    }
    currentTool = toolMatch[2];
    currentValue = toolMatch[3];
    bracketDepth = (currentValue.match(/\[/g) || []).length - (currentValue.match(/\]/g) || []).length;
    if (bracketDepth === 0) {
      toolProperties[currentTool] = currentValue.replace(/,$/, '').trim();
      currentTool = null;
      currentValue = '';
    }
  } else if (currentTool) {
    currentValue += '\n' + line;
    bracketDepth += (line.match(/\[/g) || []).length;
    bracketDepth -= (line.match(/\]/g) || []).length;
    if (bracketDepth === 0) {
      toolProperties[currentTool] = currentValue.replace(/,$/, '').trim();
      currentTool = null;
      currentValue = '';
    }
  }
});

// ツールとファイルパスのマッピング
const toolFiles = {
  // Drawing tools
  'pencil': 'drawing/pencil.js',
  'pencil-click': 'drawing/pencil-click.js',
  'brush': 'drawing/brush.js',
  'minimal': 'drawing/minimal.js',
  'smooth': 'drawing/smooth.js',
  'freehand': 'drawing/freehand.js',
  'freehand-click': 'drawing/freehand-click.js',
  'aa-line-brush': 'drawing/aa_line_brush.js',
  'pixel-brush': 'drawing/pixel_brush.js',
  'blur-brush': 'drawing/blur_brush.js',
  'edge-aware-paint': 'drawing/edge_aware_paint.js',
  'noise-displaced': 'drawing/noise-displaced.js',
  'eraser': 'drawing/eraser.js',
  'eraser-click': 'drawing/eraser-click.js',
  // Special brushes
  'texture-brush': 'special/texture-brush.js',
  'tess-stroke': 'special/tessellated-stroke.js',
  'watercolor': 'special/watercolor.js',
  'calligraphy': 'special/calligraphy.js',
  'bristle': 'special/bristle.js',
  'scatter': 'special/scatter.js',
  'smudge': 'special/smudge.js',
  'meta-brush': 'special/meta_brush.js',
  'stroke-boil': 'special/stroke_boil_brush.js',
  // Shapes
  'line': 'shapes/shape.js',
  'rect': 'shapes/shape.js',
  'ellipse': 'shapes/shape.js',
  'arc': 'shapes/arc.js',
  'sector': 'shapes/sector.js',
  'ellipse-2': 'shapes/ellipse-2.js',
  // Curves
  'quad': 'curves/quadratic.js',
  'cubic': 'curves/cubic.js',
  'catmull': 'curves/catmull.js',
  'bspline': 'curves/bspline.js',
  'nurbs': 'curves/nurbs.js',
  // Fill
  'bucket': 'fill/bucket.js',
  'eyedropper': 'fill/eyedropper.js',
  // Vector
  'vector-tool': 'vector/vector-tool.js',
  'path-bool': 'vector/path_booleans_v2.js',
  // Text
  'text': 'text/text-tool.js',
  // Selection
  'select-rect': 'selection/select-rect.js',
};

// プロパティ定義文字列を解析してプロパティ配列を生成する関数
function convertPropertyDef(toolId, propDefStr) {
  // 共通プロパティの置き換えマッピング
  const replacements = {
    '...strokeProps': 'strokeProps',
    'opacityProp': 'opacityProp',
    '...smoothProps': 'smoothProps',
    '...fillProps': 'fillProps',
    '...aaProp': 'aaProp',
    '...strokeStyleExtras': 'strokeStyleExtras',
    'cornerRadiusProp': 'cornerRadiusProp',
    '...textProps': 'textProps',
    '...nurbsProp': 'nurbsProp',
  };

  let result = propDefStr;

  // 共通プロパティの参照を置き換え
  Object.entries(replacements).forEach(([pattern, replacement]) => {
    result = result.replace(new RegExp(pattern.replace(/\./g, '\\.'), 'g'), `...${replacement}`);
  });

  return result;
}

// プロパティ定義が共通プロパティのみかカスタムプロパティを含むかを判定
function getImportStatement(propDefStr) {
  const imports = [];

  if (propDefStr.includes('strokeProps')) imports.push('strokeProps');
  if (propDefStr.includes('opacityProp')) imports.push('opacityProp');
  if (propDefStr.includes('smoothProps')) imports.push('smoothProps');
  if (propDefStr.includes('fillProps')) imports.push('fillProps');
  if (propDefStr.includes('aaProp')) imports.push('aaProp');
  if (propDefStr.includes('strokeStyleExtras')) imports.push('strokeStyleExtras');
  if (propDefStr.includes('cornerRadiusProp')) imports.push('cornerRadiusProp');
  if (propDefStr.includes('textProps')) imports.push('textProps');
  if (propDefStr.includes('nurbsProp')) imports.push('nurbsProp');

  if (imports.length === 0) return '';

  return `import { ${imports.join(', ')} } from '../base/common-properties.js';\n`;
}

// 各ツールファイルを更新
Object.entries(toolFiles).forEach(([toolId, relPath]) => {
  const propDef = toolProperties[toolId];
  if (!propDef) {
    console.log(`⚠ ${toolId}: プロパティ定義なし（スキップ）`);
    return;
  }

  const filePath = path.join(__dirname, '../src/tools', relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`⚠ ${toolId}: ファイルが見つかりません: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // すでにproperties exportが存在する場合はスキップ
  if (content.includes('export const properties')) {
    console.log(`⏭ ${toolId}: すでにproperties定義が存在（スキップ）`);
    return;
  }

  const convertedProp = convertPropertyDef(toolId, propDef);
  const importStatement = getImportStatement(convertedProp);

  // Import文を追加（ファイル冒頭のコメント後）
  if (importStatement) {
    const lines = content.split('\n');
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('//') || lines[i].trim() === '') {
        continue;
      }
      if (lines[i].trim().startsWith('import') || lines[i].trim().startsWith('export')) {
        // 既存のimport文の後に挿入
        insertIndex = i;
        while (insertIndex < lines.length &&
               (lines[insertIndex].trim().startsWith('import') ||
                lines[insertIndex].trim().startsWith('export') ||
                lines[insertIndex].trim() === '')) {
          insertIndex++;
        }
        break;
      }
      insertIndex = i;
      break;
    }
    lines.splice(insertIndex, 0, importStatement.trimEnd());
    content = lines.join('\n');
  }

  // Properties定義を追加（ファイル末尾）
  const propertyExport = `\nexport const properties = ${convertedProp};\n`;
  content += propertyExport;

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`✓ ${toolId}: プロパティ定義を追加`);
});

console.log('\n完了！');

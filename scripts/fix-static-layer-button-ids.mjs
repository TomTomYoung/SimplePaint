import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = new URL('../index.html', import.meta.url);

const REPLACEMENTS = [
  {
    from: '<button id="addLayerBtn">レイヤー追加</button>',
    to: '<button id="toolbarAddLayerBtn" data-action="add-layer" data-action-role="toolbar">レイヤー追加</button>',
  },
  {
    from: '<button id="addVectorLayerBtn">ベクター追加</button>',
    to: '<button id="toolbarAddVectorLayerBtn" data-action="add-vector-layer" data-action-role="toolbar">ベクター追加</button>',
  },
  {
    from: '<button id="addLayerBtn">＋</button>',
    to: '<button id="addLayerBtn" data-action="add-layer" data-action-role="panel">＋</button>',
  },
  {
    from: '<button id="addVectorLayerBtn" title="ベクターレイヤーを追加">＋V</button>',
    to: '<button id="addVectorLayerBtn" data-action="add-vector-layer" data-action-role="panel" title="ベクターレイヤーを追加">＋V</button>',
  },
];

const html = await readFile(INDEX_PATH, 'utf8');
let next = html;

for (const { from, to } of REPLACEMENTS) {
  if (!next.includes(from)) {
    throw new Error(`Expected markup not found: ${from}`);
  }
  next = next.replace(from, to);
}

await writeFile(INDEX_PATH, next);
console.log('Updated static layer button IDs in index.html');

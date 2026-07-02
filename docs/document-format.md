# SimplePaint document snapshot format

## v1 legacy autosave

The legacy autosave payload stores the flattened document image only.

```js
{
  dataURL: 'data:image/png;base64,...',
  width: 1280,
  height: 720,
  ts: 1234567890,
  vectorLayer: { /* active vector-layer state */ }
}
```

This format is still accepted by `applySnapshotToDocument()` for backward compatibility, but it cannot restore the editable raster layer stack.

## v2 layered autosave

The current autosave payload is versioned and layer-aware.

```js
{
  version: 2,
  width: 1280,
  height: 720,
  activeLayer: 0,
  layers: [
    {
      id: 'L...',
      name: 'Layer 1',
      type: 'raster',
      visible: true,
      opacity: 1,
      mode: 'source-over',
      clip: false,
      dataURL: 'data:image/png;base64,...'
    },
    {
      id: 'L...',
      name: 'Vector Layer 2',
      type: 'vector',
      visible: true,
      opacity: 1,
      mode: 'source-over',
      clip: false,
      dataURL: 'data:image/png;base64,...',
      vectorData: { /* vector layer state */ }
    }
  ],
  store: {
    toolId: 'pencil',
    tools: {},
    vectorLayer: {}
  },
  selection: null,
  ts: 1234567890
}
```

### Compatibility rules

- `version: 2` plus `layers[]` selects the layered restore path.
- Missing or unknown `type` values fall back to `raster`.
- Empty `layers[]` is restored as one blank raster layer.
- The legacy payload is restored by drawing the flattened `dataURL` into a new document.
- Undo/redo history and active selection are not persisted in v2.

### Storage notes

Autosave uses IndexedDB through `createSessionManager()`, so the layered payload can store more data than a localStorage-backed implementation. Raster layer image payloads are still PNG data URLs; a future v3 can split metadata from layer blobs if large documents become slow to save.

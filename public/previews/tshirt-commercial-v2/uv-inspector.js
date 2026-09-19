(() => {
  const viewer = document.querySelector('#viewer');
  const controls = [...document.querySelectorAll('[data-uv-mode]')];
  const status = document.querySelector('#uv-status');
  const root = './uv/';
  const sources = {
    grid: [root + 'uv-check.png', 'image/png'],
    wire: [root + 'online-fit-uv.svg?v=1', 'image/svg+xml'],
    atlas: [root + 'default-color-online-fit.png?v=2', 'image/png'],
    template: [root + 'online-template-white.svg', 'image/svg+xml']
  };
  const labels = { original: '原生材质', grid: '编号方向检查图', wire: 'V16 实际 UV 线框', atlas: '默认底色示意图', template: '线上 b42a1ab90447 SVG 模板' };
  let saved = [], busy = false;
  const textures = new Map();
  function capture() {
    saved = viewer.model.materials.filter(m => m.isActive).map(m => ({
      material: m,
      color: [...m.pbrMetallicRoughness.baseColorFactor],
      roughness: m.pbrMetallicRoughness.roughnessFactor,
      base: m.pbrMetallicRoughness.baseColorTexture.texture,
      normal: m.normalTexture.texture,
      cloth: !m.name.startsWith('03')
    }));
    controls.forEach(button => { button.disabled = false; });
    status.textContent = '当前：原生材质。选择检查图后旋转模型核对编号、方向与接缝。';
  }
  controls.forEach(button => {
    button.disabled = true;
    button.addEventListener('click', async () => {
      if (busy || !saved.length) return;
      busy = true;
      controls.forEach(b => { b.disabled = true; });
      const mode = button.dataset.uvMode;
      status.textContent = '正在加载' + labels[mode] + '…';
      try {
        let texture = null;
        if (mode !== 'original') {
          if (!textures.has(mode)) {
            const [url, mime] = sources[mode];
            textures.set(mode, await viewer.createTexture(url, mime));
          }
          texture = textures.get(mode);
        }
        for (const entry of saved) {
          const m = entry.material, pbr = m.pbrMetallicRoughness;
          const diagnostic = mode !== 'original' && entry.cloth;
          pbr.baseColorTexture.setTexture(diagnostic ? texture : entry.base);
          pbr.setBaseColorFactor(diagnostic ? [1, 1, 1, 1] : entry.color);
          pbr.setRoughnessFactor(diagnostic ? 1 : entry.roughness);
          m.normalTexture.setTexture(diagnostic ? null : entry.normal);
        }
        if (texture) {
          // setTexture restores each material's transform, so apply this last.
          const packed = mode === 'template' || mode === 'wire' || mode === 'atlas';
          texture.sampler.setScale(packed ? {u: 1, v: -1} : null);
          texture.sampler.setOffset(packed ? {u: 0, v: 1} : null);
        }
        controls.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        document.querySelectorAll('[data-color],#materialMode').forEach(b => { b.disabled = mode !== 'original'; });
        status.textContent = '当前：' + labels[mode] + (mode === 'original' ? '，已恢复底色与织纹。' : '。使用印花 UV0；检查时关闭织纹凹凸，缝线保留原材质。');
        viewer.dataset.uvMode = mode;
        window.scrollTo({ top: 0, behavior: 'instant' });
      } catch (error) {
        status.textContent = '贴图加载失败：' + error.message;
      } finally {
        busy = false;
        controls.forEach(b => { b.disabled = false; });
      }
    });
  });
  viewer.addEventListener('load', capture);
  if (viewer.loaded && viewer.model) capture();
})();

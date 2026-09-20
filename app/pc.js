(function () {
  const desktop = !!(window.neonAPI && window.neonAPI.setWindow);
  const versionEls = [
    document.querySelector('#pcVersion'),
    document.querySelector('#pcLoginVersion'),
    document.querySelector('#pcTitleVersion')
  ].filter(Boolean);
  const windowStateEl = document.querySelector('#pcWindowState');
  const fullscreenBtn = document.querySelector('#pcFullscreenBtn');
  const settingsBtn = document.querySelector('#menuSetBtn');
  const gameFullscreenBtn = document.querySelector('#fsBtn');
  const menu = document.querySelector('#menu');
  const minBtn = document.querySelector('#pcMinBtn');
  const maxBtn = document.querySelector('#pcMaxBtn');
  const closeBtn = document.querySelector('#pcCloseBtn');
  let windowState = { fullscreen: false, maximized: false };

  document.body.classList.add(desktop ? 'is-desktop' : 'is-browser');

  function renderVersion(version) {
    const text = desktop ? 'v' + version : 'Browser';
    versionEls.forEach(el => { el.textContent = text; });
  }

  function renderWindowState() {
    const label = windowState.fullscreen ? '全屏' : (windowState.maximized ? '最大化' : '窗口');
    if (windowStateEl) windowStateEl.textContent = label;
    if (fullscreenBtn) {
      fullscreenBtn.textContent = windowState.fullscreen ? '⤡' : '⛶';
      fullscreenBtn.title = windowState.fullscreen ? '退出全屏' : '进入全屏';
      fullscreenBtn.setAttribute('aria-label', fullscreenBtn.title);
    }
    if (maxBtn) {
      maxBtn.textContent = windowState.maximized ? '❐' : '▢';
      maxBtn.title = windowState.maximized ? '还原' : '最大化';
      maxBtn.setAttribute('aria-label', maxBtn.title);
    }
  }

  if (desktop && window.neonAPI.minimizeWindow) {
    document.body.classList.add('custom-frame');
    if (minBtn) minBtn.addEventListener('click', () => window.neonAPI.minimizeWindow());
    if (maxBtn) maxBtn.addEventListener('click', () => window.neonAPI.maximizeWindow());
    if (closeBtn) closeBtn.addEventListener('click', () => window.neonAPI.closeWindow());
  }

  function toggleFullscreen() {
    if (gameFullscreenBtn) {
      gameFullscreenBtn.click();
      return;
    }
    if (desktop) window.neonAPI.setWindow({ fullscreen: !windowState.fullscreen });
  }

  if (desktop) {
    window.neonAPI.getVersion()
      .then(renderVersion)
      .catch(() => renderVersion('--'));

    window.neonAPI.getWindowState()
      .then(state => {
        windowState = state || windowState;
        renderWindowState();
      })
      .catch(renderWindowState);

    window.neonAPI.onWindowState(state => {
      windowState = state || windowState;
      renderWindowState();
    });
  } else {
    renderVersion('--');
    renderWindowState();
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

  window.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'Enter') {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    if (event.ctrlKey && event.key === ',' && menu && !menu.classList.contains('off')) {
      event.preventDefault();
      settingsBtn.click();
    }
  }, true);
})();

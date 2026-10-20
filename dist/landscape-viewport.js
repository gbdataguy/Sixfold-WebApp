/* Give every Unity scene the same 16:9 landscape render area. */
(function () {
  'use strict';
  var container = document.getElementById('unity-container');
  var canvas = document.getElementById('unity-canvas');
  var footer = document.getElementById('unity-footer');
  if (!container || !canvas) return;
  var pending = 0;

  function set(element, property, value) {
    element.style.setProperty(property, value, 'important');
  }

  function resize() {
    pending = 0;
    var width = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
    var height = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    var mobile = container.classList.contains('unity-mobile');
    var fullscreen = document.fullscreenElement === container || document.webkitFullscreenElement === container;
    var landscape = width > height;
    if (footer) set(footer, 'display', mobile || fullscreen ? 'none' : 'block');
    var footerHeight = !mobile && !fullscreen && footer ? footer.offsetHeight : 0;
    var availableHeight = Math.max(1, height - footerHeight);
    var gameWidth = mobile || fullscreen ? width : Math.min(960, width);
    var gameHeight = mobile || fullscreen ? height : Math.min(600, availableHeight);
    if (landscape) {
      gameWidth = Math.min(gameWidth, availableHeight * 16 / 9);
      gameHeight = gameWidth * 9 / 16;
    }
    set(container, 'position', 'fixed');
    set(container, 'inset', '0');
    set(container, 'left', '0');
    set(container, 'top', '0');
    set(container, 'transform', 'none');
    set(container, 'width', width + 'px');
    set(container, 'height', height + 'px');
    set(container, 'background', mobile || fullscreen ? '#000' : 'transparent');
    set(canvas, 'position', 'absolute');
    set(canvas, 'left', (width - gameWidth) / 2 + 'px');
    set(canvas, 'top', (availableHeight - gameHeight) / 2 + 'px');
    set(canvas, 'transform', 'none');
    set(canvas, 'width', gameWidth + 'px');
    set(canvas, 'height', gameHeight + 'px');
    if (footer) {
      set(footer, 'display', mobile || fullscreen ? 'none' : 'block');
      set(footer, 'position', 'absolute');
      set(footer, 'left', (width - gameWidth) / 2 + 'px');
      set(footer, 'top', (availableHeight + gameHeight) / 2 + 'px');
      set(footer, 'width', gameWidth + 'px');
    }
  }

  function queueResize() {
    if (!pending) pending = window.requestAnimationFrame(resize);
  }
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  document.addEventListener('fullscreenchange', queueResize);
  document.addEventListener('webkitfullscreenchange', queueResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);

  // Fullscreen the container, keeping the fitted canvas and its margins together.
  var button = document.getElementById('unity-fullscreen-button');
  if (button) button.addEventListener('click', function (event) {
    var request = container.requestFullscreen || container.webkitRequestFullscreen;
    if (!request) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var result = request.call(container);
    if (result && result.catch) result.catch(function () {});
  }, true);
  resize();
}());

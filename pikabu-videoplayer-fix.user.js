// ==UserScript==
// @name         Pikabu Video Player Fix (Enhanced)
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Исправляет авто-паузу, корректно обрабатывает все клики/пробелы и синхронизирует UI
// @author       alexp + claudeai
// @match        https://pikabu.ru/*
// @match        https://*.pikabu.ru/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const videoStates = new WeakMap();
  let lastUserEvent = false;
  let lastUserEventTime = 0;
  let currentlyPlayingVideo = null;

  function markUserEvent() {
      lastUserEvent = true;
      lastUserEventTime = Date.now();
      setTimeout(() => {
          if (Date.now() - lastUserEventTime >= 50) {
              lastUserEvent = false;
          }
      }, 100);
  }

  document.addEventListener('click', markUserEvent, true);
  document.addEventListener('keydown', markUserEvent, true);
  document.addEventListener('touchstart', markUserEvent, true);
  document.addEventListener('mousedown', markUserEvent, true);

  function stopOtherVideos(currentVideo) {
      document.querySelectorAll('video.player__video').forEach(video => {
          if (video !== currentVideo && !video.paused) {
              const state = videoStates.get(video);
              if (state) {
                  state.userPaused = true;
              }
              originalPause.call(video);
              setTimeout(() => syncPlayButtonState(video), 0);
          }
      });
  }

  function syncPlayButtonState(video) {
      const player = video.closest('.player');
      if (!player) return;

      const playButton = player.querySelector('.player__play-button');
      const indicator = player.querySelector('.player__indicator');

      if (video.paused) {
          playButton?.classList.remove('player__play-button_active');
          if (indicator) indicator.style.display = '';
      } else {
          playButton?.classList.add('player__play-button_active');
          if (indicator) indicator.style.display = 'none';
      }

      if (!videoStates.has(video)) {
          videoStates.set(video, { userPaused: video.paused, lastToggleTime: Date.now() });
      } else {
          const state = videoStates.get(video);
          if (lastUserEvent) {
              state.userPaused = video.paused;
          }
          state.lastToggleTime = Date.now();
      }
  }

  const originalPause = HTMLVideoElement.prototype.pause;
  const originalPlay = HTMLVideoElement.prototype.play;

  HTMLVideoElement.prototype.pause = function() {
      if (!this.closest('.player')) {
          return originalPause.call(this);
      }

      if (!videoStates.has(this)) {
          videoStates.set(this, { userPaused: false, lastToggleTime: 0 });
      }

      const state = videoStates.get(this);
      const now = Date.now();

      if (document.hidden && !lastUserEvent) {
          return Promise.resolve();
      }

      if (lastUserEvent || (now - state.lastToggleTime < 300)) {
          state.userPaused = true;
          state.lastToggleTime = now;

          if (currentlyPlayingVideo === this) {
              currentlyPlayingVideo = null;
          }

          const result = originalPause.call(this);
          setTimeout(() => syncPlayButtonState(this), 0);
          return result;
      } else {
          if (!state.userPaused) {
              this.play().catch(() => {});
              setTimeout(() => syncPlayButtonState(this), 0);
          } else {
              return originalPause.call(this);
          }
          return Promise.resolve();
      }
  };

  HTMLVideoElement.prototype.play = function() {
      if (!this.closest('.player')) {
          return originalPlay.call(this);
      }

      if (!videoStates.has(this)) {
          videoStates.set(this, { userPaused: false, lastToggleTime: Date.now() });
      }

      const state = videoStates.get(this);

      if (lastUserEvent) {
          state.userPaused = false;
      }

      state.lastToggleTime = Date.now();

      if (this !== currentlyPlayingVideo) {
          stopOtherVideos(this);
          currentlyPlayingVideo = this;
      }

      const result = originalPlay.call(this);
      setTimeout(() => syncPlayButtonState(this), 0);
      return result;
  };

  document.addEventListener('click', function(e) {
      const videoElement = e.target.closest('video.player__video');

      if (!videoElement) return;

      if (!videoStates.has(videoElement)) {
          videoStates.set(videoElement, { userPaused: videoElement.paused, lastToggleTime: Date.now() });
      }

      const state = videoStates.get(videoElement);
      state.lastToggleTime = Date.now();

      if (videoElement.paused) {
          videoElement.play().catch(() => {});
      } else {
          videoElement.pause();
      }

      setTimeout(() => syncPlayButtonState(videoElement), 10);
  }, true);

  document.addEventListener('keydown', function(e) {
      if (e.code === 'Space') {
          const videos = Array.from(document.querySelectorAll('video.player__video'));
          const visibleVideos = videos.filter(v => {
              const rect = v.getBoundingClientRect();
              return rect.top < window.innerHeight && rect.bottom > 0;
          });

          if (visibleVideos.length > 0) {
              e.preventDefault();
              const videoElement = visibleVideos[0];

              if (!videoStates.has(videoElement)) {
                  videoStates.set(videoElement, { userPaused: videoElement.paused, lastToggleTime: Date.now() });
              }
              const state = videoStates.get(videoElement);
              state.lastToggleTime = Date.now();

              if (videoElement.paused) {
                  videoElement.play().catch(() => {});
              } else {
                  videoElement.pause();
              }

              setTimeout(() => syncPlayButtonState(videoElement), 10);
          }
      }
  }, true);

  document.addEventListener('play', function(e) {
      if (e.target.matches('video.player__video')) {

          if (e.target !== currentlyPlayingVideo) {
              stopOtherVideos(e.target);
              currentlyPlayingVideo = e.target;
          }

          syncPlayButtonState(e.target);
      }
  }, true);

  document.addEventListener('pause', function(e) {
      if (e.target.matches('video.player__video')) {
          syncPlayButtonState(e.target);

          if (currentlyPlayingVideo === e.target) {
              currentlyPlayingVideo = null;
          }
      }
  }, true);

  document.addEventListener('ended', function(e) {
      if (e.target.matches('video.player__video')) {
          if (!videoStates.has(e.target)) return;

          const state = videoStates.get(e.target);
          state.userPaused = true;
          syncPlayButtonState(e.target);

          if (currentlyPlayingVideo === e.target) {
              currentlyPlayingVideo = null;
          }
      }
  }, true);

  function initializeVideo(video) {
    if (!videoStates.has(video)) {
        videoStates.set(video, { userPaused: video.paused, lastToggleTime: Date.now() });
        syncPlayButtonState(video);
    }
  }

  function processAddedNode(node) {
      if (node.nodeType !== 1) return;

      const videos = node.querySelectorAll ? node.querySelectorAll('video.player__video') : [];

      if (videos.length === 0) return;

      videos.forEach(initializeVideo);
  }

  const observer = new MutationObserver(function(mutations) {
      mutations.forEach(mutation => {
          if (mutation.addedNodes.length) {
              mutation.addedNodes.forEach(processAddedNode);
          }
      });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('load', function() {
      document.querySelectorAll('video.player__video').forEach(initializeVideo);
  });

})();
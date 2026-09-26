/**
 * 2rq1 Bio Page — guns.lol style
 * Audio playback, Lanyard/JAPI status polling, view counter, timezone clock
 */

document.addEventListener('DOMContentLoaded', () => {
  const DISCORD_ID = '1282691175085637632';

  // Elements
  const entryOverlay = document.getElementById('entryOverlay');
  const soundToggle = document.getElementById('soundToggle');
  const soundIcon = document.getElementById('soundIcon');
  const bgMusic = document.getElementById('bgMusic');
  const viewCountEl = document.getElementById('viewCount');
  const statusDot = document.getElementById('statusDot');
  const aboutStatus = document.getElementById('aboutStatus');
  const aboutContent = document.getElementById('aboutContent');
  const tzClock = document.getElementById('tzClock');
  const tzDate = document.getElementById('tzDate');
  const toast = document.getElementById('toast');

  let isMuted = false;
  let hasEntered = false;

  // ---- View Counter (rate-limited: 1 view per 30 min per user) ----
  const VIEW_COUNT_KEY = 'bio_views_2rq1';
  const VIEW_COOLDOWN_KEY = 'bio_views_cooldown';
  const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  let views = parseInt(localStorage.getItem(VIEW_COUNT_KEY) || '0', 10);
  const lastViewTime = parseInt(localStorage.getItem(VIEW_COOLDOWN_KEY) || '0', 10);
  const now = Date.now();

  if (now - lastViewTime >= COOLDOWN_MS) {
    // Cooldown expired or first visit — count as new view
    views++;
    localStorage.setItem(VIEW_COUNT_KEY, views);
    localStorage.setItem(VIEW_COOLDOWN_KEY, now);
  }
  // Otherwise: refresh / spam — don't increment

  if (viewCountEl) viewCountEl.textContent = views.toLocaleString();

  // ---- Sound Icons ----
  const ICON_ON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  </svg>`;

  const ICON_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <line x1="23" y1="9" x2="17" y2="15"></line>
    <line x1="17" y1="9" x2="23" y2="15"></line>
  </svg>`;

  function updateSoundIcon() {
    if (soundToggle) soundToggle.innerHTML = isMuted ? ICON_OFF : ICON_ON;
  }

  // ---- Click to Enter ----
  if (entryOverlay) {
    entryOverlay.addEventListener('click', () => {
      if (hasEntered) return;
      hasEntered = true;
      entryOverlay.classList.add('hidden');

      // Start music
      if (bgMusic) {
        bgMusic.volume = 0.4;
        bgMusic.play().catch(() => {});
      }
    });
  }

  // ---- Sound Toggle ----
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      isMuted = !isMuted;
      if (bgMusic) bgMusic.muted = isMuted;
      updateSoundIcon();
    });
  }

  // ---- Discord Status via Lanyard (WebSocket) ----
  function connectLanyard() {
    try {
      const ws = new WebSocket('wss://api.lanyard.rest/socket');

      ws.onopen = () => {};

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.op === 1) {
          // Hello — send init with subscribe
          ws.send(JSON.stringify({
            op: 2,
            d: { subscribe_to_id: DISCORD_ID }
          }));

          // Heartbeat
          setInterval(() => {
            ws.send(JSON.stringify({ op: 3 }));
          }, data.d.heartbeat_interval);
        }

        if (data.op === 0 && data.d) {
          updateStatus(data.d.discord_status || 'offline');
        }
      };

      ws.onclose = () => {
        // Retry in 10s
        setTimeout(connectLanyard, 10000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      // Lanyard not available — try JAPI fallback
      fetchStatusFallback();
    }
  }

  // Fallback: JAPI REST poll
  function fetchStatusFallback() {
    fetch(`https://japi.rest/discord/v1/user/${DISCORD_ID}`)
      .then(r => r.json())
      .then(data => {
        if (data.presence && data.presence.status) {
          updateStatus(data.presence.status);
        }
      })
      .catch(() => {});
  }

  function updateStatus(status) {
    // status: online, idle, dnd, offline
    if (statusDot) {
      statusDot.className = 'status-dot ' + status;
      statusDot.title = status.charAt(0).toUpperCase() + status.slice(1);
    }
    if (aboutStatus) {
      if (status === 'online') {
        aboutStatus.textContent = 'online';
        aboutStatus.className = 'user-card-status';
      } else if (status === 'idle') {
        aboutStatus.textContent = 'idle';
        aboutStatus.className = 'user-card-status';
        aboutStatus.style.color = 'var(--yellow)';
      } else if (status === 'dnd') {
        aboutStatus.textContent = 'do not disturb';
        aboutStatus.className = 'user-card-status';
        aboutStatus.style.color = 'var(--red)';
      } else {
        aboutStatus.textContent = 'offline';
        aboutStatus.className = 'user-card-status offline-text';
        aboutStatus.style.color = '';
      }
    }
  }

  connectLanyard();

  // ---- Berlin Timezone Clock (rolling digits) ----
  const digitSlots = {
    h1: document.querySelector('[data-pos="h1"] .digit-inner'),
    h2: document.querySelector('[data-pos="h2"] .digit-inner'),
    m1: document.querySelector('[data-pos="m1"] .digit-inner'),
    m2: document.querySelector('[data-pos="m2"] .digit-inner'),
    s1: document.querySelector('[data-pos="s1"] .digit-inner'),
    s2: document.querySelector('[data-pos="s2"] .digit-inner'),
  };

  let prevDigits = { h1: '', h2: '', m1: '', m2: '', s1: '', s2: '' };

  function rollDigit(el, newVal) {
    if (!el) return;
    // Slide old digit up and out
    el.classList.add('roll-out');

    setTimeout(() => {
      // Instantly position new digit below (no transition)
      el.classList.remove('roll-out');
      el.classList.add('roll-in');
      el.textContent = newVal;

      // Force reflow then animate in
      void el.offsetHeight;
      el.classList.remove('roll-in');
    }, 180);
  }

  function updateClock() {
    const now = new Date();
    const berlin = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));

    const h = berlin.getHours().toString().padStart(2, '0');
    const m = berlin.getMinutes().toString().padStart(2, '0');
    const s = berlin.getSeconds().toString().padStart(2, '0');

    const digits = { h1: h[0], h2: h[1], m1: m[0], m2: m[1], s1: s[0], s2: s[1] };

    for (const key in digits) {
      if (digits[key] !== prevDigits[key]) {
        rollDigit(digitSlots[key], digits[key]);
      }
    }
    prevDigits = { ...digits };

    if (tzDate) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      tzDate.textContent = `${days[berlin.getDay()]}, ${months[berlin.getMonth()]} ${berlin.getDate()} · CET`;
    }
  }

  updateClock();
  setInterval(updateClock, 1000);

  // ---- Scroll Reveal for About Section ----
  if (aboutContent) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            aboutContent.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    observer.observe(aboutContent);
  }

  // ---- Toast Helper ----
  let toastTimer = null;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ---- Cleanup scratch file ----
  // (scratch_lookup.ps1 will be cleaned up manually)

  // ---- Profile Card 3D Tilt (only on hover) ----
  const profileCard = document.getElementById('profileCard');

  if (profileCard) {
    const MAX_TILT = 14;
    let isHovering = false;
    let targetRX = 0, targetRY = 0;
    let currentRX = 0, currentRY = 0;

    profileCard.addEventListener('mouseenter', () => {
      isHovering = true;
      profileCard.style.transition = 'none';
    });

    profileCard.addEventListener('mousemove', (e) => {
      const rect = profileCard.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      targetRY = x * MAX_TILT;
      targetRX = -y * MAX_TILT;
    });

    profileCard.addEventListener('mouseleave', () => {
      isHovering = false;
      targetRX = 0;
      targetRY = 0;
      profileCard.style.transition = 'transform 0.4s ease-out';
      profileCard.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg)';
    });

    function animateTilt() {
      if (isHovering) {
        currentRX += (targetRX - currentRX) * 0.12;
        currentRY += (targetRY - currentRY) * 0.12;
        profileCard.style.transform =
          `perspective(800px) rotateX(${currentRX.toFixed(2)}deg) rotateY(${currentRY.toFixed(2)}deg)`;
      }
      requestAnimationFrame(animateTilt);
    }
    animateTilt();
  }

  // ---- Typewriter Effect for Bio ----
  const bioText = document.getElementById('bioText');

  if (bioText) {
    const TEXT = 'flowclient soon..';
    const TYPE_SPEED = 70;    // ms per character typing
    const DELETE_SPEED = 40;  // ms per character deleting
    const PAUSE_AFTER = 1600; // ms to hold after fully typed
    const PAUSE_BEFORE = 400; // ms before retyping

    // Add cursor element
    const cursor = document.createElement('span');
    cursor.className = 'bio-cursor';
    bioText.appendChild(cursor);

    let charIndex = 0;
    let isDeleting = false;

    function typeStep() {
      // Get text node (before cursor)
      const currentText = isDeleting
        ? TEXT.substring(0, charIndex - 1)
        : TEXT.substring(0, charIndex + 1);

      // Update the text before cursor
      bioText.textContent = currentText;
      bioText.appendChild(cursor);

      if (!isDeleting) {
        charIndex++;
        if (charIndex > TEXT.length) {
          // Done typing — pause then delete
          isDeleting = true;
          setTimeout(typeStep, PAUSE_AFTER);
          return;
        }
        setTimeout(typeStep, TYPE_SPEED);
      } else {
        charIndex--;
        if (charIndex < 0) {
          // Done deleting — pause then retype
          charIndex = 0;
          isDeleting = false;
          setTimeout(typeStep, PAUSE_BEFORE);
          return;
        }
        setTimeout(typeStep, DELETE_SPEED);
      }
    }

    typeStep();
  }

  // ---- Custom Cursor ----
  const cursorDot = document.getElementById('cursorDot');
  const cursorRing = document.getElementById('cursorRing');

  if (cursorDot && cursorRing) {
    let mouseX = -100, mouseY = -100;
    let ringX = -100, ringY = -100;

    // Move dot instantly, ring with lerp
    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursorDot.style.left = mouseX + 'px';
      cursorDot.style.top = mouseY + 'px';
    });

    function animateRing() {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      cursorRing.style.left = ringX + 'px';
      cursorRing.style.top = ringY + 'px';
      requestAnimationFrame(animateRing);
    }
    animateRing();

    // Click effect
    document.addEventListener('mousedown', () => {
      cursorDot.classList.add('clicking');
      cursorRing.classList.add('clicking');
    });
    document.addEventListener('mouseup', () => {
      cursorDot.classList.remove('clicking');
      cursorRing.classList.remove('clicking');
    });

    // Hover expand on interactive elements
    const hoverTargets = document.querySelectorAll('a, button, .badge, .social-link, .entry-overlay');
    hoverTargets.forEach((el) => {
      el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
      el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
    });

    // Hide when mouse leaves window
    document.addEventListener('mouseleave', () => {
      cursorDot.style.opacity = '0';
      cursorRing.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      cursorDot.style.opacity = '1';
      cursorRing.style.opacity = '1';
    });
  }

  // ---- Video Custom Loop (Cut off last 5s) ----
  const bgVideo = document.getElementById('bgVideo');
  if (bgVideo) {
    bgVideo.addEventListener('timeupdate', () => {
      // Once we know the duration, loop it 5 seconds early to skip credits
      if (bgVideo.duration && bgVideo.currentTime >= bgVideo.duration - 5) {
        bgVideo.currentTime = 0;
        bgVideo.play().catch(() => {}); // catch just in case
      }
    });
  }

});

// ==UserScript==
// @name         TikTok User Region
// @namespace    https://github.com/haithamaouati/TikTok-User-Region/
// @version      1.6
// @description  Shows the video creator's region and the viewer's region in a small window
// @author       Haitham Aouati
// @run-at       document-end
// @match        https://*.tiktok.com/*
// @grant        none
// @license      WTFPL
// @downloadURL  https://raw.githubusercontent.com/haithamaouati/TikTok-User-Region/main/userscript.js
// @supportURL   https://github.com/haithamaouati/TikTok-User-Region/issues
// @updateURL    https://raw.githubusercontent.com/haithamaouati/TikTok-User-Region/main/userscript.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const LOG = '[TikTok Region]';
    const WIN_ID = 'tiktok-region-window';
    const ICON_ID = 'tiktok-region-icon';
    const MAX_TRIES = 10;
    const RETRY_MS = 1000;
    const GLASS = 'rgba(45, 45, 45, 0.85)';

    let lastHandledId = null;
    let runToken = 0;
    let pageLoaded = document.readyState === 'complete';
    let minimized = false;
    let view = null; // { rows: [[label, value], ...] } | { note } | { error, text }

    // ---------- Window UI ----------

    function makeBtn(label, title, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        Object.assign(b.style, {
            width: '28px',
            height: '28px',
            marginLeft: '6px',
            padding: '0',
            border: 'none',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.12)',
            color: '#fff',
            font: '14px/28px system-ui, sans-serif',
            textAlign: 'center',
            cursor: 'pointer'
        });
        b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255, 255, 255, 0.25)'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'rgba(255, 255, 255, 0.12)'; });
        b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
        return b;
    }

    function removeUi() {
        for (const id of [WIN_ID, ICON_ID]) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }
    }

    function render() {
        try {
            removeUi();
            if (!view) return;
            const parent = document.body || document.documentElement;

            // Minimized: only a small icon that brings the window back
            if (minimized) {
                const icon = document.createElement('button');
                icon.id = ICON_ID;
                icon.type = 'button';
                icon.textContent = '🌐';
                icon.title = 'Show TikTok User Region';
                icon.setAttribute('aria-label', 'Show TikTok User Region');
                Object.assign(icon.style, {
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: '2147483647',
                    width: '44px',
                    height: '44px',
                    padding: '0',
                    borderRadius: '50%',
                    background: GLASS,
                    backdropFilter: 'blur(8px)',
                    webkitBackdropFilter: 'blur(8px)',
                    border: '1px solid ' + (view.error ? '#fe2c55' : 'rgba(255, 255, 255, 0.15)'),
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                    font: '20px/44px system-ui, sans-serif',
                    textAlign: 'center',
                    cursor: 'pointer'
                });
                icon.addEventListener('click', () => { minimized = false; render(); });
                parent.appendChild(icon);
                return;
            }

            // Window frame
            const win = document.createElement('div');
            win.id = WIN_ID;
            Object.assign(win.style, {
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: '2147483647',
                boxSizing: 'border-box',
                width: 'min(480px, 92vw)',
                overflow: 'hidden',
                borderRadius: '12px',
                background: GLASS,
                backdropFilter: 'blur(8px)',
                webkitBackdropFilter: 'blur(8px)',
                color: '#fff',
                border: '1px solid ' + (view.error ? '#fe2c55' : 'rgba(255, 255, 255, 0.15)'),
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                font: '14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif'
            });

            // Title bar
            const bar = document.createElement('div');
            Object.assign(bar.style, {
                display: 'flex',
                alignItems: 'center',
                padding: '8px 10px 8px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)'
            });
            const title = document.createElement('div');
            title.textContent = '🌐 TikTok User Region';
            Object.assign(title.style, { flex: '1', fontWeight: '600' });
            bar.appendChild(title);
            bar.appendChild(makeBtn('↻', 'Refresh data', refresh));
            bar.appendChild(makeBtn('–', 'Hide (keeps an icon)', () => { minimized = true; render(); }));
            bar.appendChild(makeBtn('✕', 'Close', () => { minimized = false; removeUi(); }));

            // Body
            const body = document.createElement('div');
            body.style.padding = '16px 20px';

            if (view.rows) {
                Object.assign(body.style, {
                    display: 'grid',
                    gridTemplateColumns: 'max-content 1fr',
                    gap: '6px 16px'
                });
                for (const [label, value] of view.rows) {
                    const l = document.createElement('span');
                    l.textContent = label;
                    l.style.opacity = '0.7';
                    const v = document.createElement('strong');
                    v.textContent = value;
                    v.style.fontWeight = '700';
                    v.style.wordBreak = 'break-word';
                    body.appendChild(l);
                    body.appendChild(v);
                }
            } else {
                body.textContent = view.error ? view.text : view.note;
                body.style.whiteSpace = 'pre-wrap';
                body.style.wordBreak = 'break-word';
            }

            win.appendChild(bar);
            win.appendChild(body);

            // Footer: separate section at the bottom
            if (view.footer) {
                const foot = document.createElement('div');
                Object.assign(foot.style, {
                    display: 'grid',
                    gridTemplateColumns: 'max-content 1fr',
                    gap: '6px 16px',
                    padding: '12px 20px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.12)'
                });
                const l = document.createElement('span');
                l.textContent = view.footer[0];
                l.style.opacity = '0.7';
                const v = document.createElement('strong');
                v.textContent = view.footer[1];
                v.style.fontWeight = '700';
                v.style.wordBreak = 'break-word';
                foot.appendChild(l);
                foot.appendChild(v);
                win.appendChild(foot);
            }

            parent.appendChild(win);
        } catch (e) {
            console.log(LOG, view);
        }
    }

    function setView(v) {
        view = v;
        render();
    }

    function fail(title, err) {
        const detail = err ? (err.message || String(err)) : '';
        console.error(LOG, title, err || '');
        setView({ error: true, text: '⚠️ ' + title + (detail ? '\n' + detail : '') });
    }

    // ---------- Helpers ----------

    function getVideoId() {
        const m = location.pathname.match(/\/(?:video|photo|v)\/(\d+)/);
        return m ? m[1] : null;
    }

    function getUrlUser() {
        const m = location.pathname.match(/\/@([^/]+)\//);
        if (!m) return null;
        try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }

    function regionInfo(code) {
        code = String(code || '').toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return { emoji: 'N/A', code: code || 'N/A', name: 'N/A' };
        let name = code;
        try {
            name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
        } catch (e) { /* older WebView: keep the code */ }
        const emoji = String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
        return { emoji, code, name };
    }

    function block(code) {
        const r = regionInfo(code);
        if (r.code === 'N/A') return 'N/A';
        return `${r.code} ${r.emoji} ${r.name}`;
    }

    // Viewer region only: it does not depend on the video, so a text match is safe.
    // The bounded window also survives nested objects before "region".
    function viewerFromText(text) {
        const m = /"webapp\.app-context"[\s\S]{0,4000}?"region"\s*:\s*"([A-Za-z]{2})"/.exec(text);
        return m ? m[1] : null;
    }

    // Walk a JSON tree: take locationCreated ONLY from the item whose ID matches the video
    function walk(root, videoId) {
        const found = [];
        const names = {}; // uniqueId -> nickname
        let viewer = null;
        const stack = [root];
        let guard = 0;
        while (stack.length && guard++ < 300000) {
            const o = stack.pop();
            if (!o || typeof o !== 'object') continue;
            if (typeof o.locationCreated === 'string' && o.locationCreated) {
                const a = o.author;
                found.push({
                    id: String(o.id || o.itemId || ''),
                    loc: o.locationCreated,
                    user: typeof a === 'string' ? a : (a && a.uniqueId) || null,
                    nick: (a && typeof a === 'object' && a.nickname) || (typeof o.nickname === 'string' ? o.nickname : null)
                });
            }
            if (typeof o.uniqueId === 'string' && typeof o.nickname === 'string' && o.nickname) {
                names[o.uniqueId] = o.nickname;
            }
            const ctx = o['webapp.app-context'];
            if (ctx && typeof ctx.region === 'string') viewer = ctx.region;
            for (const k in o) {
                const v = o[k];
                if (v && typeof v === 'object') stack.push(v);
            }
        }
        const exact = found.find(f => f.id === videoId);
        return {
            loc: exact ? exact.loc : null,
            user: exact ? exact.user : null,
            name: exact ? (exact.nick || names[exact.user] || null) : null,
            viewer
        };
    }

    function fromDocument(doc, videoId) {
        let loc = null, user = null, name = null, viewer = null;

        const scripts = doc.querySelectorAll(
            'script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE, ' +
            'script#__NEXT_DATA__, script[type="application/json"]'
        );
        for (const s of scripts) {
            try {
                const r = walk(JSON.parse(s.textContent), videoId);
                if (r.loc && !loc) { loc = r.loc; user = r.user; name = r.name; }
                if (r.viewer && !viewer) viewer = r.viewer;
            } catch (e) { /* not valid JSON, skip */ }
        }

        if (!viewer) {
            for (const s of doc.querySelectorAll('script')) {
                viewer = viewerFromText(s.textContent || '');
                if (viewer) break;
            }
        }

        return loc ? { loc, user, name, viewer } : null;
    }

    async function fromFetch(videoId) {
        const res = await fetch(location.href, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' while re-fetching the page');
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // ID-safe: no raw-regex fallback for the location
        return fromDocument(doc, videoId);
    }

    // ---------- Main ----------

    // manual = true when the Refresh button was pressed: skip the (possibly stale)
    // page data and ask the server first.
    async function run(manual) {
        if (!pageLoaded && document.readyState !== 'complete') return;

        const videoId = getVideoId();
        if (!videoId || videoId === lastHandledId) return;
        lastHandledId = videoId;

        const token = ++runToken;
        if (manual) setView({ note: 'Fetching…' });

        try {
            let data = null;
            let fetchError = null;

            if (manual) {
                try {
                    data = await fromFetch(videoId);
                } catch (e) {
                    fetchError = e;
                }
                if (token !== runToken) return;
            }

            for (let i = 0; !data && i < MAX_TRIES && token === runToken; i++) {
                data = fromDocument(document, videoId);
                if (data) break;
                await new Promise(r => setTimeout(r, RETRY_MS));
            }

            if (!data && !manual && token === runToken) {
                try {
                    data = await fromFetch(videoId);
                } catch (e) {
                    fetchError = e;
                }
            }
            if (token !== runToken) return;

            if (data) {
                console.log(LOG, data);
                const user = getUrlUser() || data.user;
                setView({
                    rows: [
                        ['Name', data.name || 'N/A'],
                        ['Username', user ? '@' + user : 'N/A'],
                        ['Creator region', block(data.loc)]
                    ],
                    footer: ['Viewer region', block(data.viewer)]
                });
            } else if (fetchError) {
                fail('Region not found.\nFallback request failed:', fetchError);
            } else {
                fail('Region not found.\n"locationCreated" is missing from the page data (login wall, captcha or app prompt?).');
            }
        } catch (e) {
            fail('Unexpected error in script:', e);
        }
    }

    function refresh() {
        if (!getVideoId()) {
            setView({ note: 'Open a video page to fetch its region.' });
            return;
        }
        lastHandledId = null;
        run(true);
    }

    function onNav() { run(); }

    try {
        window.addEventListener('load', () => {
            pageLoaded = true;
            onNav();
        });

        ['pushState', 'replaceState'].forEach(fn => {
            const orig = history[fn];
            history[fn] = function () {
                const ret = orig.apply(this, arguments);
                setTimeout(onNav, 0);
                return ret;
            };
        });
        window.addEventListener('popstate', onNav);
        setInterval(() => {
            const id = getVideoId();
            if (id && id !== lastHandledId) onNav();
        }, 2000);
    } catch (e) {
        fail('Failed to set up navigation hooks:', e);
    }

    // Log only: TikTok's own code throws plenty of unrelated rejections
    window.addEventListener('unhandledrejection', e => console.warn(LOG, 'Unhandled promise error:', e.reason));

    if (document.readyState === 'complete') {
        pageLoaded = true;
        run();
    }
})();

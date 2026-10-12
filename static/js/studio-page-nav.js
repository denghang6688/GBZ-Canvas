(function(){
    'use strict';

    function inFrame(){
        try { return window.self !== window.top; }
        catch(e) { return true; }
    }

    function goBack(targetPage){
        if(inFrame()){
            window.parent.postMessage({ type:'studio-switch-page', page:targetPage || 'canvas' }, '*');
            return;
        }
        if(window.history.length > 1){
            window.history.back();
            return;
        }
        window.location.href = '/static/index.html';
    }

    function injectBackButton(options={}){
        if(document.querySelector('[data-studio-page-back]')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'studio-page-back';
        btn.dataset.studioPageBack = '1';
        const fallbackLabel = '\u8fd4\u56de';
        btn.setAttribute('title', options.title || fallbackLabel);
        btn.setAttribute('aria-label', options.title || fallbackLabel);
        btn.innerHTML = '<i data-lucide="arrow-left"></i><span>' + (options.label || fallbackLabel) + '</span>';
        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            goBack(options.targetPage || 'canvas');
        });
        document.body.appendChild(btn);
        if(window.lucide?.createIcons) window.lucide.createIcons();
    }

    function injectStyles(){
        if(document.getElementById('studio-page-nav-css')) return;
        const style = document.createElement('style');
        style.id = 'studio-page-nav-css';
        style.textContent = `
            .studio-page-back {
                position: fixed;
                left: 18px;
                top: 18px;
                z-index: 9998;
                height: 38px;
                padding: 0 13px;
                border: 1px solid rgba(15,23,42,.12);
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                background: rgba(255,255,255,.88);
                color: #111827;
                box-shadow: 0 14px 34px rgba(15,23,42,.12);
                backdrop-filter: blur(16px);
                font: 800 12px/1 Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
                cursor: pointer;
                transition: transform .14s ease, background .14s ease, border-color .14s ease;
            }
            .studio-page-back:hover { transform: translateY(-1px); background: #fff; border-color: #111827; }
            .studio-page-back i,.studio-page-back svg { width: 16px; height: 16px; }
            html.theme-dark .studio-page-back,
            body.theme-dark .studio-page-back,
            html.studio-theme-dark .studio-page-back,
            body.studio-theme-dark .studio-page-back {
                background: rgba(17,23,34,.88);
                color: #eef2f7;
                border-color: rgba(148,163,184,.28);
                box-shadow: 0 14px 34px rgba(0,0,0,.28);
            }
            html.theme-dark .studio-page-back:hover,
            body.theme-dark .studio-page-back:hover,
            html.studio-theme-dark .studio-page-back:hover,
            body.studio-theme-dark .studio-page-back:hover { border-color: #eef2f7; background: rgba(23,29,41,.96); }
            html.theme-custom .studio-page-back,
            body.theme-custom .studio-page-back {
                background: color-mix(in srgb, var(--studio-custom-color, #7c5cff) 8%, #111722);
                color: #eef8ff;
                border-color: color-mix(in srgb, var(--studio-custom-color, #7c5cff) 32%, #25262b);
                box-shadow: 0 14px 34px rgba(0,0,0,.24);
            }
            html.theme-custom .studio-page-back:hover,
            body.theme-custom .studio-page-back:hover {
                border-color: var(--studio-custom-color, #7c5cff);
                background: color-mix(in srgb, var(--studio-custom-color, #7c5cff) 14%, #111722);
            }
            @media (max-width: 640px){
                .studio-page-back { left: 12px; top: 12px; height: 34px; padding: 0 10px; }
                .studio-page-back span { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

    window.StudioPageNav = { injectBackButton, goBack };

    document.addEventListener('DOMContentLoaded', () => {
        const root = document.documentElement;
        const body = document.body;
        const enabled = root.dataset.studioBack === '1' || body?.dataset?.studioBack === '1';
        if(!enabled) return;
        injectStyles();
        injectBackButton({
            label: body?.dataset?.studioBackLabel || root.dataset.studioBackLabel || '\u8fd4\u56de',
            title: body?.dataset?.studioBackTitle || root.dataset.studioBackTitle || '\u8fd4\u56de',
            targetPage: body?.dataset?.studioBackTarget || root.dataset.studioBackTarget || 'canvas'
        });
    });
})();

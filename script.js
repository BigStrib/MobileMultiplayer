(function(){
'use strict';

var state = {
    videos: [],
    layout: '2',
    activeIndex: -1,
    selectMode: false,
    menuOpen: false,
    ytVolTarget: -1,
    keepAlive: {},
    confirmCb: null
};

var dom = {};
function grab(id){return document.getElementById(id)}

function initDom(){
    dom.fab = grab('fab');
    dom.menuPanel = grab('menuPanel');
    dom.menuOverlay = grab('menuOverlay');
    dom.videoGrid = grab('videoGrid');
    dom.emptyState = grab('emptyState');
    dom.addModal = grab('addModal');
    dom.layoutModal = grab('layoutModal');
    dom.confirmModal = grab('confirmModal');
    dom.confirmText = grab('confirmText');
    dom.confirmYes = grab('confirmYes');
    dom.confirmNo = grab('confirmNo');
    dom.selectBar = grab('selectBar');
    dom.selectLabel = grab('selectLabel');
    dom.exitSelect = grab('exitSelect');
    dom.actionBar = grab('actionBar');
    dom.ytVolPanel = grab('ytVolPanel');
    dom.ytVolSlider = grab('ytVolSlider');
    dom.ytVolVal = grab('ytVolVal');
    dom.urlInput = grab('urlInput');
    dom.submitVideo = grab('submitVideo');
    dom.closeAddModal = grab('closeAddModal');
    dom.closeLayoutModal = grab('closeLayoutModal');
    dom.pasteBtn = grab('pasteBtn');
    dom.toastBox = grab('toastBox');
}

/* ===== URL PARSING ===== */
function parseURL(input){
    input = input.trim();
    var url = input;
    if(url.indexOf('://')===-1 && url.indexOf('.')!==-1) url='https://'+url;
    var m;

    // YouTube
    m=url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
    if(m) return{platform:'youtube',id:m[1],type:'video'};
    m=url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if(m) return{platform:'youtube',id:m[1],type:'video'};
    m=url.match(/youtube\.com\/@([^\/\?]+)/);
    if(m) return{platform:'youtube',id:m[1],type:'channel'};

    // Twitch
    m=url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'twitch',id:m[1],type:'clip'};
    m=url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'twitch',id:m[1],type:'clip'};
    m=url.match(/twitch\.tv\/videos\/(\d+)/);
    if(m) return{platform:'twitch',id:m[1],type:'vod'};
    m=url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
    if(m&&['videos','clips','about','schedule'].indexOf(m[1])===-1)
        return{platform:'twitch',id:m[1],type:'channel'};

    // Rumble
    m=url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
    if(m) return{platform:'rumble',id:m[1],type:'embed'};
    if(url.indexOf('rumble.com')!==-1){
        m=url.match(/rumble\.com\/([a-zA-Z0-9\-]+?)(?:\.html)?(?:\?|$)/);
        if(m) return{platform:'rumble',id:m[1],type:'video'};
    }

    // Kick
    m=url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'kick',id:m[1],type:'clip'};
    m=url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'kick',id:m[1],type:'vod'};
    m=url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
    if(m) return{platform:'kick',id:m[1],type:'channel'};

    if(/^[a-zA-Z0-9_-]{11}$/.test(input))
        return{platform:'youtube',id:input,type:'video'};
    return null;
}

function isYTLive(parsed){
    return parsed.platform==='youtube'&&(parsed.type==='channel'||parsed.isLive);
}

function buildEmbed(parsed){
    var host=window.location.hostname||'localhost';
    var origin=window.location.origin||('https://'+host);
    switch(parsed.platform){
        case'youtube':
            var base;
            if(parsed.type==='channel'){
                base='https://www.youtube.com/embed/live_stream?channel='+parsed.id;
            } else {
                base='https://www.youtube.com/embed/'+parsed.id;
            }
            return base+'?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(origin)+'&widgetid=1';
        case'twitch':
            if(parsed.type==='clip') return'https://clips.twitch.tv/embed?clip='+parsed.id+'&parent='+host+'&autoplay=true&muted=true';
            if(parsed.type==='vod') return'https://player.twitch.tv/?video=v'+parsed.id+'&parent='+host+'&autoplay=true&muted=true';
            return'https://player.twitch.tv/?channel='+parsed.id+'&parent='+host+'&autoplay=true&muted=true';
        case'rumble':
            return'https://rumble.com/embed/'+parsed.id+'/?autoplay=1&mute=1';
        case'kick':
            if(parsed.type==='clip') return'https://player.kick.com/clip/'+parsed.id+'?autoplay=true&muted=true';
            return'https://player.kick.com/'+parsed.id+'?autoplay=true&muted=true';
    }
    return null;
}

/* ===== YT IFRAME API ===== */
function ytCommand(iframe,func,args){
    try{
        iframe.contentWindow.postMessage(JSON.stringify({
            event:'command',func:func,args:args||[]
        }),'*');
    }catch(e){}
}

function ytListen(iframe){
    try{
        iframe.contentWindow.postMessage(JSON.stringify({
            event:'listening',id:1
        }),'*');
    }catch(e){}
}

function startKeepAlive(vid,iframe){
    stopKeepAlive(vid);
    // Immediately try to play
    ytCommand(iframe,'playVideo');
    state.keepAlive[vid]=setInterval(function(){
        ytCommand(iframe,'playVideo');
    },10000);
}

function stopKeepAlive(vid){
    if(state.keepAlive[vid]){
        clearInterval(state.keepAlive[vid]);
        delete state.keepAlive[vid];
    }
}

function stopAllKeepAlive(){
    for(var k in state.keepAlive) clearInterval(state.keepAlive[k]);
    state.keepAlive={};
}

function setupYTListener(){
    window.addEventListener('message',function(e){
        var data;
        try{
            data=typeof e.data==='string'?JSON.parse(e.data):e.data;
        }catch(ex){return}
        if(!data) return;

        // YT state: 2=paused
        if(data.event==='onStateChange'){
            var info=data.info;
            if(typeof info==='object') info=info.playerState;
            if(info===2||info===-1){
                // Find source iframe and resume
                var iframes=dom.videoGrid.querySelectorAll('iframe');
                for(var i=0;i<iframes.length;i++){
                    try{
                        if(iframes[i].contentWindow===e.source){
                            ytCommand(iframes[i],'playVideo');
                            break;
                        }
                    }catch(ex){}
                }
            }
        }
    });
}

function setupVisibility(){
    document.addEventListener('visibilitychange',function(){
        if(document.visibilityState==='visible'){
            // Resume all YT
            var iframes=dom.videoGrid.querySelectorAll('iframe');
            for(var i=0;i<state.videos.length;i++){
                if(state.videos[i].platform==='youtube'&&iframes[i]){
                    ytCommand(iframes[i],'playVideo');
                }
            }
        }
    });

    // Also catch focus for iOS
    window.addEventListener('focus',function(){
        var iframes=dom.videoGrid.querySelectorAll('iframe');
        for(var i=0;i<state.videos.length;i++){
            if(state.videos[i].platform==='youtube'&&iframes[i]){
                ytCommand(iframes[i],'playVideo');
            }
        }
    });
}

/* ===== YT VOLUME CONTROL ===== */
function showYTVolume(videoIndex){
    state.ytVolTarget=videoIndex;
    dom.ytVolPanel.classList.remove('hidden');
    dom.ytVolSlider.value=100;
    dom.ytVolVal.textContent='100';

    // First unmute then set volume
    var iframe=getIframeAt(videoIndex);
    if(iframe){
        ytCommand(iframe,'unMute');
        ytCommand(iframe,'setVolume',[100]);
    }
}

function hideYTVolume(){
    state.ytVolTarget=-1;
    dom.ytVolPanel.classList.add('hidden');
}

function setYTVolume(val){
    dom.ytVolVal.textContent=val;
    var idx=state.ytVolTarget;
    if(idx<0) return;
    var iframe=getIframeAt(idx);
    if(!iframe) return;
    if(parseInt(val)===0){
        ytCommand(iframe,'mute');
    } else {
        ytCommand(iframe,'unMute');
        ytCommand(iframe,'setVolume',[parseInt(val)]);
    }
}

/* ===== VIDEO MANAGEMENT ===== */
function addVideo(url){
    var parsed=parseURL(url);
    if(!parsed){toast('Cannot parse URL',true);return false}
    var src=buildEmbed(parsed);
    if(!src){toast('Unsupported',true);return false}

    // Mark as live for YT live/channel
    if(parsed.type==='channel') parsed.isLive=true;
    // Also check if URL contains "live"
    if(parsed.platform==='youtube'&&url.toLowerCase().indexOf('/live/')!==-1) parsed.isLive=true;

    state.videos.push({
        id:'v'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
        parsed:parsed,
        platform:parsed.platform,
        embedSrc:src,
        isLive:!!parsed.isLive
    });
    render();save();
    toast(parsed.platform+' added');
    return true;
}

function removeVideo(i){
    var v=state.videos[i];
    if(v) stopKeepAlive(v.id);
    state.videos.splice(i,1);
    deselect();render();save();
}

function moveVideo(from,to){
    if(to<0||to>=state.videos.length) return;
    var v=state.videos.splice(from,1)[0];
    state.videos.splice(to,0,v);
    state.activeIndex=to;
    render();
    highlightSelected(to);
    save();
}

function reloadVideo(i){
    var iframe=getIframeAt(i);
    if(!iframe) return;
    var src=iframe.src;
    iframe.src='';
    var v=state.videos[i];
    setTimeout(function(){
        iframe.src=src;
        if(v&&v.platform==='youtube'){
            setTimeout(function(){
                ytListen(iframe);
                startKeepAlive(v.id,iframe);
            },2500);
        }
    },200);
    toast('Reloading...');
}

function getIframeAt(i){
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    if(!cells[i]) return null;
    return cells[i].querySelector('iframe');
}

/* ===== RENDER ===== */
function render(){
    stopAllKeepAlive();
    var grid=dom.videoGrid;
    grid.innerHTML='';
    var count=state.videos.length;

    if(count===0){
        dom.emptyState.classList.remove('hidden');
        grid.removeAttribute('data-cols');
        grid.style.gridTemplateRows='';
        return;
    }
    dom.emptyState.classList.add('hidden');

    var layout=state.layout;
    var cols;
    switch(layout){
        case'1':cols=1;break;
        case'2':cols=2;break;
        case'3':cols=3;break;
        case'2x1':cols=2;break;
        case'auto':cols=count<=1?1:count<=4?2:3;break;
        default:cols=2;
    }
    grid.setAttribute('data-cols',cols);

    if(layout==='2x1'){
        var extra=Math.ceil(Math.max(0,count-1)/2);
        grid.style.gridTemplateRows='repeat('+(1+extra)+',1fr)';
    } else {
        var rows=Math.max(1,Math.ceil(count/cols));
        grid.style.gridTemplateRows='repeat('+rows+',1fr)';
    }

    if(state.selectMode) grid.classList.add('select-mode');
    else grid.classList.remove('select-mode');

    for(var i=0;i<count;i++){
        var v=state.videos[i];
        var cell=document.createElement('div');
        cell.className='video-cell';
        if(v.platform==='youtube'&&v.isLive) cell.className+=' yt-live';
        if(layout==='2x1'&&i===0) cell.className+=' featured-main';
        if(i===state.activeIndex) cell.className+=' selected';
        cell.setAttribute('data-idx',i);

        var iframe=document.createElement('iframe');
        iframe.src=v.embedSrc;
        iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
        iframe.setAttribute('allowfullscreen','');
        iframe.setAttribute('playsinline','');
        iframe.id='ifr_'+v.id;

        // Select overlay (only interactive in select mode)
        var selOv=document.createElement('div');
        selOv.className='sel-overlay';
        selOv.setAttribute('data-idx',i);

        // Number badge
        var selNum=document.createElement('div');
        selNum.className='sel-num';
        selNum.textContent=''+(i+1);

        // Platform badge
        var badge=document.createElement('span');
        badge.className='badge '+v.platform;
        badge.textContent=v.platform;

        // Live tag
        var liveTag=document.createElement('div');
        liveTag.className='live-tag';
        liveTag.textContent='LIVE';

        cell.appendChild(iframe);
        cell.appendChild(selOv);
        cell.appendChild(selNum);
        cell.appendChild(badge);
        cell.appendChild(liveTag);
        grid.appendChild(cell);

        // YT keep-alive
        if(v.platform==='youtube'){
            (function(vid,ifr){
                ifr.addEventListener('load',function(){
                    setTimeout(function(){
                        ytListen(ifr);
                        startKeepAlive(vid.id,ifr);
                    },2000);
                });
            })(v,iframe);
        }
    }
}

/* ===== SELECT MODE ===== */
function enterSelectMode(){
    state.selectMode=true;
    state.activeIndex=-1;
    dom.selectBar.classList.remove('hidden');
    dom.videoGrid.classList.add('select-mode');
    dom.selectLabel.textContent='Tap a video to select it';
    dom.fab.style.display='none';
    hideYTVolume();
}

function exitSelectMode(){
    state.selectMode=false;
    state.activeIndex=-1;
    dom.selectBar.classList.add('hidden');
    dom.actionBar.classList.add('hidden');
    dom.videoGrid.classList.remove('select-mode');
    dom.fab.style.display='';

    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++) cells[i].classList.remove('selected');
}

function selectVideo(idx){
    state.activeIndex=idx;
    highlightSelected(idx);
    dom.selectLabel.textContent=state.videos[idx].platform+' #'+(idx+1)+' selected';
    dom.actionBar.classList.remove('hidden');

    // Show YT volume for live streams
    if(state.videos[idx].platform==='youtube'&&state.videos[idx].isLive){
        showYTVolume(idx);
    } else {
        hideYTVolume();
    }
}

function deselect(){
    state.activeIndex=-1;
    dom.actionBar.classList.add('hidden');
    hideYTVolume();
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++) cells[i].classList.remove('selected');
    if(state.selectMode) dom.selectLabel.textContent='Tap a video to select it';
}

function highlightSelected(idx){
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++){
        if(i===idx) cells[i].classList.add('selected');
        else cells[i].classList.remove('selected');
    }
}

/* ===== MENU ===== */
function openMenu(){
    state.menuOpen=true;
    dom.menuPanel.classList.remove('hidden');
    dom.menuOverlay.classList.remove('hidden');
    dom.fab.classList.add('open');
}

function closeMenu(){
    state.menuOpen=false;
    dom.menuPanel.classList.add('hidden');
    dom.menuOverlay.classList.add('hidden');
    dom.fab.classList.remove('open');
}

/* ===== MODALS ===== */
function openModal(id){
    var el=grab(id);if(el)el.classList.remove('hidden');
}
function closeModal(id){
    var el=grab(id);if(el)el.classList.add('hidden');
}

function confirmAction(text,cb){
    dom.confirmText.textContent=text;
    state.confirmCb=cb;
    openModal('confirmModal');
}

/* ===== TOAST ===== */
function toast(msg,err){
    dom.toastBox.innerHTML='';
    var el=document.createElement('div');
    el.className='toast'+(err?' err':'');
    el.textContent=msg;
    dom.toastBox.appendChild(el);
    setTimeout(function(){if(el.parentNode)el.remove()},2500);
}

/* ===== SAVE/LOAD ===== */
function save(){
    try{localStorage.setItem('mp2',JSON.stringify({videos:state.videos,layout:state.layout}))}catch(e){}
}
function load(){
    try{
        var d=JSON.parse(localStorage.getItem('mp2'));
        if(d){
            if(d.videos) state.videos=d.videos;
            if(d.layout) state.layout=d.layout;
        }
    }catch(e){}
}

function refreshLayOpts(){
    var opts=document.querySelectorAll('.lay-opt');
    for(var i=0;i<opts.length;i++){
        if(opts[i].getAttribute('data-layout')===state.layout) opts[i].classList.add('active');
        else opts[i].classList.remove('active');
    }
}

/* ===== WIRE ===== */
function wire(){

    // FAB
    dom.fab.addEventListener('click',function(e){
        e.preventDefault();e.stopPropagation();
        if(state.menuOpen) closeMenu(); else openMenu();
    });
    dom.menuOverlay.addEventListener('click',function(){closeMenu()});

    // MENU ITEMS
    dom.menuPanel.addEventListener('click',function(e){
        var item=e.target;
        while(item&&!item.classList.contains('menu-item'))item=item.parentElement;
        if(!item) return;
        e.preventDefault();e.stopPropagation();
        var action=item.getAttribute('data-action');
        closeMenu();

        switch(action){
            case'add':
                openModal('addModal');
                dom.urlInput.value='';
                setTimeout(function(){grab('urlInput').focus()},250);
                break;
            case'layout':
                openModal('layoutModal');
                refreshLayOpts();
                break;
            case'select':
                if(state.videos.length===0){toast('No videos to select',true);return}
                enterSelectMode();
                break;
            case'clearall':
                if(state.videos.length===0){toast('Nothing to clear',true);return}
                confirmAction('Remove all '+state.videos.length+' videos?',function(){
                    stopAllKeepAlive();
                    state.videos=[];
                    state.activeIndex=-1;
                    exitSelectMode();
                    render();save();
                    toast('All cleared');
                });
                break;
        }
    });

    // ADD MODAL
    grab('closeAddModal').addEventListener('click',function(e){e.preventDefault();closeModal('addModal')});
    dom.addModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('addModal')});

    dom.pasteBtn.addEventListener('click',function(e){
        e.preventDefault();
        if(navigator.clipboard&&navigator.clipboard.readText){
            navigator.clipboard.readText().then(function(t){grab('urlInput').value=t}).catch(function(){toast('Clipboard denied',true)});
        }
    });

    dom.submitVideo.addEventListener('click',function(e){
        e.preventDefault();
        var url=grab('urlInput').value.trim();
        if(!url){toast('Enter a URL',true);return}
        if(addVideo(url)) closeModal('addModal');
    });
    grab('urlInput').addEventListener('keydown',function(e){
        if(e.key==='Enter'){e.preventDefault();dom.submitVideo.click()}
    });

    // LAYOUT MODAL
    grab('closeLayoutModal').addEventListener('click',function(e){e.preventDefault();closeModal('layoutModal')});
    dom.layoutModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('layoutModal')});

    var layOpts=document.querySelectorAll('.lay-opt');
    for(var i=0;i<layOpts.length;i++){
        layOpts[i].addEventListener('click',function(e){
            e.preventDefault();
            state.layout=this.getAttribute('data-layout');
            refreshLayOpts();render();save();
            closeModal('layoutModal');
        });
    }

    // CONFIRM MODAL
    dom.confirmNo.addEventListener('click',function(e){e.preventDefault();closeModal('confirmModal');state.confirmCb=null});
    dom.confirmModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('confirmModal');state.confirmCb=null});
    dom.confirmYes.addEventListener('click',function(e){
        e.preventDefault();closeModal('confirmModal');
        if(state.confirmCb){state.confirmCb();state.confirmCb=null}
    });

    // SELECT BAR
    dom.exitSelect.addEventListener('click',function(e){e.preventDefault();exitSelectMode()});

    // GRID TAP (select mode)
    dom.videoGrid.addEventListener('click',function(e){
        if(!state.selectMode) return;
        var el=e.target;
        while(el&&el!==dom.videoGrid){
            if(el.classList&&el.classList.contains('sel-overlay')){
                e.preventDefault();e.stopPropagation();
                var idx=parseInt(el.getAttribute('data-idx'),10);
                if(state.activeIndex===idx) deselect();
                else selectVideo(idx);
                return;
            }
            el=el.parentElement;
        }
    });

    // ACTION BAR
    dom.actionBar.addEventListener('click',function(e){
        var el=e.target;var btn=null;
        while(el&&el!==dom.actionBar){
            if(el.classList&&el.classList.contains('act-btn')){btn=el;break}
            el=el.parentElement;
        }
        if(!btn) return;
        e.preventDefault();e.stopPropagation();
        var action=btn.getAttribute('data-action');
        var idx=state.activeIndex;

        switch(action){
            case'move-left':
                if(idx>0) moveVideo(idx,idx-1);
                break;
            case'move-right':
                if(idx<state.videos.length-1) moveVideo(idx,idx+1);
                break;
            case'reload':
                if(idx>=0) reloadVideo(idx);
                break;
            case'remove':
                if(idx>=0){
                    var name=state.videos[idx].platform+' #'+(idx+1);
                    confirmAction('Remove '+name+'?',function(){
                        removeVideo(idx);
                        toast('Removed');
                    });
                }
                break;
            case'deselect':
                deselect();
                break;
        }
    });

    // YT VOLUME SLIDER
    dom.ytVolSlider.addEventListener('input',function(){
        setYTVolume(this.value);
    });

    // KEYBOARD
    document.addEventListener('keydown',function(e){
        if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
        if(e.key==='Escape'){
            if(!dom.addModal.classList.contains('hidden')){closeModal('addModal');return}
            if(!dom.layoutModal.classList.contains('hidden')){closeModal('layoutModal');return}
            if(!dom.confirmModal.classList.contains('hidden')){closeModal('confirmModal');return}
            if(state.selectMode){exitSelectMode();return}
            if(state.menuOpen){closeMenu();return}
        }
        if(e.key==='a'||e.key==='A'){e.preventDefault();dom.fab.click();/* then add */}
    });

    // RESIZE
    window.addEventListener('resize',function(){
        if(state.videos.length>0) recalcRows();
    });
    window.addEventListener('orientationchange',function(){
        setTimeout(function(){if(state.videos.length>0) recalcRows()},300);
    });
}

function recalcRows(){
    var layout=state.layout;
    var count=state.videos.length;
    var cols;
    switch(layout){
        case'1':cols=1;break;
        case'2':cols=2;break;
        case'3':cols=3;break;
        case'2x1':cols=2;break;
        case'auto':cols=count<=1?1:count<=4?2:3;break;
        default:cols=2;
    }
    dom.videoGrid.setAttribute('data-cols',cols);
    if(layout==='2x1'){
        var extra=Math.ceil(Math.max(0,count-1)/2);
        dom.videoGrid.style.gridTemplateRows='repeat('+(1+extra)+',1fr)';
    } else {
        var rows=Math.max(1,Math.ceil(count/cols));
        dom.videoGrid.style.gridTemplateRows='repeat('+rows+',1fr)';
    }
}

/* ===== BOOT ===== */
function boot(){
    initDom();
    load();
    render();
    wire();
    setupYTListener();
    setupVisibility();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

})();
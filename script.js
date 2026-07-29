(function(){
'use strict';

var AR = 16/9;

var state = {
    videos:[],
    layout:'2',
    activeIndex:-1,
    selectMode:false,
    menuOpen:false,
    unmutedIndex:-1,
    keepAlive:{},
    confirmCb:null
};

var dom={};
function grab(id){return document.getElementById(id)}

function initDom(){
    dom.fab=grab('fab');
    dom.menuPanel=grab('menuPanel');
    dom.menuOverlay=grab('menuOverlay');
    dom.videoWrapper=grab('videoWrapper');
    dom.videoGrid=grab('videoGrid');
    dom.emptyState=grab('emptyState');
    dom.addModal=grab('addModal');
    dom.layoutModal=grab('layoutModal');
    dom.confirmModal=grab('confirmModal');
    dom.confirmText=grab('confirmText');
    dom.confirmYes=grab('confirmYes');
    dom.confirmNo=grab('confirmNo');
    dom.selectBar=grab('selectBar');
    dom.selectLabel=grab('selectLabel');
    dom.exitSelect=grab('exitSelect');
    dom.actionBar=grab('actionBar');
    dom.urlInput=grab('urlInput');
    dom.submitVideo=grab('submitVideo');
    dom.closeAddModal=grab('closeAddModal');
    dom.closeLayoutModal=grab('closeLayoutModal');
    dom.pasteBtn=grab('pasteBtn');
    dom.toastBox=grab('toastBox');
}

// ===== GRID SIZING =====
// Calculate grid pixel dimensions so each cell is exactly 16:9
// and the whole grid fits within the viewport, centered, no black bars
function sizeGrid(){
    var count=state.videos.length;
    if(count===0) return;

    var vw=window.innerWidth;
    var vh=window.innerHeight;
    var layout=state.layout;

    var cols,rows;
    switch(layout){
        case'1':cols=1;break;
        case'2':cols=2;break;
        case'3':cols=3;break;
        case'2x1':cols=2;break;
        case'auto':cols=count<=1?1:count<=4?2:3;break;
        default:cols=2;
    }

    if(layout==='2x1'){
        rows=1+Math.ceil(Math.max(0,count-1)/2);
    } else {
        rows=Math.max(1,Math.ceil(count/cols));
    }

    // Each cell must be 16:9
    // Cell width = gridW / cols
    // Cell height = gridH / rows
    // We need cellW / cellH = 16/9
    // So gridW/cols / (gridH/rows) = 16/9
    // gridW * rows / (gridH * cols) = 16/9
    // Try fit by width: cellW = vw/cols, cellH = cellW / AR
    // Total height = cellH * rows
    // If total height <= vh, use this
    // Else fit by height: cellH = vh/rows, cellW = cellH * AR
    // Total width = cellW * cols

    var cellW = vw / cols;
    var cellH = cellW / AR;
    var totalH = cellH * rows;
    var totalW = vw;

    if(totalH > vh){
        // Fit by height
        cellH = vh / rows;
        cellW = cellH * AR;
        totalH = vh;
        totalW = cellW * cols;
    }

    // For featured layout, the top row is full width
    // Top cell: spans all cols, so its width = totalW, height should be totalW/AR
    // But that might not match the row height we calculated
    // For simplicity with featured: recalc
    if(layout==='2x1' && count>1){
        // Top row: 1 cell spanning full width = totalW, aspect = totalW / AR
        // Bottom rows: 2 cells per row, each = totalW/2, aspect = (totalW/2) / AR
        // topH = totalW / AR
        // bottomCellH = (totalW/2) / AR = totalW / (2*AR)
        // bottomRows = ceil((count-1)/2)
        // totalH = topH + bottomRows * bottomCellH
        // = totalW/AR + bottomRows * totalW/(2*AR)
        // = totalW/AR * (1 + bottomRows/2)
        var bottomRows = Math.ceil((count-1)/2);
        // Fit by width first
        var tw = vw;
        var topH = tw / AR;
        var botCellH = (tw/2) / AR;
        var th = topH + bottomRows * botCellH;

        if(th > vh){
            // Solve: tw/AR * (1 + bottomRows/2) = vh
            // tw = vh * AR / (1 + bottomRows/2)
            var factor = 1 + bottomRows/2;
            tw = vh * AR / factor;
            topH = tw / AR;
            botCellH = (tw/2) / AR;
            th = vh;
        }

        totalW = tw;
        totalH = th;

        dom.videoGrid.style.width = Math.floor(totalW)+'px';
        dom.videoGrid.style.height = Math.floor(totalH)+'px';
        dom.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        // Use fr with specific row heights
        var rowTemplate = topH+'px';
        for(var r=0;r<bottomRows;r++) rowTemplate += ' '+botCellH+'px';
        dom.videoGrid.style.gridTemplateRows = rowTemplate;
        return;
    }

    dom.videoGrid.style.width = Math.floor(totalW)+'px';
    dom.videoGrid.style.height = Math.floor(totalH)+'px';
    dom.videoGrid.style.gridTemplateColumns = 'repeat('+cols+',1fr)';
    dom.videoGrid.style.gridTemplateRows = 'repeat('+rows+',1fr)';
}

// ===== URL PARSING =====
function parseURL(input){
    input=input.trim();
    var url=input;
    if(url.indexOf('://')===-1&&url.indexOf('.')!==-1) url='https://'+url;
    var m;
    m=url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/);
    if(m) return{platform:'youtube',id:m[1],type:'video',isLive:url.indexOf('/live/')!==-1};
    m=url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if(m) return{platform:'youtube',id:m[1],type:'video',isLive:false};
    m=url.match(/youtube\.com\/@([^\/\?]+)/);
    if(m) return{platform:'youtube',id:m[1],type:'channel',isLive:true};
    m=url.match(/clips\.twitch\.tv\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'twitch',id:m[1],type:'clip'};
    m=url.match(/twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'twitch',id:m[1],type:'clip'};
    m=url.match(/twitch\.tv\/videos\/(\d+)/);
    if(m) return{platform:'twitch',id:m[1],type:'vod'};
    m=url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
    if(m&&['videos','clips','about','schedule'].indexOf(m[1])===-1)
        return{platform:'twitch',id:m[1],type:'channel'};
    m=url.match(/rumble\.com\/embed\/([a-zA-Z0-9]+)/);
    if(m) return{platform:'rumble',id:m[1],type:'embed'};
    if(url.indexOf('rumble.com')!==-1){
        m=url.match(/rumble\.com\/([a-zA-Z0-9\-]+?)(?:\.html)?(?:\?|$)/);
        if(m) return{platform:'rumble',id:m[1],type:'video'};
    }
    m=url.match(/kick\.com\/[^\/]+\?clip=([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'kick',id:m[1],type:'clip'};
    m=url.match(/kick\.com\/video\/([a-zA-Z0-9_-]+)/);
    if(m) return{platform:'kick',id:m[1],type:'vod'};
    m=url.match(/kick\.com\/([a-zA-Z0-9_]+)\/?$/);
    if(m) return{platform:'kick',id:m[1],type:'channel'};
    if(/^[a-zA-Z0-9_-]{11}$/.test(input))
        return{platform:'youtube',id:input,type:'video',isLive:false};
    return null;
}

function buildEmbed(parsed,muted){
    var host=window.location.hostname||'localhost';
    var origin=window.location.origin||('https://'+host);
    var mi=muted?1:0;var mb=muted?'true':'false';
    switch(parsed.platform){
        case'youtube':
            var b=parsed.type==='channel'
                ?'https://www.youtube.com/embed/live_stream?channel='+parsed.id
                :'https://www.youtube.com/embed/'+parsed.id;
            return b+'?autoplay=1&mute='+mi+'&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(origin)+'&widgetid=1';
        case'twitch':
            if(parsed.type==='clip') return'https://clips.twitch.tv/embed?clip='+parsed.id+'&parent='+host+'&autoplay=true&muted='+mb;
            if(parsed.type==='vod') return'https://player.twitch.tv/?video=v'+parsed.id+'&parent='+host+'&autoplay=true&muted='+mb;
            return'https://player.twitch.tv/?channel='+parsed.id+'&parent='+host+'&autoplay=true&muted='+mb;
        case'rumble':return'https://rumble.com/embed/'+parsed.id+'/?autoplay=1&mute='+mi;
        case'kick':
            if(parsed.type==='clip') return'https://player.kick.com/clip/'+parsed.id+'?autoplay=true&muted='+mb;
            return'https://player.kick.com/'+parsed.id+'?autoplay=true&muted='+mb;
    }
    return null;
}

// ===== YT COMMANDS =====
function ytCmd(iframe,func,args){
    try{iframe.contentWindow.postMessage(JSON.stringify({event:'command',func:func,args:args||[]}),'*')}catch(e){}
}
function ytListen(iframe){
    try{iframe.contentWindow.postMessage(JSON.stringify({event:'listening',id:1}),'*')}catch(e){}
}
function startKeepAlive(vid,iframe){
    stopKeepAlive(vid);
    ytCmd(iframe,'playVideo');
    state.keepAlive[vid]=setInterval(function(){
        ytCmd(iframe,'playVideo');
        // Also re-apply unmute if needed
        var idx=-1;
        for(var i=0;i<state.videos.length;i++){
            if(state.videos[i].id===vid){idx=i;break}
        }
        if(idx>=0&&state.unmutedIndex===idx){
            ytCmd(iframe,'unMute');
            ytCmd(iframe,'setVolume',[100]);
        }
    },8000);
}
function stopKeepAlive(vid){
    if(state.keepAlive[vid]){clearInterval(state.keepAlive[vid]);delete state.keepAlive[vid]}
}
function stopAllKeepAlive(){
    for(var k in state.keepAlive) clearInterval(state.keepAlive[k]);
    state.keepAlive={};
}

function setupYTListener(){
    window.addEventListener('message',function(e){
        var data;
        try{data=typeof e.data==='string'?JSON.parse(e.data):e.data}catch(x){return}
        if(!data||data.event!=='onStateChange') return;
        var info=data.info;
        if(typeof info==='object') info=info.playerState;
        if(info===2||info===-1){
            var iframes=dom.videoGrid.querySelectorAll('iframe');
            for(var i=0;i<iframes.length;i++){
                try{
                    if(iframes[i].contentWindow===e.source){
                        ytCmd(iframes[i],'playVideo');
                        if(state.unmutedIndex===i){
                            ytCmd(iframes[i],'unMute');
                            ytCmd(iframes[i],'setVolume',[100]);
                        }
                        break;
                    }
                }catch(x){}
            }
        }
    });
}

function setupVisibility(){
    var resume=function(){
        var iframes=dom.videoGrid.querySelectorAll('iframe');
        for(var i=0;i<state.videos.length;i++){
            if(state.videos[i].platform==='youtube'&&iframes[i]){
                ytCmd(iframes[i],'playVideo');
                if(state.unmutedIndex===i){
                    ytCmd(iframes[i],'unMute');
                    ytCmd(iframes[i],'setVolume',[100]);
                }
            }
        }
    };
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible') resume()});
    window.addEventListener('focus',resume);
    window.addEventListener('pageshow',resume);
}

// ===== VIDEO MANAGEMENT =====
function addVideo(url){
    var parsed=parseURL(url);
    if(!parsed){toast('Cannot parse URL',true);return false}
    var src=buildEmbed(parsed,true);
    if(!src){toast('Unsupported',true);return false}
    state.videos.push({
        id:'v'+Date.now()+'_'+Math.random().toString(36).substr(2,4),
        parsed:parsed,platform:parsed.platform,
        embedSrc:src,isLive:!!parsed.isLive
    });
    render();save();toast(parsed.platform+' added');return true;
}

function removeVideo(i){
    var v=state.videos[i];
    if(v) stopKeepAlive(v.id);
    if(state.unmutedIndex===i) state.unmutedIndex=-1;
    else if(state.unmutedIndex>i) state.unmutedIndex--;
    state.videos.splice(i,1);
    deselect();render();save();
}

function moveVideo(from,to){
    if(to<0||to>=state.videos.length) return;
    if(state.unmutedIndex===from) state.unmutedIndex=to;
    else if(state.unmutedIndex===to) state.unmutedIndex=from;
    var v=state.videos.splice(from,1)[0];
    state.videos.splice(to,0,v);
    state.activeIndex=to;
    render();highlightSelected(to);save();
}

function reloadVideo(i){
    var iframe=getIframeAt(i);
    if(!iframe) return;
    var v=state.videos[i];
    var muted=(state.unmutedIndex!==i);
    var src=buildEmbed(v.parsed,muted);
    iframe.src='';
    setTimeout(function(){
        iframe.src=src;v.embedSrc=src;
        if(v.platform==='youtube'){
            setTimeout(function(){
                ytListen(iframe);startKeepAlive(v.id,iframe);
                if(!muted){ytCmd(iframe,'unMute');ytCmd(iframe,'setVolume',[100])}
            },2500);
        }
    },200);
    toast('Reloading...');
}

function toggleVolume(i){
    var v=state.videos[i];if(!v) return;
    if(state.unmutedIndex===i){
        muteVideo(i);state.unmutedIndex=-1;toast('Muted');
    } else {
        if(state.unmutedIndex>=0) muteVideo(state.unmutedIndex);
        state.unmutedIndex=i;unmuteVideo(i);
        toast('Unmuted: '+v.platform);
    }
    updateVolBtn();save();
}

function muteVideo(i){
    var v=state.videos[i];var iframe=getIframeAt(i);
    if(!iframe||!v) return;
    if(v.platform==='youtube'){
        ytCmd(iframe,'mute');
    } else {
        var src=buildEmbed(v.parsed,true);v.embedSrc=src;iframe.src=src;
    }
}

function unmuteVideo(i){
    var v=state.videos[i];var iframe=getIframeAt(i);
    if(!iframe||!v) return;
    if(v.platform==='youtube'){
        ytCmd(iframe,'unMute');ytCmd(iframe,'setVolume',[100]);ytCmd(iframe,'playVideo');
    } else {
        var src=buildEmbed(v.parsed,false);v.embedSrc=src;iframe.src=src;
    }
}

function getIframeAt(i){
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    return cells[i]?cells[i].querySelector('iframe'):null;
}

function updateVolBtn(){
    var btn=dom.actionBar.querySelector('[data-action="volume"]');
    if(!btn) return;
    var idx=state.activeIndex;
    var isOn=(idx>=0&&state.unmutedIndex===idx);
    var svg=btn.querySelector('svg');
    var span=btn.querySelector('span');
    if(isOn){
        btn.classList.add('vol-on');
        svg.innerHTML='<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        span.textContent='Mute';
    } else {
        btn.classList.remove('vol-on');
        svg.innerHTML='<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        span.textContent='Unmute';
    }
}

// ===== RENDER =====
function render(){
    stopAllKeepAlive();
    var grid=dom.videoGrid;
    grid.innerHTML='';
    var count=state.videos.length;

    if(count===0){
        dom.emptyState.classList.remove('hidden');
        grid.style.width='';grid.style.height='';
        grid.style.gridTemplateColumns='';grid.style.gridTemplateRows='';
        return;
    }
    dom.emptyState.classList.add('hidden');

    if(state.selectMode) grid.classList.add('select-mode');
    else grid.classList.remove('select-mode');

    // Build cells first
    for(var i=0;i<count;i++){
        var v=state.videos[i];
        var cell=document.createElement('div');
        cell.className='video-cell';
        if(state.layout==='2x1'&&i===0) cell.className+=' featured-main';
        if(i===state.activeIndex) cell.className+=' selected';
        cell.setAttribute('data-idx',i);

        var iframe=document.createElement('iframe');
        iframe.src=v.embedSrc;
        iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
        iframe.setAttribute('allowfullscreen','');
        iframe.setAttribute('playsinline','');
        iframe.id='ifr_'+v.id;

        var selOv=document.createElement('div');
        selOv.className='sel-overlay';
        selOv.setAttribute('data-idx',i);

        var selNum=document.createElement('div');
        selNum.className='sel-num';
        selNum.textContent=''+(i+1);

        var badge=document.createElement('span');
        badge.className='badge '+v.platform;
        badge.textContent=v.platform;

        cell.appendChild(iframe);
        cell.appendChild(selOv);
        cell.appendChild(selNum);
        cell.appendChild(badge);
        grid.appendChild(cell);

        if(v.platform==='youtube'){
            (function(vid,ifr){
                ifr.addEventListener('load',function(){
                    setTimeout(function(){
                        ytListen(ifr);startKeepAlive(vid.id,ifr);
                        var idx=-1;
                        for(var j=0;j<state.videos.length;j++){if(state.videos[j].id===vid.id){idx=j;break}}
                        if(idx>=0&&state.unmutedIndex===idx){
                            ytCmd(ifr,'unMute');ytCmd(ifr,'setVolume',[100]);ytCmd(ifr,'playVideo');
                        }
                    },2000);
                });
            })(v,iframe);
        }
    }

    // Size grid to fit 16:9 cells
    sizeGrid();
}

// ===== SELECT MODE =====
function enterSelectMode(){
    state.selectMode=true;state.activeIndex=-1;
    dom.selectBar.classList.remove('hidden');
    dom.videoGrid.classList.add('select-mode');
    dom.selectLabel.textContent='Tap a video to select';
    dom.fab.style.display='none';
}
function exitSelectMode(){
    state.selectMode=false;state.activeIndex=-1;
    dom.selectBar.classList.add('hidden');
    dom.actionBar.classList.add('hidden');
    dom.videoGrid.classList.remove('select-mode');
    dom.fab.style.display='';
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++) cells[i].classList.remove('selected');
}
function selectVideo(idx){
    state.activeIndex=idx;highlightSelected(idx);
    dom.selectLabel.textContent=state.videos[idx].platform+' #'+(idx+1)+' selected';
    dom.actionBar.classList.remove('hidden');
    updateVolBtn();
}
function deselect(){
    state.activeIndex=-1;dom.actionBar.classList.add('hidden');
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++) cells[i].classList.remove('selected');
    if(state.selectMode) dom.selectLabel.textContent='Tap a video to select';
}
function highlightSelected(idx){
    var cells=dom.videoGrid.querySelectorAll('.video-cell');
    for(var i=0;i<cells.length;i++){
        if(i===idx) cells[i].classList.add('selected');
        else cells[i].classList.remove('selected');
    }
}

// ===== MENU =====
function openMenu(){state.menuOpen=true;dom.menuPanel.classList.remove('hidden');dom.menuOverlay.classList.remove('hidden');dom.fab.classList.add('open')}
function closeMenu(){state.menuOpen=false;dom.menuPanel.classList.add('hidden');dom.menuOverlay.classList.add('hidden');dom.fab.classList.remove('open')}
function openModal(id){var el=grab(id);if(el)el.classList.remove('hidden')}
function closeModal(id){var el=grab(id);if(el)el.classList.add('hidden')}
function confirmAction(text,cb){dom.confirmText.textContent=text;state.confirmCb=cb;openModal('confirmModal')}
function toast(msg,err){
    dom.toastBox.innerHTML='';
    var el=document.createElement('div');el.className='toast'+(err?' err':'');el.textContent=msg;
    dom.toastBox.appendChild(el);setTimeout(function(){if(el.parentNode)el.remove()},2500);
}
function save(){try{localStorage.setItem('mp4',JSON.stringify({videos:state.videos,layout:state.layout,unmutedIndex:state.unmutedIndex}))}catch(e){}}
function load(){try{var d=JSON.parse(localStorage.getItem('mp4'));if(d){if(d.videos)state.videos=d.videos;if(d.layout)state.layout=d.layout;if(typeof d.unmutedIndex==='number')state.unmutedIndex=d.unmutedIndex;if(state.unmutedIndex>=state.videos.length)state.unmutedIndex=-1}}catch(e){}}
function refreshLayOpts(){var opts=document.querySelectorAll('.lay-opt');for(var i=0;i<opts.length;i++){if(opts[i].getAttribute('data-layout')===state.layout)opts[i].classList.add('active');else opts[i].classList.remove('active')}}

// ===== WIRE =====
function wire(){
    dom.fab.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(state.menuOpen)closeMenu();else openMenu()});
    dom.menuOverlay.addEventListener('click',closeMenu);

    dom.menuPanel.addEventListener('click',function(e){
        var item=e.target;while(item&&!item.classList.contains('menu-item'))item=item.parentElement;
        if(!item)return;e.preventDefault();e.stopPropagation();
        var action=item.getAttribute('data-action');closeMenu();
        switch(action){
            case'add':openModal('addModal');grab('urlInput').value='';setTimeout(function(){grab('urlInput').focus()},250);break;
            case'layout':openModal('layoutModal');refreshLayOpts();break;
            case'select':if(state.videos.length===0){toast('No videos',true);return}enterSelectMode();break;
            case'clearall':
                if(state.videos.length===0){toast('Nothing to clear',true);return}
                confirmAction('Remove all '+state.videos.length+' videos?',function(){
                    stopAllKeepAlive();state.videos=[];state.activeIndex=-1;state.unmutedIndex=-1;
                    exitSelectMode();render();save();toast('All cleared');
                });break;
        }
    });

    grab('closeAddModal').addEventListener('click',function(e){e.preventDefault();closeModal('addModal')});
    dom.addModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('addModal')});
    dom.pasteBtn.addEventListener('click',function(e){e.preventDefault();if(navigator.clipboard&&navigator.clipboard.readText)navigator.clipboard.readText().then(function(t){grab('urlInput').value=t}).catch(function(){toast('Clipboard denied',true)})});
    dom.submitVideo.addEventListener('click',function(e){e.preventDefault();var url=grab('urlInput').value.trim();if(!url){toast('Enter a URL',true);return}if(addVideo(url))closeModal('addModal')});
    grab('urlInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();dom.submitVideo.click()}});

    grab('closeLayoutModal').addEventListener('click',function(e){e.preventDefault();closeModal('layoutModal')});
    dom.layoutModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('layoutModal')});
    var layOpts=document.querySelectorAll('.lay-opt');
    for(var i=0;i<layOpts.length;i++){layOpts[i].addEventListener('click',function(e){e.preventDefault();state.layout=this.getAttribute('data-layout');refreshLayOpts();render();save();closeModal('layoutModal')})}

    dom.confirmNo.addEventListener('click',function(e){e.preventDefault();closeModal('confirmModal');state.confirmCb=null});
    dom.confirmModal.querySelector('.modal-bg').addEventListener('click',function(){closeModal('confirmModal');state.confirmCb=null});
    dom.confirmYes.addEventListener('click',function(e){e.preventDefault();closeModal('confirmModal');if(state.confirmCb){state.confirmCb();state.confirmCb=null}});

    dom.exitSelect.addEventListener('click',function(e){e.preventDefault();exitSelectMode()});

    dom.videoGrid.addEventListener('click',function(e){
        if(!state.selectMode) return;
        var el=e.target;while(el&&el!==dom.videoGrid){
            if(el.classList&&el.classList.contains('sel-overlay')){
                e.preventDefault();e.stopPropagation();
                var idx=parseInt(el.getAttribute('data-idx'),10);
                if(state.activeIndex===idx)deselect();else selectVideo(idx);return;
            }
            el=el.parentElement;
        }
    });

    dom.actionBar.addEventListener('click',function(e){
        var el=e.target;var btn=null;
        while(el&&el!==dom.actionBar){if(el.classList&&el.classList.contains('act-btn')){btn=el;break}el=el.parentElement}
        if(!btn)return;e.preventDefault();e.stopPropagation();
        var action=btn.getAttribute('data-action');var idx=state.activeIndex;
        switch(action){
            case'volume':if(idx>=0)toggleVolume(idx);break;
            case'move-left':if(idx>0)moveVideo(idx,idx-1);break;
            case'move-right':if(idx<state.videos.length-1)moveVideo(idx,idx+1);break;
            case'reload':if(idx>=0)reloadVideo(idx);break;
            case'remove':
                if(idx>=0){var name=state.videos[idx].platform+' #'+(idx+1);
                confirmAction('Remove '+name+'?',function(){removeVideo(idx);toast('Removed')})}break;
            case'deselect':deselect();break;
        }
    });

    document.addEventListener('keydown',function(e){
        if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
        if(e.key==='Escape'){
            if(!dom.addModal.classList.contains('hidden')){closeModal('addModal');return}
            if(!dom.layoutModal.classList.contains('hidden')){closeModal('layoutModal');return}
            if(!dom.confirmModal.classList.contains('hidden')){closeModal('confirmModal');return}
            if(state.selectMode){exitSelectMode();return}
            if(state.menuOpen){closeMenu();return}
        }
    });

    var resizeTimer;
    function onResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(function(){if(state.videos.length>0)sizeGrid()},100)}
    window.addEventListener('resize',onResize);
    window.addEventListener('orientationchange',function(){setTimeout(onResize,300)});
    if(screen.orientation) screen.orientation.addEventListener('change',function(){setTimeout(onResize,300)});
}

function boot(){
    initDom();load();render();wire();setupYTListener();setupVisibility();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
else boot();

})();
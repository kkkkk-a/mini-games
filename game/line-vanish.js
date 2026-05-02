/**
 * Neo Tactics - Line Vanish (Fixed)
 */
window.LineGame = {
    board: Array(9).fill(null), moves: {p1:[], p2:[]}, hp: {p1:3, p2:3},
    turn: 'p1', timer: 15, timerId: null, isPlaying: false,
    canvas: null, ctx: null,

    init(mode) {
        this.mode = mode;
        this.role = mode==='online-guest' ? 'p2' : 'p1';
        this.isPlaying = true;
        
        Shared.UI.show('screen-game');
        Shared.UI.toggleLayout('ui-dpad', false);
        Shared.UI.toggleLayout('ui-rps', false);
        // ★修正: ui-actionの削除行を除去
        
        this.canvas = document.getElementById('main-cvs');
        this.ctx = this.canvas.getContext('2d');
        
        // 内部解像度を固定（表示サイズはCSSの 100% 指定により自動で追従します）
        this.canvas.width = 600;
        this.canvas.height = 600;
        
        this.reset();
        this.draw();
        this.startTimer();

        this.canvas.onpointerdown = (e) => {
            if(!this.isPlaying) return;
            e.preventDefault();
            const r = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / (r.width / 3));
            const y = Math.floor((e.clientY - r.top) / (r.height / 3));
            const idx = y * 3 + x;
            if(x>=0 && x<3 && y>=0 && y<3) this.input(idx);
        };

        if(mode.includes('online')) {
            Shared.Net.onData = (d) => this.onNet(d);
        }
        this.updateVisuals();
    },

    reset() { 
        this.board.fill(null); 
        this.hp={p1:3, p2:3}; 
        this.moves={p1:[], p2:[]}; 
        this.turn = 'p1';
        this.updateHUD();
        Shared.UI.msg(this.mode==='local' ? "P1 TURN" : (this.role==='p1'?"YOUR TURN":"ENEMY TURN"));
    },

    startTimer() {
        clearInterval(this.timerId);
        if(!this.isPlaying) return;

        const isMyTurn = (this.mode==='local') || (this.turn === this.role);
        const el = document.getElementById('game-timer');
        el.style.display = isMyTurn ? 'block' : 'none';
        
        if(isMyTurn) {
            this.timer = 15;
            el.innerText = this.timer;
            el.classList.remove('timer-danger');
            
            this.timerId = setInterval(() => {
                this.timer--;
                el.innerText = this.timer;
                if(this.timer<=5) el.classList.add('timer-danger');
                if(this.timer<=0) {
                    clearInterval(this.timerId);
                    this.autoMove();
                }
            }, 1000);
        }
    },

    autoMove() {
        const empty = this.board.map((v,i)=>v===null?i:-1).filter(i=>i!==-1);
        if(empty.length > 0) {
            this.input(empty[Math.floor(Math.random()*empty.length)]);
        }
    },

    input(idx) {
        if(this.mode.includes('online') && this.turn !== this.role) return;
        if(this.board[idx]) return;

        if(this.mode.includes('online')) Shared.Net.send('move', idx);
        this.play(this.turn, idx);
    },

    play(p, idx) {
        clearInterval(this.timerId);

        if(this.moves[p].length >= 3) {
            const old = this.moves[p].shift();
            this.board[old] = null;
        }

        this.board[idx] = p;
        this.moves[p].push(idx);
        Shared.Sound.preset('place');
        
         const damage = this.countWinLines(p);
        if(damage > 0) {
            const opp = p==='p1'?'p2':'p1';
            this.hp[opp] -= damage;
            Shared.Sound.preset('hit');
            Shared.UI.msg(damage > 1 ? "DOUBLE ATTACK!!" : "ATTACK!", "#ff0");
            Shared.VFX.shake(damage > 1 ? 'hard' : 'light'); // ★VFX演出
            if (damage > 1) Shared.VFX.flash();              // ★VFX演出
        }

        this.updateHUD();
        this.draw();

        if(this.hp.p1<=0 || this.hp.p2<=0) {
            this.end();
        } else {
            this.turn = (this.turn==='p1'?'p2':'p1');
            this.startTimer();
            this.updateStatus();
            this.draw();
        }
    },

    countWinLines(p) {
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        return lines.filter(l => l.every(i => this.board[i] === p)).length;
    },

    updateHUD() {
        Shared.UI.updateHUD(`HP: ${Math.max(0,this.hp.p1)}`, `HP: ${Math.max(0,this.hp.p2)}`);
    },
    
// --- line-vanish.js の updateStatus を書き換え ---
updateStatus() {
    const h1 = document.getElementById('hud-p1');
    const h2 = document.getElementById('hud-p2');
    const hc = document.getElementById('hud-center');

    // 一旦光を消す
    h1.classList.remove('active-turn-p1');
    h2.classList.remove('active-turn-p2');

    // ★修正: モードに応じて名前を変える
    let p1Name = "P1"; let p2Name = "P2";
    if (this.mode === 'npc') { p1Name = "YOU"; p2Name = "CPU"; }
    else if (this.mode.includes('online')) { p1Name = this.role==='p1'?"YOU":"ENEMY"; p2Name = this.role==='p2'?"YOU":"ENEMY"; }

    if (this.turn === 'p1') {
        h1.classList.add('active-turn-p1');
        hc.innerText = `${p1Name} TURN`;
        hc.style.color = "var(--primary)";
    } else {
        h2.classList.add('active-turn-p2');
        hc.innerText = `${p2Name} TURN`;
        hc.style.color = "var(--accent)";
    }
},

// --- line-vanish.js の draw() をこれに書き換え ---
    draw() {
    if (!this.ctx || !this.canvas) return; // ★追加
    const w = this.canvas.width;
        const h = this.canvas.height;
        const cellW = w / 3;
        const cellH = h / 3;
        const ctx = this.ctx;

        // 背景クリア
        ctx.fillStyle = '#000'; 
        ctx.fillRect(0, 0, w, h);
        
        // グリッド線
        ctx.strokeStyle = '#333'; 
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for(let i=1; i<3; i++) {
            ctx.beginPath(); 
            ctx.moveTo(i*cellW, 10); ctx.lineTo(i*cellW, h-10); 
            ctx.stroke();
            ctx.beginPath(); 
            ctx.moveTo(10, i*cellH); ctx.lineTo(w-10, i*cellH); 
            ctx.stroke();
        }

        const fontSize = Math.min(cellW, cellH) * 0.5; // 少し控えめなサイズに
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';

        // --- コマの描画 ---
        this.board.forEach((v, i) => {
            if(!v) return;

            // マスの中心座標
            const cx = (i % 3) * cellW + cellW/2;
            const cy = Math.floor(i / 3) * cellH + cellH/2;
            
            // 「次に消えるコマ」判定
            const isNextOut = (this.moves[v].length >= 3 && this.moves[v][0] === i);
            
            ctx.save(); // 状態保存
            
            // ★重要：描画の原点を「マスの中心」に移動する
            ctx.translate(cx, cy);

            if (isNextOut) {
                // 点滅アニメーション
                const alpha = 0.5 + Math.sin(Date.now() / 150) * 0.4;
                ctx.globalAlpha = alpha;
                // 中心を基準に少し小さく
                ctx.scale(0.8, 0.8);
                
                // 消える予告の「黄色いバツ」
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 8;
                ctx.beginPath();
                const s = cellW * 0.3; // バツのサイズ
                ctx.moveTo(-s, -s); ctx.lineTo(s, s);
                ctx.moveTo(s, -s); ctx.lineTo(-s, s);
                ctx.stroke();
            }

            // コマ文字の描画（原点が中心なので 0, 0 に描く）
            ctx.font = `900 ${fontSize}px sans-serif`;
            ctx.fillStyle = (v === 'p1') ? '#00f2ff' : '#ff0055';
            // 文字に影をつけて見やすく
            ctx.shadowColor = (v === 'p1') ? '#00f2ff' : '#ff0055';
            ctx.shadowBlur = 15;
            ctx.fillText(v === 'p1' ? '×' : '○', 0, 0);

            ctx.restore(); // 状態を戻す（次のコマのために）
        });

        // --- NEXT OUT の黄色い枠線 ---
        // 次に手番のプレイヤーの「一番古いコマ」を囲む
        const nextPlayer = this.turn;
        if (this.moves[nextPlayer].length >= 3) {
            const dyingIdx = this.moves[nextPlayer][0];
            const dx = (dyingIdx % 3) * cellW;
            const dy = Math.floor(dyingIdx / 3) * cellH;
            
            // 枠線
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 5]); // 点線にして目立たせる
            ctx.strokeRect(dx + 5, dy + 5, cellW - 10, cellH - 10);
            ctx.setLineDash([]); // 元に戻す

            // "NEXT OUT" の文字表示
            ctx.font = `bold ${fontSize * 0.3}px sans-serif`;
            const textY = dy + cellH - 20;

            // 文字の背景（黒）
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(dx + 10, textY - 15, cellW - 20, 24);

            // 文字（黄色）
            ctx.fillStyle = '#ffff00';
            ctx.shadowBlur = 0; // 文字はクッキリさせる
            ctx.fillText("NEXT OUT", dx + cellW/2, textY);
        }
    },

    onNet(d) {
        if(d.type==='move') this.play(this.turn, d.payload);
        if(d.type==='over') this.end(d.payload);
    },

    end() {
        this.isPlaying = false;
        clearInterval(this.timerId);
        Shared.UI.show('screen-result');
        const winner = this.hp.p2<=0 ? 'P1' : 'P2';
        document.getElementById('res-title').innerText = winner + " WIN!";
        document.getElementById('res-detail').innerText = "";
    },
        stop() {
        this.isPlaying = false;
        // タイマー停止
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        // タイマー表示を隠す
        const el = document.getElementById('game-timer');
        if(el) el.style.display = 'none';
        
        // 盤面クリア（見た目だけリセットしておく）
        if(this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },
    updateVisuals() {
    if (!this.isPlaying) return;
    this.draw();
    requestAnimationFrame(() => this.updateVisuals());
}
};

/**
 * Neo Tactics - SNAKE TACTICS (Fixed)
 */
window.SnakeGame = {
    canvas: null, ctx: null, grid: 20, tileCount: 20,
    mode: null, role: 'p1', timerId: null, isPlaying: false,
    
    // プレイヤーデータ
    p1: { body: [], dir: {x:0, y:-1}, nextDir: {x:0, y:-1}, score: 0, color: '#00f2ff' },
    p2: { body: [], dir: {x:0, y:1}, nextDir: {x:0, y:1}, score: 0, color: '#ff0055' },
    food: { x: 10, y: 10 },
    timeLimit: 100,

    init(mode) {
        this.mode = mode;
        this.role = mode === 'online-guest' ? 'p2' : 'p1';
        this.canvas = document.getElementById('main-cvs');
        this.ctx = this.canvas.getContext('2d');
        
        // キャンバスサイズ (400x400)
        this.canvas.width = 400; this.canvas.height = 400;

        Shared.UI.show('screen-game');
        document.querySelectorAll('.touch-group').forEach(el => el.classList.remove('active'));
Shared.UI.toggleLayout('ui-dpad', true);
if (mode === 'local') {
    document.getElementById('ui-dpad-p2').style.display = 'grid';
} else {
    document.getElementById('ui-dpad-p2').style.display = 'none';
}

        // 入力初期化 (P1:矢印/ボタン, P2:WASD/ボタン)
        Shared.Input.init({
            'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
            'KeyW': 'up2', 'KeyS': 'down2', 'KeyA': 'left2', 'KeyD': 'right2',
            'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right',
            'up2': 'up2', 'down2': 'down2', 'left2': 'left2', 'right2': 'right2' // P2スマホボタン用追加
        });

        if (mode.includes('online')) {
            Shared.Net.onData = (d) => this.onNet(d);
        }

        this.reset();
        this.isPlaying = true;
        
        // オンラインゲストの場合、ホストからの 'start' 受信時にループ開始するためここでは呼ばない
        if (this.mode !== 'online-guest') {
            this.loop();
        }
    },
    reset() {
        this.p1.body = [{x:5, y:16}, {x:5, y:17}, {x:5, y:18}];
        this.p1.dir = {x:0, y:-1}; this.p1.nextDir = {x:0, y:-1};
        this.p1.score = 0;

        this.p2.body = [{x:14, y:3}, {x:14, y:2}, {x:14, y:1}];
        this.p2.dir = {x:0, y:1}; this.p2.nextDir = {x:0, y:1};
        this.p2.score = 0;

        this.timeLimit = 100;
        this.placeFood();
        
        if (this.mode === 'online-host') Shared.Net.send('start', { food: this.food });
    },

    loop() {
        if (!this.isPlaying) return;
        this.timerId = setTimeout(() => {
            this.update();
            this.draw();
            this.loop();
        }, 100);
    },

    update() {
        this.handleInput();

        if (this.mode === 'npc') this.aiMove(this.p2);

        this.applyDir(this.p1);
        this.applyDir(this.p2);

        const h1 = { x: this.p1.body[0].x + this.p1.dir.x, y: this.p1.body[0].y + this.p1.dir.y };
        const h2 = { x: this.p2.body[0].x + this.p2.dir.x, y: this.p2.body[0].y + this.p2.dir.y };

        let p1Dead = this.checkCollision(h1);
        let p2Dead = this.checkCollision(h2);

        if (h1.x === h2.x && h1.y === h2.y) { p1Dead = true; p2Dead = true; }

        if (p1Dead && p2Dead) return this.gameOver('DRAW');
        if (p1Dead) return this.gameOver(this.mode === 'npc' ? 'YOU LOSE...' : 'P2 WIN!');
        if (p2Dead) return this.gameOver(this.mode === 'npc' ? 'YOU WIN!' : 'P1 WIN!');

        this.moveSnake(this.p1, h1);
        this.moveSnake(this.p2, h2);

        // オンラインホストは全スネークの位置情報を送信して同期ズレを修復
        if (this.mode === 'online-host') {
            Shared.Net.send('sync', {
                p1Body: this.p1.body,
                p2Body: this.p2.body,
                p1Score: this.p1.score,
                p2Score: this.p2.score,
                timeLimit: this.timeLimit
            });
        }

        this.timeLimit -= 0.2;
        if (this.timeLimit <= 0) return this.gameOver('TIME OVER');

        this.updateHUD();
    },

    handleInput() {
        // P1操作
        if (this.isMyControl('p1')) {
            const s = Shared.Input.state;
            let dx = 0, dy = 0;
            if (s.up)    { dx = 0; dy = -1; }
            if (s.down)  { dx = 0; dy = 1; }
            if (s.left)  { dx = -1; dy = 0; }
            if (s.right) { dx = 1; dy = 0; }

            if (dx !== 0 || dy !== 0) {
                // 現在の進行方向だけでなく、予約された向きに対しても逆走をブロック
                const cur = this.p1.dir;
                if ((dx !== -cur.x || dx === 0) && (dy !== -cur.y || dy === 0)) {
                    this.p1.nextDir = { x: dx, y: dy };
                    if (this.mode.includes('online')) Shared.Net.send('input', this.p1.nextDir);
                }
            }
        }
        // P2操作 (Local)
        if (this.mode === 'local') {
            const s = Shared.Input.state;
            let dx = 0, dy = 0;
            if (s.up2)    { dx = 0; dy = -1; }
            if (s.down2)  { dx = 0; dy = 1; }
            if (s.left2)  { dx = -1; dy = 0; }
            if (s.right2) { dx = 1; dy = 0; }

            if (dx !== 0 || dy !== 0) {
                const cur = this.p2.dir;
                if ((dx !== -cur.x || dx === 0) && (dy !== -cur.y || dy === 0)) {
                    this.p2.nextDir = { x: dx, y: dy };
                }
            }
        }
    },

    isMyControl(pId) {
        if (this.mode === 'npc' && pId === 'p1') return true;
        if (this.mode === 'local') return true;
        if (this.mode === 'online-host' && pId === 'p1') return true;
        if (this.mode === 'online-guest' && pId === 'p2') return true;
        return false;
    },

    applyDir(p) { p.dir = p.nextDir; },

    moveSnake(p, head) {
        p.body.unshift(head);
        if (head.x === this.food.x && head.y === this.food.y) {
            p.score += 100;
            this.timeLimit = Math.min(100, this.timeLimit + 15);
            Shared.Sound.preset('ok');
            // オンライン時はホストのみがエサの位置を決定して送信
            if (this.mode === 'online-host' || !this.mode.includes('online')) {
                this.placeFood();
                if (this.mode === 'online-host') Shared.Net.send('food', this.food);
            }
        } else {
            p.body.pop();
        }
    },

    checkCollision(head) {
        if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) return true;
        const checkBody = (body) => body.some(seg => seg.x === head.x && seg.y === head.y);
        if (checkBody(this.p1.body)) return true;
        if (checkBody(this.p2.body)) return true;
        return false;
    },

    aiMove(p) {
        const head = p.body[0];

        const isDanger = (x, y) => {
            if (x < 0 || x >= this.tileCount || y < 0 || y >= this.tileCount) return true;
            const hit = (body) => body.some(seg => seg.x === x && seg.y === y);
            return hit(this.p1.body) || hit(this.p2.body);
        };

        // 逆走以外の移動可能候補（3方向）
        const candidateDirs = [
            { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }
        ].filter(d => !(d.x === -p.dir.x && d.y === -p.dir.y));

        // 安全な方向のみ抽出
        const safeDirs = candidateDirs.filter(d => !isDanger(head.x + d.x, head.y + d.y));

        if (safeDirs.length > 0) {
            // エサへのマンハッタン距離が最も短くなる安全な方向を選択
            safeDirs.sort((a, b) => {
                const distA = Math.abs((head.x + a.x) - this.food.x) + Math.abs((head.y + a.y) - this.food.y);
                const distB = Math.abs((head.x + b.x) - this.food.x) + Math.abs((head.y + b.y) - this.food.y);
                return distA - distB;
            });
            p.nextDir = safeDirs[0];
        } else {
            // 全て危険なら現在の向きを維持
            p.nextDir = p.dir;
        }
    },

    placeFood() {
        let valid = false;
        let newFood = { x: 0, y: 0 };
        let attempts = 0;
        
        while (!valid && attempts < 100) {
            newFood = {
                x: Math.floor(Math.random() * this.tileCount),
                y: Math.floor(Math.random() * this.tileCount)
            };
            const onP1 = this.p1.body.some(s => s.x === newFood.x && s.y === newFood.y);
            const onP2 = this.p2.body.some(s => s.x === newFood.x && s.y === newFood.y);
            if (!onP1 && !onP2) {
                valid = true;
            }
            attempts++;
        }
        this.food = newFood;
    },

    draw() {
        if (!this.ctx) return;
        this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, 400, 400);
        this.ctx.strokeStyle = '#222'; this.ctx.lineWidth = 1;
        for(let i=0; i<this.tileCount; i++) {
            this.ctx.beginPath(); this.ctx.moveTo(i*20,0); this.ctx.lineTo(i*20,400); this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.moveTo(0,i*20); this.ctx.lineTo(400,i*20); this.ctx.stroke();
        }
        
        this.ctx.fillStyle = '#ffd700';
        this.ctx.fillRect(this.food.x * this.grid + 2, this.food.y * this.grid + 2, this.grid - 4, this.grid - 4);

        this.drawSnake(this.p1);
        this.drawSnake(this.p2);
    },

    drawSnake(p) {
        p.body.forEach((seg, i) => {
            this.ctx.fillStyle = (i === 0) ? '#ffffff' : p.color;
            this.ctx.fillRect(seg.x * this.grid + 1, seg.y * this.grid + 1, this.grid - 2, this.grid - 2);
        });
    },

    updateHUD() {
        // ★修正: Shared UIを使用
        Shared.UI.updateHUD(`P1: ${this.p1.score}`, `P2: ${this.p2.score}`);

        // タイムバー描画
        let bar = document.getElementById('snake-time-bar');
        if(!bar) {
            const container = document.getElementById('game-container');
            const box = document.createElement('div');
            box.style.cssText = "position:absolute; bottom:0; width:100%; height:5px; background:#333; z-index:10;";
            bar = document.createElement('div');
            bar.id = 'snake-time-bar';
            bar.style.cssText = "height:100%; background:#00f2ff; transition:width 0.1s;";
            box.appendChild(bar);
            container.appendChild(box);
        }
        bar.style.width = Math.max(0, this.timeLimit) + "%";
        bar.style.backgroundColor = (this.timeLimit < 30) ? '#ff0055' : '#00f2ff';
    },

    gameOver(msg, sendNet = true) {
        this.isPlaying = false;
        clearTimeout(this.timerId);
        Shared.Sound.preset('dead');
        
        // タイムバー削除
        const bar = document.getElementById('snake-time-bar');
        if(bar && bar.parentElement) bar.parentElement.remove();

        Shared.UI.show('screen-result');
        document.getElementById('res-title').innerText = msg;
        document.getElementById('res-detail').innerText = `SCORE: ${this.p1.score} vs ${this.p2.score}`;

        if (sendNet && this.mode.includes('online')) Shared.Net.send('over', { msg: msg }, true);
    },

    // ★修正: 関数名をonNetに
    onNet(data) {
        if (data.type === 'start') {
            this.food = data.payload.food;
            this.isPlaying = true;
            this.loop();
        }
        if (data.type === 'input') {
            const target = (this.role === 'p1') ? this.p2 : this.p1;
            target.nextDir = data.payload;
        }
        if (data.type === 'sync' && this.role === 'p2') {
            // ゲスト側でホストの座標・スコア・時間を正として同期
            this.p1.body = data.payload.p1Body;
            this.p2.body = data.payload.p2Body;
            this.p1.score = data.payload.p1Score;
            this.p2.score = data.payload.p2Score;
            this.timeLimit = data.payload.timeLimit;
        }
        if (data.type === 'food') this.food = data.payload;
        if (data.type === 'over') {
            if (this.isPlaying) this.gameOver(data.payload.msg, false);
        }
    },
        stop() {
        this.isPlaying = false;
        
        // タイマー停止
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }

        // タイムバー削除
        const bar = document.getElementById('snake-time-bar');
        if (bar && bar.parentElement) bar.parentElement.remove();
        
        // 十字キー非表示 (P1 & P2)
        Shared.UI.toggleLayout('ui-dpad', false);
        const p2Dpad = document.getElementById('ui-dpad-p2');
        if (p2Dpad) p2Dpad.style.display = 'none';

        // 通信コールバック解放
        if (Shared.Net) Shared.Net.onData = null;
    },
};

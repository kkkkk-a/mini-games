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

        // 入力初期化 (P1:矢印, P2:WASD)
        Shared.Input.init({
            'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
            'KeyW': 'up2', 'KeyS': 'down2', 'KeyA': 'left2', 'KeyD': 'right2',
            'up': 'up', 'down': 'down', 'left': 'left', 'right': 'right' // スマホボタン用
        });

        if (mode.includes('online')) {
            // ★修正: 関数名を onNet に統一
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
        this.p1.body = [{x:5, y:18}, {x:5, y:19}, {x:5, y:20}];
        this.p1.dir = {x:0, y:-1}; this.p1.nextDir = {x:0, y:-1};
        this.p1.score = 0;

        this.p2.body = [{x:14, y:1}, {x:14, y:0}, {x:14, y:-1}];
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

        this.timeLimit -= 0.2;
        if (this.timeLimit <= 0) return this.gameOver('TIME OVER');

        this.updateHUD();
    },

    handleInput() {
        // P1操作
        if (this.isMyControl('p1')) {
            const s = Shared.Input.state;
            let dx = 0, dy = 0;
            if (s.up)    { dx=0; dy=-1; }
            if (s.down)  { dx=0; dy=1; }
            if (s.left)  { dx=-1; dy=0; }
            if (s.right) { dx=1; dy=0; }

            if (dx !== 0 || dy !== 0) {
                if (this.p1.dir.x !== -dx && this.p1.dir.y !== -dy) {
                    this.p1.nextDir = {x:dx, y:dy};
                    // ★修正: 送信タイプを input に変更
                    if (this.mode.includes('online')) Shared.Net.send('input', this.p1.nextDir);
                }
            }
        }
        // P2操作 (Local)
        if (this.mode === 'local') {
            const s = Shared.Input.state;
            let dx = 0, dy = 0;
            if (s.up2)    { dx=0; dy=-1; }
            if (s.down2)  { dx=0; dy=1; }
            if (s.left2)  { dx=-1; dy=0; }
            if (s.right2) { dx=1; dy=0; }

            if ((dx !== 0 || dy !== 0) && (this.p2.dir.x !== -dx && this.p2.dir.y !== -dy)) {
                this.p2.nextDir = {x:dx, y:dy};
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
            this.placeFood();
            if (this.mode.includes('online')) Shared.Net.send('food', this.food);
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
        
        // 第一候補: エサに向かう
        let targetDir = p.dir;
        if (this.food.x > head.x && p.dir.x !== -1) targetDir = {x:1, y:0};
        else if (this.food.x < head.x && p.dir.x !== 1) targetDir = {x:-1, y:0};
        else if (this.food.y > head.y && p.dir.y !== -1) targetDir = {x:0, y:1};
        else if (this.food.y < head.y && p.dir.y !== 1) targetDir = {x:0, y:-1};
        
        p.nextDir = targetDir;

        // ★修正: 進んだ先が死ぬ場合（壁か体）、別の方向に逃げる（簡易回避AI）
        const nextX = head.x + p.nextDir.x;
        const nextY = head.y + p.nextDir.y;
        
        // 危険判定ヘルパー
        const isDanger = (x, y) => {
            if (x < 0 || x >= this.tileCount || y < 0 || y >= this.tileCount) return true;
            const hit = (body) => body.some(seg => seg.x === x && seg.y === y);
            return hit(this.p1.body) || hit(this.p2.body);
        };

        if (isDanger(nextX, nextY)) {
            // 4方向の中で安全なものを探す
            const safeDirs =[
                {x:1, y:0}, {x:-1, y:0}, {x:0, y:1}, {x:0, y:-1}
            ].filter(d => !isDanger(head.x + d.x, head.y + d.y) && (d.x !== -p.dir.x || d.y !== -p.dir.y));
            
            if (safeDirs.length > 0) {
                p.nextDir = safeDirs[Math.floor(Math.random() * safeDirs.length)];
            }
        }
    },

    placeFood() {
        this.food = { x: Math.floor(Math.random() * this.tileCount), y: Math.floor(Math.random() * this.tileCount) };
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

    gameOver(msg) {
        this.isPlaying = false;
        clearTimeout(this.timerId);
        Shared.Sound.preset('dead');
        
        // タイムバー削除
        const bar = document.getElementById('snake-time-bar');
        if(bar && bar.parentElement) bar.parentElement.remove();

        Shared.UI.show('screen-result');
        document.getElementById('res-title').innerText = msg;
        document.getElementById('res-detail').innerText = `SCORE: ${this.p1.score} vs ${this.p2.score}`;

        if (this.mode.includes('online')) Shared.Net.send('over', { msg: msg });
    },

    // ★修正: 関数名をonNetに
    onNet(data) {
        if (data.type === 'start') {
            this.food = data.payload.food;
            this.isPlaying = true;
            this.loop();
        }
        // ★修正: 受信タイプ input に対応
        if (data.type === 'input') {
            const target = (this.role === 'p1') ? this.p2 : this.p1;
            target.nextDir = data.payload;
        }
        if (data.type === 'food') this.food = data.payload;
        if (data.type === 'over') {
            if (this.isPlaying) this.gameOver(data.payload.msg);
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
        
        // 十字キー非表示
        Shared.UI.toggleLayout('ui-dpad', false);
    },
};

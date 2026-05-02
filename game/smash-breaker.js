/**
 * Neo Tactics - Smash Breaker (Fixed)
 */
window.SmashGame = {
    p1: { x:300, y:750, w:100, h:15, angle:0, baseAng:0, charge:0, kick:0, color:'#00f2ff' },
    p2: { x:300, y:50,  w:100, h:15, angle:0, baseAng:0, charge:0, kick:0, color:'#ff0055' },
    
    ball: { x:300, y:400, r:8, vx:0, vy:0, power:false },
    particles: [],
    isPlaying: false,

    init(mode) {
        this.mode = mode;
        this.role = mode==='online-guest' ? 'p2' : 'p1';
        
        const cvs = document.getElementById('main-cvs');
        this.ctx = cvs.getContext('2d');
        cvs.width = 600; cvs.height = 800;

        Shared.UI.show('screen-game');
Shared.UI.toggleLayout('ui-smash', true);
if (mode === 'local') {
    document.getElementById('ui-smash-p2').style.display = 'flex';
} else {
    document.getElementById('ui-smash-p2').style.display = 'none';
}
        Shared.UI.toggleLayout('ui-dpad', false);
        
        Shared.UI.msg("回転で角度調整 / ボタン長押しでチャージ");

        // ★修正: P2用のキーバインド(WASD)を追加
        Shared.Input.init({
            'ArrowLeft':'L', 'ArrowRight':'R', 
            'ArrowUp':'rotL', 'ArrowDown':'rotR',
            'ShiftRight':'chg', 'Space':'chg',
            'rotL':'rotL', 'rotR':'rotR', 'charge':'chg',
            // P2用
            'KeyA':'L2', 'KeyD':'R2', 'KeyW':'rotL2', 'KeyS':'rotR2', 'ShiftLeft':'chg2',
            'rotL2':'rotL2', 'rotR2':'rotR2', 'charge2':'chg2'
        });

        if (mode.includes('online')) Shared.Net.onData = (d) => this.onNet(d);
        this.reset();
        this.isPlaying = true;
        this.loop();
    },

    reset() {
        this.ball = { x:300, y:400, vx:Math.random()*4-2, vy:(this.role==='p1'?1:-1)*5, power:false };
        this.particles = [];
        this.p1.charge = 0; this.p2.charge = 0;
        this.p1.angle = 0; this.p2.angle = 0;
        if(this.mode==='online-host') Shared.Net.send('sync', {b:this.ball});
    },

    loop() {
        if(!this.isPlaying) return;
        
        // ヒットストップ中なら物理演算(update)をスキップし、描画だけ行う
        if (!Shared.VFX.isStopped()) {
            this.update();
        }
        this.draw();
        
        requestAnimationFrame(() => this.loop());
    },

    update() {
        const s = Shared.Input.state;
        
        // マルチタッチスワイプの振り分け
        let tx1 = null, tx2 = null;
        if (s.activeTouches) {
            s.activeTouches.forEach(t => {
                // 画面中心(y=400)を境にP1とP2のタッチを分離
                if (t.y > 400) tx1 = t.x;
                else tx2 = t.x;
            });
        }
        
        // P1操作
        this.updatePaddle(this.p1, s.L, s.R, s.rotL, s.rotR, s.chg, tx1);
        
        // P2操作
        if(this.mode==='local') {
            // P2は画面上部なので左右反転はさせない（画面の見た目通りに動かす）
            this.updatePaddle(this.p2, s.L2, s.R2, s.rotR2, s.rotL2, s.chg2, tx2); 
            // 注意: rotR2とrotL2を入れ替えているのは、P2が逆さま配置のため、
            // 「Wキー(rotL2)」で見た目上の左（システム上の右回転）に傾けるため
        } else if(this.mode==='npc') {
            const dest = this.ball.x + (Math.random()-0.5)*50;
            this.p2.x += (dest - this.p2.x) * 0.1;
            if(this.ball.y < 300 && this.ball.vy < 0) {
                this.p2.charge = Math.min(100, this.p2.charge+5);
            } else {
                this.p2.charge = 0;
            }
            // NPCのスナップバック処理は簡易的に
             if(this.p2.charge > 0 && this.ball.y > 100) { // 打つタイミング
                this.p2.kick = this.p2.charge / 100;
                this.p2.charge = 0;
             } else {
                 this.p2.kick *= 0.8;
             }
        }

        // ★修正: オンライン時の対戦相手の動きを滑らかに補間 (Interpolation)
        if (this.mode.includes('online')) {
            const my = this.role === 'p1' ? this.p1 : this.p2;
            const opp = this.role === 'p1' ? this.p2 : this.p1;
            
            // 自分の入力は送信
            Shared.Net.send('input', { x:my.x, a:my.angle, c:my.charge, k:my.kick });

            // 相手の動きは受信した目標値（targetX）に向かって滑らかに近づける
            if (opp.targetX !== undefined) {
                opp.x += (opp.targetX - opp.x) * 0.3;
                opp.angle += (opp.targetAngle - opp.angle) * 0.3;
            }
        }

        if(this.mode!=='online-guest') {
            const b = this.ball;
            const spdLimit = b.power ? 18 : 9;
            
            b.x += b.vx; b.y += b.vy;
            
            const vel = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
            if(vel > spdLimit) {
                b.vx = (b.vx/vel) * spdLimit;
                b.vy = (b.vy/vel) * spdLimit;
            }
            
            if(b.x<10 || b.x>590) {
                b.vx *= -1;
                this.spawnParticles(b.x, b.y, 5, '#fff');
            }
            
            this.hit(this.p1); this.hit(this.p2);
            
            if(b.y < -20) this.end('P1 WIN');
            if(b.y > 820) this.end('P2 WIN');
            
            if(this.mode==='online-host') Shared.Net.send('sync', {b:this.ball});
        }
        
        this.particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.life-=p.decay; });
        this.particles = this.particles.filter(p => p.life > 0);
    },

    updatePaddle(p, l, r, rotL, rotR, chg, tx) {
        if(tx !== undefined && tx !== null && p === this.p1) p.x += (tx - p.x) * 0.3;
        else if(l) p.x -= 9;
        else if(r) p.x += 9;
        p.x = Math.max(60, Math.min(540, p.x));

        if(rotL) p.baseAng = -0.4;
        else if(rotR) p.baseAng = 0.4;
        else p.baseAng = 0;

        if(chg) {
            p.charge = Math.min(100, p.charge + 4);
            const shake = (Math.random()-0.5) * (p.charge * 0.002);
            const cockingAngle = (p === this.p1 ? -1 : 1) * (p.charge / 100) * 0.8;
            p.angle = p.baseAng + cockingAngle + shake;
            p.kick = 0; 
        } else {
            if(p.charge > 0) {
                p.kick = p.charge / 100;
                p.charge = 0;
                Shared.Sound.play(150, 'sawtooth', 0.2);
            } else {
                p.kick *= 0.8;
            }
            const target = p.baseAng + (p === this.p1 ? 1 : -1) * p.kick * 0.5;
            p.angle += (target - p.angle) * 0.4;
        }
    },

    hit(p) {
        const b = this.ball;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const cos = Math.cos(-p.angle);
        const sin = Math.sin(-p.angle);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        
        if(Math.abs(lx) < 55 && Math.abs(ly) < 15) {
            const forwardDir = (p === this.p1) ? -1 : 1;
            if(p.kick > 0.2) {
                b.power = true;
                let angle = -Math.PI / 2 * forwardDir;
                angle += Math.max(-0.5, Math.min(0.5, p.angle * 0.8));
                const speed = 18;
                b.vx = Math.cos(angle + Math.PI/2 * (forwardDir===-1?0:2)) * speed; 
                b.vy = forwardDir * Math.abs(Math.sin(angle) * speed);
                b.vx += lx * 0.15;
                this.spawnParticles(b.x, b.y, 20, '#ffd700');
                Shared.Sound.preset('dead');
                
                // ★VFX: 強打時に画面を激しく揺らし、0.15秒時間を止め、フラッシュさせる
                Shared.VFX.shake('hard');
                Shared.VFX.flash();
                Shared.VFX.hitStop(150); 
            } else {
                b.power = false;
                b.vy = Math.abs(b.vy) * forwardDir;
                b.vx += (p.angle * 5) + (lx * 0.1);
                if(Math.abs(b.vy) < 4) b.vy = forwardDir * 4;
                this.spawnParticles(b.x, b.y, 5, p.color);
                Shared.Sound.preset('hit');
            }
            b.y = p.y + (forwardDir * 20);
        }
    },

    spawnParticles(x, y, n, col) {
        for(let i=0; i<n; i++) {
            this.particles.push({
                x:x, y:y, vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10,
                life:1.0, color:col, decay: 0.05
            });
        }
    },

    draw() {
    if (!this.ctx) return; // ★追加
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';

        this.ctx.fillRect(0,0,600,800);
        
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 3, 0, Math.PI*2); this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        [this.p1, this.p2].forEach(p => {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.angle);
            if(p.charge > 0) {
                this.ctx.shadowBlur = p.charge;
                this.ctx.shadowColor = '#fff';
                this.ctx.fillStyle = '#fff';
            } else {
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = p.color;
            }
            this.ctx.fillRect(-50, -8, 100, 16);
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath(); this.ctx.arc(0,0,4,0,Math.PI*2); this.ctx.fill();
            this.ctx.restore();
        });

        this.ctx.shadowBlur = this.ball.power ? 20 : 0;
        this.ctx.shadowColor = this.ball.power ? '#ffd700' : 'transparent';
        this.ctx.fillStyle = this.ball.power ? '#ffd700' : '#fff';
        this.ctx.beginPath(); this.ctx.arc(this.ball.x, this.ball.y, 10, 0, Math.PI*2); this.ctx.fill();
        this.ctx.shadowBlur = 0;
    },

    onNet(d) {
        if(d.type==='input') {
            const opp = this.role==='p1'?this.p2:this.p1;
            // ★修正: 直接上書きせず、目標値としてセットする
            opp.targetX = d.payload.x; 
            opp.targetAngle = d.payload.a; 
            opp.charge = d.payload.c; 
            opp.kick = d.payload.k;
        }
        if(d.type==='sync') this.ball = d.payload.b;
        if(d.type==='over') this.end(d.payload);
    },

    end(m) {
        this.isPlaying = false;
        Shared.UI.show('screen-result');
        document.getElementById('res-title').innerText = m;
    },
        stop() {
        this.isPlaying = false;
        // UIを非表示
        Shared.UI.toggleLayout('ui-smash', false);
        // 残っているパーティクルを消去（次回の描画に残らないように）
        this.particles = [];
    }
};

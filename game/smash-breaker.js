/**
 * Neo Tactics - Smash Breaker (Spring-Winding & Full WASD Support)
 */
window.SmashGame = {
    p1: { 
        x: 300, y: 750, baseY: 750, w: 100, h: 15, 
        angle: 0, charge: 0, kick: 0, windDir: 0, swingSpeed: 0, 
        color: '#00f2ff' 
    },
    p2: { 
        x: 300, y: 50, baseY: 50, w: 100, h: 15, 
        angle: 0, charge: 0, kick: 0, windDir: 0, swingSpeed: 0, 
        color: '#ff0055' 
    },
    
    ball: { x: 300, y: 400, r: 8, vx: 0, vy: 0, spin: 0, power: false },
    particles: [],
    isPlaying: false,
    animId: null,
    mode: null,
    role: 'p1',
    ctx: null,

    init(mode) {
        this.mode = mode;
        this.role = mode === 'online-guest' ? 'p2' : 'p1';
        
        const cvs = document.getElementById('main-cvs');
        this.ctx = cvs.getContext('2d');
        cvs.width = 600; 
        cvs.height = 800;

        Shared.UI.show('screen-game');
        Shared.UI.toggleLayout('ui-smash', true);
        
        if (mode === 'local') {
            const p2Smash = document.getElementById('ui-smash-p2');
            if (p2Smash) p2Smash.style.display = 'flex';
        } else {
            const p2Smash = document.getElementById('ui-smash-p2');
            if (p2Smash) p2Smash.style.display = 'none';
        }
        
        Shared.UI.toggleLayout('ui-dpad', false);
        Shared.UI.msg("↺/↻ 長押しでゼンマイチャージ！\n離して強打！");

        // キーバインド設定 (P1: 矢印キー & WASD / P2ローカル: WASD)
        Shared.Input.init({
            // 矢印キー
            'ArrowLeft': 'L',
            'ArrowRight': 'R',
            'ArrowUp': 'rotL',
            'ArrowDown': 'rotR',

            // WASDキー (P1メイン / ローカル対戦時はP2操作に切り替え)
            'KeyA': (mode === 'local' ? 'L2' : 'L'),
            'KeyD': (mode === 'local' ? 'R2' : 'R'),
            'KeyW': (mode === 'local' ? 'rotL2' : 'rotL'),
            'KeyS': (mode === 'local' ? 'rotR2' : 'rotR'),

            // スマホ画面用ボタン
            'rotL': 'rotL',
            'rotR': 'rotR',
            'rotL2': 'rotL2',
            'rotR2': 'rotR2'
        });

        if (mode.includes('online')) {
            Shared.Net.onData = (d) => this.onNet(d);
        }

        this.reset();
        this.isPlaying = true;
        this.loop();
    },

    reset() {
        this.ball = { 
            x: 300, 
            y: 400, 
            r: 8, 
            vx: Math.random() * 4 - 2, 
            vy: (this.role === 'p1' ? 1 : -1) * 5, 
            spin: 0, 
            power: false 
        };
        this.particles = [];
        
        this.p1.charge = 0; this.p1.kick = 0; this.p1.angle = 0; this.p1.swingSpeed = 0; this.p1.windDir = 0;
        this.p2.charge = 0; this.p2.kick = 0; this.p2.angle = 0; this.p2.swingSpeed = 0; this.p2.windDir = 0;
        
        if (this.mode === 'online-host') {
            Shared.Net.send('sync', { b: this.ball });
        }
    },

    loop() {
        if (!this.isPlaying) return;
        
        if (!Shared.VFX.isStopped()) {
            this.update();
        }
        this.draw();
        
        this.animId = requestAnimationFrame(() => this.loop());
    },

    update() {
        const s = Shared.Input.state;
        
        // タッチ操作の左右スワイプ座標取得
        let tx1 = null, tx2 = null;
        if (s.activeTouches) {
            s.activeTouches.forEach(t => {
                if (t.y > 400) tx1 = t.x;
                else tx2 = t.x;
            });
        }
        
        // P1操作更新
        this.updatePaddle(this.p1, s.L, s.R, s.rotL, s.rotR, tx1);
        
        // P2操作更新
        if (this.mode === 'local') {
            this.updatePaddle(this.p2, s.L2, s.R2, s.rotR2, s.rotL2, tx2);
        } else if (this.mode === 'npc') {
            // NPC AI
            const dest = this.ball.x + (Math.random() - 0.5) * 30;
            this.p2.x += (dest - this.p2.x) * 0.12;

            if (this.ball.y < 350 && this.ball.vy < 0) {
                // ボールが近づいてきたらゼンマイを巻き上げる
                const windChoice = this.ball.x > this.p2.x ? 'rotR' : 'rotL';
                this.updatePaddle(this.p2, false, false, windChoice === 'rotL', windChoice === 'rotR', null);
            } else {
                // 離してスイング
                this.updatePaddle(this.p2, false, false, false, false, null);
            }
        }

        // オンライン時の位置補間同期
        if (this.mode.includes('online')) {
            const my = this.role === 'p1' ? this.p1 : this.p2;
            const opp = this.role === 'p1' ? this.p2 : this.p1;
            
            Shared.Net.send('input', { 
                x: my.x, 
                a: my.angle, 
                c: my.charge, 
                k: my.kick,
                s: my.swingSpeed 
            });

            if (opp.targetX !== undefined) {
                opp.x += (opp.targetX - opp.x) * 0.35;
                opp.angle += (opp.targetAngle - opp.angle) * 0.35;
            }
        }

        // ホスト/ローカル/NPCにおけるボール物理演算
        if (this.mode !== 'online-guest') {
            const b = this.ball;
            const spdLimit = b.power ? 20 : 10;
            
            // スピンによるカーブ変化
            b.vx += (b.spin || 0) * 0.12;
            b.spin = (b.spin || 0) * 0.95;

            b.x += b.vx; 
            b.y += b.vy;
            
            const vel = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (vel > spdLimit) {
                b.vx = (b.vx / vel) * spdLimit;
                b.vy = (b.vy / vel) * spdLimit;
            }
            
            // 左右の壁反射
            if (b.x < 10) {
                b.x = 10;
                b.vx = Math.abs(b.vx);
                b.spin = -b.spin * 0.5;
                this.spawnParticles(b.x, b.y, 6, '#fff');
            } else if (b.x > 590) {
                b.x = 590;
                b.vx = -Math.abs(b.vx);
                b.spin = -b.spin * 0.5;
                this.spawnParticles(b.x, b.y, 6, '#fff');
            }
            
            this.hit(this.p1); 
            this.hit(this.p2);
            
            // 得点判定
            if (b.y < -20) this.end('P1 WIN!');
            if (b.y > 820) this.end('P2 WIN!');
            
            if (this.mode === 'online-host') {
                Shared.Net.send('sync', { b: this.ball });
            }
        }
        
        // パーティクル更新
        this.particles.forEach(p => { 
            p.x += p.vx; 
            p.y += p.vy; 
            p.life -= p.decay; 
        });
        this.particles = this.particles.filter(p => p.life > 0);
    },

    updatePaddle(p, l, r, rotL, rotR, tx) {
        // 左右移動
        if (tx !== undefined && tx !== null) {
            p.x += (tx - p.x) * 0.35;
        } else if (l) {
            p.x -= 9;
        } else if (r) {
            p.x += 9;
        }
        p.x = Math.max(60, Math.min(540, p.x));

        // ゼンマイ巻き上げ処理
        if (rotL) {
            // 反時計回りに巻き上げる
            p.windDir = -1;
            p.charge = Math.min(100, p.charge + 3.5);
            const maxAngle = 1.15; // 最大約66度
            const shake = (Math.random() - 0.5) * (p.charge * 0.003);
            p.angle = -(p.charge / 100) * maxAngle + shake;
            p.swingSpeed = 0;
        } else if (rotR) {
            // 時計回りに巻き上げる
            p.windDir = 1;
            p.charge = Math.min(100, p.charge + 3.5);
            const maxAngle = 1.15;
            const shake = (Math.random() - 0.5) * (p.charge * 0.003);
            p.angle = (p.charge / 100) * maxAngle + shake;
            p.swingSpeed = 0;
        } else {
            // ボタンを離した瞬間：蓄積パワーで逆方向へバチンとスナップバック（強打）
            if (p.charge > 0) {
                p.kick = p.charge / 100;
                // 巻き取った向きと逆方向に強力なスイング速度を与える
                p.swingSpeed = -p.windDir * (p.kick * 0.5);
                p.charge = 0;
                p.windDir = 0;
                Shared.Sound.play(180, 'sawtooth', 0.15, 0.2);
            }

            // スイング物理（慣性で振り切ったあと、水平へ戻る）
            p.angle += p.swingSpeed;
            p.swingSpeed *= 0.78;
            p.angle += (0 - p.angle) * 0.2;
            p.kick *= 0.8;
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
        
        // パドル矩形での当たり判定
        if (Math.abs(lx) < 55 && Math.abs(ly) < 18) {
            const forwardDir = (p === this.p1) ? -1 : 1;
            
            // スナップバックスイング中かどうかの判定
            const isSmash = Math.abs(p.swingSpeed) > 0.04 || p.kick > 0.2;

            if (isSmash) {
                b.power = true;
                const powerVal = Math.max(p.kick, Math.abs(p.swingSpeed) * 3);
                const smashSpeed = 16 + (powerVal * 6);
                
                // パドルの振り抜き角度とスイング速度を反映した強烈なスマッシュ
                const launchAngle = (p.angle * 0.85) + (p.swingSpeed * 3.5);
                b.vx = Math.sin(launchAngle) * smashSpeed;
                b.vy = Math.cos(launchAngle) * smashSpeed * forwardDir;
                
                // スイングの回転力をボールのスピン（カーブ）に転換
                b.spin = p.swingSpeed * 65;

                this.spawnParticles(b.x, b.y, 25, '#ffd700');
                Shared.Sound.preset('dead');
                
                Shared.VFX.shake('hard');
                Shared.VFX.flash();
                Shared.VFX.hitStop(120); 
            } else {
                b.power = false;
                const baseSpeed = Math.max(7, Math.abs(b.vy) * 1.05);
                const launchAngle = (p.angle * 0.7) + (lx * 0.01);
                b.vx = Math.sin(launchAngle) * baseSpeed;
                b.vy = Math.cos(launchAngle) * baseSpeed * forwardDir;
                b.spin = p.angle * 4;

                this.spawnParticles(b.x, b.y, 6, p.color);
                Shared.Sound.preset('hit');
            }

            // ボールのめり込み防止
            b.y = p.y + (forwardDir * 25);
        }
    },

    spawnParticles(x, y, n, col) {
        for (let i = 0; i < n; i++) {
            this.particles.push({
                x: x, 
                y: y, 
                vx: (Math.random() - 0.5) * 10, 
                vy: (Math.random() - 0.5) * 10,
                life: 1.0, 
                color: col, 
                decay: 0.05
            });
        }
    },

    draw() {
        if (!this.ctx) return;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, 600, 800);
        
        // パーティクル描画
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath(); 
            this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); 
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        // パドル描画
        [this.p1, this.p2].forEach(p => {
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.angle);
            
            if (p.charge > 0) {
                this.ctx.shadowBlur = p.charge * 0.4;
                this.ctx.shadowColor = '#ffd700';
                this.ctx.fillStyle = '#fff';
            } else {
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = p.color;
            }
            
            this.ctx.fillRect(-50, -8, 100, 16);
            
            // ゼンマイ軸の目印
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath(); 
            this.ctx.arc(0, 0, 4, 0, Math.PI * 2); 
            this.ctx.fill();
            this.ctx.restore();
        });

        // ボール描画
        this.ctx.shadowBlur = this.ball.power ? 25 : 0;
        this.ctx.shadowColor = this.ball.power ? '#ffd700' : 'transparent';
        this.ctx.fillStyle = this.ball.power ? '#ffd700' : '#ffffff';
        this.ctx.beginPath(); 
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.r || 8, 0, Math.PI * 2); 
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    },

    onNet(d) {
        if (d.type === 'input') {
            const opp = this.role === 'p1' ? this.p2 : this.p1;
            opp.targetX = d.payload.x; 
            opp.targetAngle = d.payload.a; 
            opp.charge = d.payload.c; 
            opp.kick = d.payload.k;
            opp.swingSpeed = d.payload.s;
        }
        if (d.type === 'sync') {
            this.ball = d.payload.b;
        }
        if (d.type === 'over') {
            this.end(d.payload, false);
        }
    },

    end(m, sendNet = true) {
        this.isPlaying = false;
        Shared.UI.show('screen-result');
        document.getElementById('res-title').innerText = m;
        document.getElementById('res-detail').innerText = "";
        
        if (sendNet && this.mode.includes('online')) {
            Shared.Net.send('over', m, true);
        }
    },

    stop() {
        this.isPlaying = false;
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
        
        Shared.UI.toggleLayout('ui-smash', false);
        const p2Smash = document.getElementById('ui-smash-p2');
        if (p2Smash) p2Smash.style.display = 'none';
        
        this.particles = [];
        if (this.ctx) {
            this.ctx.clearRect(0, 0, 600, 800);
        }
        
        if (Shared.Net) {
            Shared.Net.onData = null;
        }
    }
};